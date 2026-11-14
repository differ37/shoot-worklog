(function () {
  'use strict';
  const P = window.WorkLogParser;
  const KEY = 'worklog.memo.v1';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const SAMPLE = `업무 일지 (예시 — 가상의 데이터예요)

9/3(목)결제완료
블루필름//아이돌A - 첫 사랑
김감독 박퍼스트
3:파주 스튜디오(50) 0700집합, 2330종료
010-0000-0001 이OO PD

9/15~16(화수)결제완료
그린웍스/화장품 광고
최감독 정퍼스트
15:성수 스튜디오(55) 0800집합, 2200종료
16:남양주 세트장(45) 0600집합, 2500종료
010-0000-0002 한OO PD

10/7(수)미결
레드룸 // 밴드B 뮤직비디오
김감독 정퍼스트
일산 스튜디오
09:00~25:30
견적 500,000
010-0000-0003 오OO PD
ㅡ 친구가 견적 넣고 입금받으면 나한테 입금

10/21(수)미결
자동차 브랜드 광고
최감독 ?
21:인천 송도>영종도(60) 0400집합, 2100종료
입금 300,000

11/5(목)미결
블루필름//아이돌A - 두번째 이야기
김감독 박퍼스트
5:가평 펜션(50-철수만 50%) 1800도착, 2300종료
`;

  const state = {
    text: '', entries: [], year: 'all', month: 'all',
    listStatus: 'all', q: '', sort: 'desc', cal: null,
  };

  // ---------- 유틸 ----------
  const won = n => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR'));
  function man(n) {
    if (n == null) return '-';
    const m = n / 10000;
    return (Math.abs(m) >= 100 ? Math.round(m).toLocaleString('ko-KR') : (Math.round(m * 10) / 10).toLocaleString('ko-KR')) + '만';
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const daysSince = s => Math.round((today() - toDate(s)) / 86400000);
  const label = e => e.title || e.titleRaw || '(제목 없음)';
  const storage = {
    get() { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); return true; } catch (_) { return false; } },
  };

  // ---------- 데이터 ----------
  function setText(t, { save = true, from = '' } = {}) {
    state.text = t;
    state.entries = P.parse(t);
    if (save) {
      const ok = storage.set(t);
      $('#savedState').textContent = ok ? '저장됨 ✓' : '저장 실패 (브라우저 저장소 막힘)';
    }
    if (from !== 'memo' && $('#memo').value !== t) $('#memo').value = t;
    buildFilters();
    renderAll();
  }

  function filtered() {
    return state.entries.filter(e => {
      const [y, m] = e.dates[0].split('-');
      if (state.year !== 'all' && y !== state.year) return false;
      if (state.month !== 'all' && +m !== +state.month) return false;
      return true;
    });
  }

  function buildFilters() {
    const years = [...new Set(state.entries.map(e => e.dates[0].slice(0, 4)))].sort();
    const fy = $('#fYear');
    const prev = state.year;
    fy.innerHTML = `<option value="all">전체</option>` + years.map(y => `<option value="${y}">${y}년</option>`).join('');
    state.year = years.includes(prev) || prev === 'all' ? prev : 'all';
    fy.value = state.year;
    const fm = $('#fMonth');
    fm.innerHTML = `<option value="all">전체</option>` + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
    fm.value = state.month;
  }

  // ---------- 렌더 ----------
  function renderAll() {
    const es = filtered();
    const sub = state.entries.length
      ? `${state.entries.length}건 기록 · 마지막 작업 ${state.entries.map(e => e.dates[e.dates.length - 1]).sort().pop().replace(/-/g, '.')}`
      : '메모를 붙여넣으면 자동으로 정리돼요';
    $('#subline').textContent = sub;
    renderKpis(es);
    renderMonthChart(es);
    renderUnpaid();
    renderCalendar();
    renderBars(es);
    renderList();
    renderPreview();
  }

  function renderKpis(es) {
    const total = es.reduce((s, e) => s + (e.amount || 0), 0);
    const recv = es.reduce((s, e) => s + (e.received || 0), 0);
    const out = total - recv;
    const days = es.reduce((s, e) => s + e.dayCount, 0);
    const unpaidN = es.filter(e => e.outstanding > 0).length;
    const hrs = es.filter(e => e.hours != null);
    const hourDays = hrs.reduce((s, e) => s + e.dayCount, 0);
    const avgH = hourDays ? hrs.reduce((s, e) => s + e.hours, 0) / hourDays : null;
    const pctPaid = total ? Math.round(recv / total * 100) : 0;
    const scope = state.year === 'all' && state.month === 'all' ? '전체 기간' :
      `${state.year === 'all' ? '' : state.year + '년 '}${state.month === 'all' ? '' : state.month + '월'}`.trim();

    $('#kpis').innerHTML = `
      <div class="kpi hero">
        <div class="lbl">총 수입 · ${esc(scope)}</div>
        <div class="val">${won(total)}<span class="u">원</span></div>
        <div class="bar" role="img" aria-label="입금 ${pctPaid}%">
          ${recv ? `<i class="p" style="width:${pctPaid}%"></i>` : ''}${out ? `<i class="u" style="flex:1"></i>` : ''}
        </div>
        <div class="split">
          <span><i class="dot p"></i>입금 완료 <b>${won(recv)}원</b> (${pctPaid}%)</span>
          <span><i class="dot u"></i>미입금 <b>${won(out)}원</b></span>
        </div>
      </div>
      <div class="kpi">
        <div class="lbl"><i class="dot u"></i>아직 못 받은 돈</div>
        <div class="val">${man(out)}<span class="u">원</span></div>
        <div class="meta">${unpaidN}건 대기 중</div>
      </div>
      <div class="kpi">
        <div class="lbl"><i class="dot p"></i>입금 완료</div>
        <div class="val">${man(recv)}<span class="u">원</span></div>
        <div class="meta">${es.filter(e => e.status === 'paid').length}건 정산</div>
      </div>
      <div class="kpi">
        <div class="lbl">작업</div>
        <div class="val">${es.length}<span class="u">건</span> ${days}<span class="u">일</span></div>
        <div class="meta">작품 ${es.length}개 · 촬영일 ${days}일</div>
      </div>
      <div class="kpi">
        <div class="lbl">평균 일당</div>
        <div class="val">${days ? man(total / days) : '-'}<span class="u">원</span></div>
        <div class="meta">총 수입 ÷ 촬영일</div>
      </div>
      <div class="kpi">
        <div class="lbl">평균 근무시간</div>
        <div class="val">${avgH ? avgH.toFixed(1) : '-'}<span class="u">시간</span></div>
        <div class="meta">시간 적힌 ${hourDays}일 기준</div>
      </div>
      <div class="kpi">
        <div class="lbl">시간당</div>
        <div class="val">${avgH && days ? man(hrs.reduce((s, e) => s + (e.amount || 0), 0) / hrs.reduce((s, e) => s + e.hours, 0)) : '-'}<span class="u">원</span></div>
        <div class="meta">시간 적힌 작업만</div>
      </div>`;
  }

  // 월별 수입 (입금/미입금 누적 막대)
  function renderMonthChart(es) {
    $('#monthLegend').innerHTML = `<span><i class="dot p"></i>입금 완료</span><span><i class="dot u"></i>미입금</span>`;
    const box = $('#monthChart');
    if (!es.length) { box.innerHTML = `<div class="empty">표시할 작업이 없어요</div>`; $('#monthTable').innerHTML = ''; return; }
    const map = new Map();
    const months = es.map(e => e.month).sort();
    // 첫 달~마지막 달 사이 빈 달도 채움
    let [y, m] = months[0].split('-').map(Number);
    const [ly, lm] = months[months.length - 1].split('-').map(Number);
    while (y < ly || (y === ly && m <= lm)) {
      map.set(`${y}-${String(m).padStart(2, '0')}`, { paid: 0, unpaid: 0, n: 0, days: 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
    es.forEach(e => {
      const r = map.get(e.month);
      r.paid += e.received || 0; r.unpaid += e.outstanding || 0; r.n++; r.days += e.dayCount;
    });
    const rows = [...map.entries()];
    const max = Math.max(...rows.map(([, r]) => r.paid + r.unpaid), 1);
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;

    const W = 640, H = 240, L = 44, R = 8, T = 22, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const bw = Math.min(46, pw / rows.length * 0.56);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 수입 막대 차트">`;
    for (let v = 0; v <= top; v += step) {
      const yy = T + ph - v / top * ph;
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      svg += `<text class="axis" x="${L - 6}" y="${yy + 4}" text-anchor="end">${v ? man(v) : '0'}</text>`;
    }
    const multiYear = new Set(rows.map(([k]) => k.slice(0, 4))).size > 1;
    rows.forEach(([k, r], i) => {
      const cx = L + pw / rows.length * (i + .5);
      const x = cx - bw / 2;
      const hp = r.paid / top * ph, hu = r.unpaid / top * ph;
      const base = T + ph;
      const gap = hp && hu ? 2 : 0;
      svg += `<g class="col" data-k="${k}">`;
      svg += `<rect class="hit" x="${cx - pw / rows.length / 2}" y="${T}" width="${pw / rows.length}" height="${ph}" rx="6"/>`;
      if (hp) svg += barPath(x, base - hp, bw, hp, !hu, 'var(--paid)');
      if (hu) svg += barPath(x, base - hp - gap - hu, bw, hu, true, 'var(--unpaid)');
      const tot = r.paid + r.unpaid;
      if (tot) svg += `<text class="val" x="${cx}" y="${base - hp - hu - gap - 6}" text-anchor="middle">${man(tot)}</text>`;
      const [yy, mm] = k.split('-');
      svg += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${multiYear && (i === 0 || mm === '01') ? yy.slice(2) + '.' : ''}${+mm}월</text>`;
      svg += `</g>`;
    });
    svg += `</svg>`;
    box.innerHTML = svg;
    box.querySelectorAll('.col').forEach(g => {
      const r = map.get(g.dataset.k);
      const [yy, mm] = g.dataset.k.split('-');
      bindTip(g, () => `<b>${yy}년 ${+mm}월</b><div class="tr"><span>입금 완료</span><span>${won(r.paid)}원</span></div><div class="tr"><span>미입금</span><span>${won(r.unpaid)}원</span></div><div class="tr"><span>작업</span><span>${r.n}건 · ${r.days}일</span></div>`);
      g.addEventListener('click', () => { state.year = yy; state.month = String(+mm); $('#fYear').value = yy; $('#fMonth').value = String(+mm); renderAll(); });
    });
    $('#monthTable').innerHTML = `<table><thead><tr><th>월</th><th>작업</th><th>입금 완료</th><th>미입금</th><th>합계</th></tr></thead><tbody>${rows.map(([k, r]) => `<tr><td>${k.replace('-', '.')}</td><td>${r.n}건 ${r.days}일</td><td>${won(r.paid)}</td><td>${won(r.unpaid)}</td><td><b>${won(r.paid + r.unpaid)}</b></td></tr>`).join('')}</tbody></table>`;
  }
  function barPath(x, y, w, h, roundTop, fill) {
    // 위쪽만 둥근 막대 (기준선 쪽은 각지게)
    h = Math.max(h, 1);
    const r = Math.min(4, w / 2, h);
    if (!roundTop) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
    return `<path fill="${fill}" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z"/>`;
  }
  function niceStep(max) {
    const raw = max / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function renderUnpaid() {
    const list = state.entries.filter(e => e.outstanding > 0).sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
    const sum = list.reduce((s, e) => s + e.outstanding, 0);
    $('#unpaidSum').textContent = list.length ? `${won(sum)}원 · ${list.length}건` : '';
    const box = $('#unpaidList');
    if (!list.length) { box.innerHTML = `<div class="empty">🎉 못 받은 돈이 없어요</div>`; return; }
    box.innerHTML = list.map(e => {
      const age = daysSince(e.dates[e.dates.length - 1]);
      const who = e.via ? `${e.via} 통해 입금` : (e.contacts[0]?.name || e.production || '');
      return `<div class="urow" data-id="${e.id}">
        <div class="d">${e.dates[0].slice(5).replace('-', '/')}</div>
        <div class="t"><b>${esc(label(e))}</b><span>${esc(who)}${e.status === 'partial' ? ` · 일부 입금 ${man(e.received)}원` : ''}</span></div>
        <div class="r"><b>${won(e.outstanding)}</b>${age >= 0 ? `<span class="age ${age >= 45 ? 'old' : ''}">${age}일 경과</span>` : `<span class="age">예정</span>`}</div>
        <button class="mini btn-pay" data-pay="${e.id}">입금 확인</button>
      </div>`;
    }).join('');
  }

  function renderCalendar() {
    if (!state.cal) {
      const last = state.entries.map(e => e.dates[e.dates.length - 1]).sort().pop();
      const d = last ? toDate(last) : new Date();
      state.cal = { y: d.getFullYear(), m: d.getMonth() };
    }
    const { y, m } = state.cal;
    $('#calTitle').textContent = `${y}년 ${m + 1}월`;
    const byDay = new Map();
    state.entries.forEach(e => e.dates.forEach(ds => {
      if (!byDay.has(ds)) byDay.set(ds, []);
      byDay.get(ds).push(e);
    }));
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const nDays = new Date(y, m + 1, 0).getDate();
    const t = today();
    let html = WD.map(w => `<div class="wh">${w}</div>`).join('');
    for (let i = 0; i < startPad; i++) html += `<div class="c out"></div>`;
    for (let d = 1; d <= nDays; d++) {
      const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evs = byDay.get(ds) || [];
      const isToday = t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
      html += `<div class="c ${isToday ? 'today' : ''}"><span class="n">${d}</span>${evs.map(e =>
        `<span class="ev ${e.status === 'paid' ? 'p' : 'u'}" data-go="${e.id}" title="${esc(label(e))}">${esc(label(e))}</span>`).join('')}</div>`;
    }
    $('#calendar').innerHTML = html;
    $$('#calendar .ev').forEach(el => {
      const e = state.entries[+el.dataset.go];
      bindTip(el, () => tipFor(e));
    });
  }

  function tipFor(e) {
    return `<b>${esc(label(e))}</b>${e.production ? `<div>${esc(e.production)}</div>` : ''}
      <div class="tr"><span>금액</span><span>${won(e.amount)}원</span></div>
      <div class="tr"><span>상태</span><span>${statusText(e)}</span></div>
      ${e.places.length ? `<div>${esc(e.places.join(' / '))}</div>` : ''}`;
  }
  const statusText = e => e.status === 'paid' ? '입금 완료' : e.status === 'partial' ? '일부 입금' : '미입금';

  function renderBars(es) {
    const prod = new Map(), dop = new Map(), wk = Array(7).fill(0);
    es.forEach(e => {
      const k = e.production || label(e);
      const p = prod.get(k) || { v: 0, n: 0 }; p.v += e.amount || 0; p.n++; prod.set(k, p);
      if (e.crew[0]) { const d = dop.get(e.crew[0]) || { v: 0, n: 0 }; d.v += e.dayCount; d.n++; dop.set(e.crew[0], d); }
      e.dates.forEach(ds => wk[toDate(ds).getDay()]++);
    });
    hbars('#byProd', [...prod.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 8), v => man(v.v) + '원', (k, v) => `<b>${esc(k)}</b><div class="tr"><span>수입</span><span>${won(v.v)}원</span></div><div class="tr"><span>작업</span><span>${v.n}건</span></div>`);
    hbars('#byDop', [...dop.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 8), v => v.v + '일', (k, v) => `<b>${esc(k)} 감독</b><div class="tr"><span>함께한 날</span><span>${v.v}일 (${v.n}건)</span></div>`);
    const order = [1, 2, 3, 4, 5, 6, 0];
    hbars('#byWeekday', order.map(i => [WD[i] + '요일', { v: wk[i] }]), v => v.v + '일', (k, v) => `<b>${k}</b><div>${v.v}일 촬영</div>`, true);
  }
  function hbars(sel, rows, fmt, tip, keepZero) {
    const box = $(sel);
    rows = keepZero ? rows : rows.filter(r => r[1].v > 0);
    if (!rows.length) { box.innerHTML = `<div class="empty">데이터가 없어요</div>`; return; }
    const max = Math.max(...rows.map(r => r[1].v), 1);
    box.innerHTML = rows.map(([k, v], i) => `<div class="hrow" data-i="${i}"><span class="nm">${esc(k)}</span><span class="nv">${fmt(v)}</span><span class="tr"><i style="width:${v.v / max * 100}%"></i></span></div>`).join('');
    box.querySelectorAll('.hrow').forEach(el => { const [k, v] = rows[+el.dataset.i]; bindTip(el, () => tip(k, v)); });
  }

  function renderList() {
    let es = state.entries.slice();
    const f = filtered();
    const ids = new Set(f.map(e => e.id));
    es = es.filter(e => ids.has(e.id));
    if (state.listStatus === 'unpaid') es = es.filter(e => e.outstanding > 0);
    if (state.listStatus === 'paid') es = es.filter(e => e.status === 'paid');
    const q = state.q.trim().toLowerCase();
    if (q) es = es.filter(e => [e.titleRaw, e.production, e.places.join(' '), e.crew.join(' '), e.contacts.map(c => c.name).join(' '), e.notes.join(' ')].join(' ').toLowerCase().includes(q));
    if (state.sort === 'desc') es.sort((a, b) => b.dates[0].localeCompare(a.dates[0]));
    if (state.sort === 'asc') es.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
    if (state.sort === 'amt') es.sort((a, b) => (b.amount || 0) - (a.amount || 0));

    const box = $('#jobList');
    if (!state.entries.length) { box.innerHTML = `<div class="card empty">아직 기록이 없어요. <b>메모 편집</b> 탭에서 메모를 붙여넣어 주세요.</div>`; return; }
    if (!es.length) { box.innerHTML = `<div class="card empty">조건에 맞는 작업이 없어요</div>`; return; }
    box.innerHTML = es.map(jobCard).join('');
  }

  function fmtDays(e) {
    const ds = e.dates.map(toDate);
    const f = ds[0];
    return { md: `${f.getMonth() + 1}.${f.getDate()}`, wd: ds.map(d => WD[d.getDay()]).join('·'), more: ds.length > 1 ? `${ds.length}일간` : '' };
  }

  function jobCard(e) {
    const d = fmtDays(e);
    const days = e.days.length ? e.days.map(x => {
      const dd = toDate(x.date);
      const time = x.start != null || x.end != null ? `${P.fmtClock(x.start) || '?'}~${P.fmtClock(x.end) || '?'}` : '';
      return `<div class="dayline"><em>${dd.getMonth() + 1}/${dd.getDate()}</em> ${esc(x.place)} ${x.amount != null ? `<em>· ${man(x.amount)}${x.pct != null ? ` (${x.pct}%)` : ''}</em>` : ''} ${time ? `<em>· ${time}${x.hours ? ` (${x.hours.toFixed(1)}h)` : ''}</em>` : ''}</div>`;
    }).join('') : (e.places.length ? `<div>${esc(e.places.join(' / '))}</div>` : '');
    const time = !e.days.length && (e.start != null || e.end != null) ? `${P.fmtClock(e.start) || '?'} ~ ${P.fmtClock(e.end) || '?'}${e.hours ? ` · ${e.hours.toFixed(1)}시간` : ''}` : '';
    const contacts = e.contacts.map(c => `${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d]/g, ''))}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''} ${esc(c.name)}`).join('<br>');
    const crew = (e.crewRaw || []).length ? `촬영감독 ${esc(e.crewRaw[0])}${e.crewRaw[1] ? ` · 퍼스트 ${esc(e.crewRaw[1])}` : ''}` : '';
    const paid = e.status === 'paid';
    return `<article class="job" id="job-${e.id}">
      <div class="date"><div class="md">${d.md}</div><div class="wd">${d.wd}</div>${d.more ? `<div class="more">${d.more}</div>` : ''}</div>
      <div class="body">
        ${e.production ? `<div class="prod">${esc(e.production)}</div>` : ''}
        <div class="ttl"><b>${esc(label(e))}</b><span class="pill ${e.status}">${statusText(e)}</span></div>
        <ul class="info">
          ${days ? `<li><span>장소</span><div>${days}</div></li>` : ''}
          ${time ? `<li><span>시간</span><div>${time}</div></li>` : ''}
          ${crew ? `<li><span>팀</span><div>${crew}</div></li>` : ''}
          ${contacts ? `<li><span>연락</span><div>${contacts}</div></li>` : ''}
        </ul>
        ${e.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}
        ${e.warnings.map(w => `<div class="warn">⚠ ${esc(w)} — 메모에 (50) 또는 견적 500,000 처럼 적어주세요</div>`).join('')}
      </div>
      <div class="side">
        <div><div class="amt">${e.amount != null ? won(e.amount) + '원' : '금액 없음'}</div>
        <div class="src">${e.amountSource ? e.amountSource + ' 기준' : ''}${e.status === 'partial' ? ` · ${won(e.received)}원 받음` : ''}</div></div>
        <div class="acts">
          <button class="ghost" data-edit="${e.id}">${SYNC ? '노션 열기' : '메모 수정'}</button>
          ${paid ? `<button class="ghost" data-unpay="${e.id}">미결로</button>` : `<button class="btn-pay" data-pay="${e.id}">입금 확인</button>`}
        </div>
      </div>
    </article>`;
  }

  function renderPreview() {
    const box = $('#parsePreview');
    $('#parseCount').textContent = state.entries.length ? `${state.entries.length}건` : '';
    if (!state.entries.length) { box.innerHTML = `<div class="empty">왼쪽에 메모를 붙여넣으면<br>여기에 바로 정리돼요</div>`; return; }
    box.innerHTML = state.entries.map(e => `<div class="prow" data-line="${e.lineIndex}">
      <span class="d">${e.dates[0].slice(5).replace('-', '/')}${e.dayCount > 1 ? '+' + (e.dayCount - 1) : ''}</span>
      <span class="t"><i class="dot ${e.status === 'paid' ? 'p' : 'u'}"></i> ${esc(label(e))}</span>
      <span class="a ${e.amount == null ? 'w' : ''}">${e.amount == null ? '금액?' : man(e.amount)}</span></div>`).join('');
  }

  // ---------- 상호작용 ----------
  const tip = $('#tip');
  function bindTip(el, html) {
    el.addEventListener('mouseenter', ev => { tip.innerHTML = html(); tip.hidden = false; moveTip(ev); });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', () => { tip.hidden = true; });
  }
  function moveTip(ev) {
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  let toastTimer;
  function toast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>되돌리기</button>' : ''}`;
    t.hidden = false;
    if (undo) t.querySelector('button').onclick = () => { undo(); t.hidden = true; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  async function changeStatus(id, to) {
    const e = state.entries[id];
    const before = state.text;
    const msg = `“${label(e)}” ${to === '미결' ? '미결로 변경' : '입금 완료 처리'}`;
    setText(P.setStatus(state.text, e.lineIndex, to));
    if (!SYNC) { toast(msg, () => setText(before)); return; }
    try {
      const r = await api('/status', { method: 'POST', body: JSON.stringify({ lineIndex: e.lineIndex, headerRaw: e.headerRaw, status: to }) });
      if (!r.ok) throw new Error(r.reason === 'changed' ? '노션 내용이 바뀌어서 다시 불러왔어요. 한 번 더 눌러주세요' : '실패');
      toast(msg + ' · 노션에도 반영됨', () => changeStatusByHeader(P.setStatus(e.headerRaw, 0, to), e.lineIndex, to === '미결' ? '결제완료' : '미결'));
    } catch (err) {
      toast(err.message === '실패' ? '노션 반영 실패 — 다시 불러올게요' : err.message);
      pull();
    }
  }
  async function changeStatusByHeader(headerRaw, lineIndex, to) {
    setText(P.setStatus(state.text, lineIndex, to));
    try { await api('/status', { method: 'POST', body: JSON.stringify({ lineIndex, headerRaw, status: to }) }); toast('되돌렸어요'); }
    catch (_) { pull(); }
  }

  // ---------- 노션 동기화 ----------
  const SYNC = !!(window.WORKLOG_API && !/WORKERS_SUBDOMAIN/.test(window.WORKLOG_API));
  const PASS_KEY = 'worklog.pass';
  let pass = '';
  try { pass = localStorage.getItem(PASS_KEY) || ''; } catch (_) {}
  let lastPull = null, pulling = false, pageUrl = '';

  async function api(path, init = {}) {
    const r = await fetch(window.WORKLOG_API + path, { ...init, headers: { 'X-Pass': encodeURIComponent(pass), 'Content-Type': 'application/json' } });
    if (r.status === 401) { showLock('비밀번호가 맞지 않아요'); throw new Error('auth'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 409) throw new Error(d.error || '서버 오류');
    return d;
  }
  async function pull(quiet) {
    if (!pass) { showLock(); return; }
    if (pulling) return;
    pulling = true;
    if (!quiet) $('#syncInfo').innerHTML = '<span class="spin">↻</span> 불러오는 중';
    try {
      const d = await api('/memo');
      pageUrl = d.pageUrl; $('#btnNotion').href = pageUrl;
      lastPull = new Date();
      if (d.text !== state.text) setText(d.text);
      syncInfo();
    } catch (err) {
      if (err.message !== 'auth') $('#syncInfo').textContent = '불러오기 실패 (인터넷 확인) · 저장된 내용 표시 중';
    } finally { pulling = false; }
  }
  function syncInfo() {
    if (!lastPull) return;
    $('#syncInfo').textContent = `${lastPull.getHours()}:${String(lastPull.getMinutes()).padStart(2, '0')} 동기화`;
    $('#savedState').textContent = '노션 내용 (읽기 전용)';
  }
  function showLock(err) {
    $('#lock').hidden = false;
    $('#lockErr').textContent = err || '';
    setTimeout(() => $('#lockPass').focus(), 50);
  }

  function goEdit(lineIndex) {
    switchTab('memo');
    const ta = $('#memo');
    const lines = ta.value.split('\n');
    const start = lines.slice(0, lineIndex).join('\n').length + (lineIndex ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(start, start + (lines[lineIndex] || '').length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
    ta.scrollTop = Math.max(0, lineIndex * lh - 60);
  }

  function switchTab(t) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
    $('#filters').style.display = t === 'memo' ? 'none' : '';
    try { sessionStorage.setItem('worklog.tab', t); } catch (_) {}
    window.scrollTo({ top: 0 });
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-pay],[data-unpay],[data-edit],[data-go],.prow');
    if (!b) return;
    if (b.dataset.pay != null) changeStatus(+b.dataset.pay, '결제완료');
    else if (b.dataset.unpay != null) changeStatus(+b.dataset.unpay, '미결');
    else if (b.dataset.edit != null) { if (SYNC && pageUrl) window.open(pageUrl, '_blank'); else goEdit(state.entries[+b.dataset.edit].lineIndex); }
    else if (b.dataset.go != null) {
      tip.hidden = true;
      switchTab('list');
      state.listStatus = 'all'; state.q = ''; $('#q').value = '';
      $$('#statusChips button').forEach(x => x.classList.toggle('on', x.dataset.s === 'all'));
      state.year = 'all'; state.month = 'all'; $('#fYear').value = 'all'; $('#fMonth').value = 'all';
      renderAll();
      const el = $('#job-' + b.dataset.go);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    } else if (b.classList.contains('prow') && !SYNC) goEdit(+b.dataset.line);
  });

  $$('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#fYear').addEventListener('change', e => { state.year = e.target.value; renderAll(); });
  $('#fMonth').addEventListener('change', e => { state.month = e.target.value; renderAll(); });
  $$('#statusChips button').forEach(b => b.addEventListener('click', () => {
    state.listStatus = b.dataset.s;
    $$('#statusChips button').forEach(x => x.classList.toggle('on', x === b));
    renderList();
  }));
  $('#q').addEventListener('input', e => { state.q = e.target.value; renderList(); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
  $('#calPrev').addEventListener('click', () => { const c = state.cal; c.m--; if (c.m < 0) { c.m = 11; c.y--; } renderCalendar(); });
  $('#calNext').addEventListener('click', () => { const c = state.cal; c.m++; if (c.m > 11) { c.m = 0; c.y++; } renderCalendar(); });

  let memoTimer;
  $('#memo').addEventListener('input', e => {
    $('#savedState').textContent = '입력 중…';
    clearTimeout(memoTimer);
    memoTimer = setTimeout(() => setText(e.target.value, { from: 'memo' }), 350);
  });

  $('#btnExportL').addEventListener('click', () => $('#btnExport').click());
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([state.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    const t = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `업무일지_${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const t = await f.text();
    const before = state.text;
    setText(t);
    toast(`${f.name} 불러옴 (${state.entries.length}건)`, () => setText(before));
    e.target.value = '';
  });
  $('#btnSample').addEventListener('click', () => {
    const before = state.text;
    setText(SAMPLE);
    toast('예시를 넣었어요', () => setText(before));
  });

  // 테마
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  let theme = null;
  try { theme = localStorage.getItem('worklog.theme'); } catch (_) {}
  applyTheme(theme);
  $('#themeBtn').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    theme = dark ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem('worklog.theme', theme); } catch (_) {}
  });

  // 시작
  const saved = storage.get();
  setText(saved || '', { save: false });
  let startTab = saved || SYNC ? 'dash' : 'memo';
  try { startTab = sessionStorage.getItem('worklog.tab') || startTab; } catch (_) {}
  switchTab(startTab);
  if (SYNC) {
    document.body.classList.add('sync');
    $('#memo').readOnly = true;
    $('#lockForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      pass = $('#lockPass').value.trim();
      $('#lockErr').textContent = '확인 중…';
      try {
        const d = await api('/memo');
        try { localStorage.setItem(PASS_KEY, pass); } catch (_) {}
        $('#lock').hidden = true; $('#lockPass').value = '';
        pageUrl = d.pageUrl; $('#btnNotion').href = pageUrl; lastPull = new Date();
        setText(d.text); syncInfo();
      } catch (err) { if (err.message !== 'auth') $('#lockErr').textContent = '서버에 연결할 수 없어요'; }
    });
    $('#btnLock').addEventListener('click', ev => {
      ev.preventDefault();
      try { localStorage.removeItem(PASS_KEY); localStorage.removeItem(KEY); } catch (_) {}
      pass = ''; setText('', { save: false }); showLock();
    });
    $('#btnRefresh').addEventListener('click', () => pull());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(true); });
    window.addEventListener('focus', () => pull(true));
    setInterval(() => { if (!document.hidden) pull(true); }, 30000);
    pull();
  }
})();
