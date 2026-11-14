// 메모장 형식의 업무일지를 구조화된 데이터로 바꾸는 파서
(function (root) {
  'use strict';

  const WD = '일월화수목금토';
  const HEADER = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})([^()\n]*)\(([^)]*)\)\s*(.*)$/;
  const YEAR_LINE = /^\s*(20\d{2})\s*년?\s*$/;
  const PHONE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const NOTE = /^\s*(ㅡ|—|-{1,2}\s|※|\*|#|메모[:：])/;
  const NAME_TOKEN = /^([가-힣]{2,4}|\?)$/;

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
  function weekdayOf(y, m, d) { return new Date(y, m - 1, d).getDay(); }

  function statusOf(s) {
    s = (s || '').replace(/\s/g, '');
    if (/부분/.test(s)) return 'partial';
    if (/미결|미입금|미정산|대기/.test(s)) return 'unpaid';
    if (/완료|완결|입금|결제|정산/.test(s)) return 'paid';
    return 'unpaid';
  }

  // "60" → 600,000 (만원 단위),  "500,000" → 500,000
  function toWon(str) {
    const raw = String(str).trim();
    const n = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(n)) return null;
    if (raw.includes(',') || n >= 10000) return Math.round(n);
    return Math.round(n * 10000);
  }

  // 시간 표기 파싱: "0820집합, 2330종료" / "7집29반종" / "10:00~26:30" / "06:40집합,29:30종료"
  function parseTimes(text) {
    let start = null, end = null;
    const t = text.replace(/\s+/g, ' ');
    const range = t.match(/(\d{1,2}):?(\d{2})\s*~\s*(\d{1,2}):?(\d{2})/);
    if (range) {
      start = +range[1] + +range[2] / 60;
      end = +range[3] + +range[4] / 60;
    }
    if (start == null) {
      const s = t.match(/(\d{1,2}):?(\d{2})?\s*(반)?\s*(집합|집(?!출)|콜|출근|도착)/);
      if (s) start = +s[1] + (s[2] ? +s[2] / 60 : 0) + (s[3] ? 0.5 : 0);
    }
    if (end == null) {
      const re = /(\d{1,2}):?(\d{2})?\s*(반)?\s*(종료|종|끝|마감|철수)/g;
      let m;
      while ((m = re.exec(t))) end = +m[1] + (m[2] ? +m[2] / 60 : 0) + (m[3] ? 0.5 : 0);
    }
    if (start == null && end == null) {
      const s = t.match(/^\s*(\d{1,2}):(\d{2})\s*(\(|출발|시작|$)/);
      if (s) start = +s[1] + +s[2] / 60;
    }
    let hours = null;
    if (start != null && end != null) {
      hours = end - start;
      if (hours <= 0) hours += 24;
      if (hours > 30) hours = null;
    }
    return { start, end, hours };
  }

  function fmtClock(h) {
    if (h == null) return '';
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${pad(hh)}:${pad(mm)}`;
  }

  function pickYear(m, d, wdChar, ctx) {
    if (ctx.explicitYear) return ctx.explicitYear;
    const wd = WD.indexOf(wdChar);
    const thisYear = ctx.today.getFullYear();
    if (wd >= 0) {
      const cands = [];
      for (let y = thisYear - 6; y <= thisYear + 1; y++) if (weekdayOf(y, m, d) === wd) cands.push(y);
      if (cands.length) {
        const ref = ctx.prevYear || thisYear;
        cands.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref) || b - a);
        return cands[0];
      }
    }
    if (ctx.prevYear) return (ctx.prevMonth && m < ctx.prevMonth - 6) ? ctx.prevYear + 1 : ctx.prevYear;
    return thisYear;
  }

  function parse(text, opts) {
    const today = (opts && opts.today) || new Date();
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const entries = [];
    const ctx = { today, explicitYear: null, prevYear: null, prevMonth: null };
    let cur = null;

    lines.forEach((line, i) => {
      const ym = line.match(YEAR_LINE);
      if (ym) { ctx.explicitYear = +ym[1]; cur = null; return; }
      const h = line.match(HEADER);
      if (h) {
        cur = { lineIndex: i, headerRaw: line, body: [] };
        cur.h = h;
        entries.push(cur);
        return;
      }
      if (cur) cur.body.push({ text: line, index: i });
    });

    return entries.map((e, idx) => {
      const h = e.h;
      const m = +h[1], d = +h[2];
      const extra = h[3] || '';
      const wdChars = (h[4] || '').replace(/[^일월화수목금토]/g, '');
      const y = pickYear(m, d, wdChars[0], ctx);
      ctx.prevYear = y; ctx.prevMonth = m;

      // 헤더 날짜 목록
      let dayNums = [d];
      const rangeM = extra.match(/~\s*(?:(\d{1,2})\s*\/\s*)?(\d{1,2})/);
      const listM = extra.match(/((?:\s*,\s*\d{1,2})+)/);
      if (rangeM) {
        const endD = +rangeM[2];
        const endM = rangeM[1] ? +rangeM[1] : (endD < d ? m + 1 : m);
        const out = [];
        let dt = new Date(y, m - 1, d);
        const last = new Date(y, endM - 1, endD);
        while (dt <= last && out.length < 40) { out.push(new Date(dt)); dt.setDate(dt.getDate() + 1); }
        e.headerDates = out;
      } else if (listM) {
        dayNums = dayNums.concat(listM[1].split(',').map(s => s.trim()).filter(Boolean).map(Number));
        e.headerDates = dayNums.map(n => new Date(y, (n < d ? m : m - 1), n));
      } else {
        e.headerDates = [new Date(y, m - 1, d)];
      }
      const toIso = dt => iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());

      const entry = {
        id: idx,
        lineIndex: e.lineIndex,
        headerRaw: e.headerRaw,
        statusRaw: (h[5] || '').trim(),
        status: statusOf(h[5]),
        dates: e.headerDates.map(toIso),
        production: '', title: '', titleRaw: '',
        crew: [], days: [], places: [], notes: [],
        contacts: [], quote: null, override: null, partials: [],
        start: null, end: null,
        warnings: [],
      };

      const body = e.body.map(b => b.text).filter(t => t.trim() !== '');
      let titleDone = false, crewChecked = false;
      const loose = [];

      body.forEach((raw, bi) => {
        const t = raw.trim();

        if (NOTE.test(t)) {
          const note = t.replace(NOTE, '').trim();
          entry.notes.push(note);
          const mo = note.match(/(\d+(?:\.\d+)?)\s*만\s*(원)?\s*(받|입금|정산)/);
          if (mo) entry.override = Math.round(parseFloat(mo[1]) * 10000);
          return;
        }

        if (!titleDone) {
          titleDone = true;
          entry.titleRaw = t;
          let prod = '', title = t;
          if (t.includes('//')) { [prod, title] = t.split('//'); }
          else {
            const k = t.indexOf('/');
            if (k > 0 && k <= 20) { prod = t.slice(0, k); title = t.slice(k + 1); }
          }
          entry.production = prod.trim();
          entry.title = title.trim();
          return;
        }

        if (!crewChecked) {
          crewChecked = true;
          const toks = t.split(/\s+/);
          if (toks.length >= 1 && toks.length <= 3 && toks.every(x => NAME_TOKEN.test(x)) && !PHONE.test(t)) {
            entry.crew = toks.filter(x => x !== '?');
            entry.crewRaw = toks;
            return;
          }
        }

        const q = t.match(/(견적|금액|페이|단가)\s*[:：]?\s*([\d,.]+)\s*(만)?/);
        if (q) {
          entry.quote = q[3] ? Math.round(parseFloat(q[2]) * 10000) : toWon(q[2]);
          return;
        }
        const pm = t.match(/^(입금|부분입금|선금)\s*[:：]?\s*([\d,.]+)\s*(만)?/);
        if (pm) {
          entry.partials.push(pm[3] ? Math.round(parseFloat(pm[2]) * 10000) : toWon(pm[2]));
          return;
        }

        const phone = t.match(PHONE), email = t.match(EMAIL);
        if (phone || email) {
          const who = t.replace(PHONE, '').replace(EMAIL, '').trim();
          entry.contacts.push({ phone: phone ? phone[0] : '', email: email ? email[0] : '', name: who });
          return;
        }

        // 일자별 라인: "22:화성로얄앤컴퍼니(50) 0820집합, 2330종료" / "29화:북리탈리(30)" / "14 종로 ...(45)"
        const dm = t.match(/^(\d{1,2})\s*([일월화수목금토])?\s*[:：]?\s*([^\d:：].*)$/);
        if (dm && /\(/.test(t)) {
          const rest = dm[3];
          const parens = [...rest.matchAll(/\(([^)]*)\)/g)];
          let amount = null, pct = null, memo = '';
          parens.forEach(p => {
            const inner = p[1];
            const num = inner.match(/^\s*([\d,.]+)/);
            if (num) {
              amount = toWon(num[1]);
              const pc = inner.match(/(\d{1,3})\s*%/);
              pct = pc ? +pc[1] : null;
              memo = inner.replace(/^\s*[\d,.]+\s*[-–:]?\s*/, '').trim();
            }
          });
          const placeEnd = rest.indexOf('(');
          const place = (placeEnd >= 0 ? rest.slice(0, placeEnd) : rest).trim();
          const after = rest.slice(rest.lastIndexOf(')') + 1);
          const tm = parseTimes(after);
          const dayNum = +dm[1];
          const firstHeader = e.headerDates[0];
          let dm_ = firstHeader.getMonth();
          let dy = firstHeader.getFullYear();
          if (dayNum < firstHeader.getDate() - 7) { dm_ += 1; }
          const date = new Date(dy, dm_, dayNum);
          entry.days.push({
            date: toIso(date), place: normPlace(place), amountBase: amount, pct,
            amount: amount != null ? Math.round(amount * (pct != null ? pct / 100 : 1)) : null,
            memo, start: tm.start, end: tm.end, hours: tm.hours,
          });
          return;
        }

        const tm = parseTimes(t);
        if (tm.start != null || tm.end != null) {
          if (tm.start != null && entry.start == null) entry.start = tm.start;
          if (tm.end != null) entry.end = tm.end;
          return;
        }
        if (/입금|견적|받|전달|예정|연락|정산|메모/.test(t)) { entry.notes.push(t); return; }
        loose.push(t);
      });

      entry.places = entry.days.length ? entry.days.map(x => x.place) : loose.map(normPlace);
      if (entry.days.length) {
        if (!entry.days.some(x => x.start != null) && (entry.start != null || entry.end != null) && entry.days.length === 1) {
          const dd = entry.days[0];
          dd.start = entry.start; dd.end = entry.end;
          if (dd.start != null && dd.end != null) { let hh = dd.end - dd.start; if (hh <= 0) hh += 24; dd.hours = hh; }
        }
        // 날짜 목록은 실제 일자 라인 기준이 우선
        const uniq = [...new Set(entry.days.map(x => x.date))];
        if (uniq.length >= entry.dates.length || entry.dates.length === 1) entry.dates = uniq.sort();
      }

      // 금액 결정
      const dayAmounts = entry.days.filter(x => x.amount != null);
      let amount = null, source = '';
      if (entry.override != null) { amount = entry.override; source = '메모'; }
      else if (entry.quote != null) { amount = entry.quote; source = '견적'; }
      else if (dayAmounts.length) { amount = dayAmounts.reduce((s, x) => s + x.amount, 0); source = '일자별'; }
      entry.amount = amount;
      entry.amountSource = source;
      if (amount == null) entry.warnings.push('금액을 찾지 못했어요');

      // 작업시간
      let hours = 0, hasHours = false;
      entry.days.forEach(x => { if (x.hours != null) { hours += x.hours; hasHours = true; } });
      if (!hasHours && entry.start != null && entry.end != null) {
        let hh = entry.end - entry.start; if (hh <= 0) hh += 24;
        hours = hh * entry.dates.length; hasHours = true;
      }
      entry.hours = hasHours ? Math.round(hours * 10) / 10 : null;
      if (entry.start == null && entry.days[0]) entry.start = entry.days[0].start;
      if (entry.end == null && entry.days.length) entry.end = entry.days[entry.days.length - 1].end;

      // 입금
      const partialSum = entry.partials.reduce((s, x) => s + (x || 0), 0);
      if (entry.status === 'paid') entry.received = amount || 0;
      else entry.received = Math.min(partialSum, amount || partialSum);
      if (partialSum > 0 && entry.status !== 'paid') entry.status = 'partial';
      entry.outstanding = Math.max(0, (amount || 0) - entry.received);

      // 대리 입금 경로 ("신훈이가 견적 넣고 입금받으면 나한테 입금")
      const via = entry.notes.join(' ').match(/([가-힣]{2,3}?)(?:이가|형이|누나가|가)\s[^.]*?나(?:한테|에게)/);
      entry.via = via ? via[1] : '';

      entry.dayCount = entry.dates.length;
      entry.month = entry.dates[0].slice(0, 7);
      return entry;
    });
  }

  function normPlace(p) {
    return p.replace(/\s*>\s*/g, ' → ').replace(/\s+/g, ' ').trim();
  }

  // 헤더 상태 문구만 바꾼 새 메모 텍스트 반환
  function setStatus(text, lineIndex, newStatus) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const line = lines[lineIndex];
    const h = line && line.match(HEADER);
    if (!h) return text;
    const close = line.indexOf(')', line.indexOf('('));
    lines[lineIndex] = line.slice(0, close + 1) + newStatus;
    return lines.join('\n');
  }

  const api = { parse, setStatus, parseTimes, fmtClock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorkLogParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
