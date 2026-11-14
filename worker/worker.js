// 노션 페이지 <-> 업무일지 사이트 중계 서버 (Cloudflare Worker)
// secrets: NOTION_TOKEN, PASSCODE
const NV = '2022-06-28';
const TEXT_TYPES = ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item',
  'numbered_list_item', 'to_do', 'toggle', 'quote', 'callout', 'code'];

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const ok = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Pass',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function notion(env, path, init = {}) {
  const r = await fetch('https://api.notion.com/v1' + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NV, 'Content-Type': 'application/json' },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`notion ${r.status}: ${d.message || ''}`);
  return d;
}

async function allBlocks(env) {
  const out = [];
  let cursor;
  do {
    const d = await notion(env, `/blocks/${env.PAGE_ID}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    out.push(...d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return out;
}
const rtOf = b => (TEXT_TYPES.includes(b.type) ? b[b.type].rich_text || [] : []);
const textOf = b => rtOf(b).map(t => t.plain_text).join('');

async function readMemo(env) {
  const blocks = await allBlocks(env);
  const lines = [], map = [];
  let lastEdited = '';
  for (const b of blocks) {
    if (b.last_edited_time > lastEdited) lastEdited = b.last_edited_time;
    const t = textOf(b).replace(/\r/g, '');
    const parts = t.split('\n');
    map.push({ id: b.id, start: lines.length, count: parts.length });
    lines.push(...parts);
  }
  return { text: lines.join('\n'), lines, map, blocks, lastEdited };
}

// 헤더 줄의 상태 문구(미결/결제완료)를 바꿔서 노션 블록을 수정
async function setStatus(env, lineIndex, headerRaw, status) {
  const memo = await readMemo(env);
  if (memo.lines[lineIndex] !== headerRaw) return { ok: false, reason: 'changed' };
  const m = memo.map.find(x => lineIndex >= x.start && lineIndex < x.start + x.count);
  const block = memo.blocks.find(b => b.id === m.id);
  const close = headerRaw.indexOf(')', headerRaw.indexOf('('));
  const newLine = headerRaw.slice(0, close + 1) + status;
  // 블록 안에서 해당 줄의 문자 위치
  const blockLines = textOf(block).replace(/\r/g, '').split('\n');
  const rel = lineIndex - m.start;
  const lineStart = blockLines.slice(0, rel).reduce((s, l) => s + l.length + 1, 0);
  const from = lineStart + close + 1, to = lineStart + headerRaw.length;
  // rich_text 조각들을 따라가며 [from, to) 구간을 status 로 교체
  const out = [];
  let pos = 0, inserted = false;
  for (const seg of rtOf(block)) {
    const s = seg.plain_text, a = pos, z = pos + s.length;
    pos = z;
    const keep = (x, y) => s.slice(Math.max(0, x - a), Math.max(0, y - a));
    const before = z <= from ? s : keep(a, Math.min(z, from));
    const after = a >= to ? s : keep(Math.max(a, to), z);
    const mk = c => ({ type: 'text', text: { content: c, link: seg.type === 'text' ? seg.text.link : (seg.href ? { url: seg.href } : null) }, annotations: seg.annotations });
    if (z <= from || a >= to) { out.push(mk(s)); continue; }
    if (before) out.push(mk(before));
    if (!inserted) { out.push(mk(status)); inserted = true; }
    if (after) out.push(mk(after));
  }
  if (!inserted) out.push({ type: 'text', text: { content: status } });
  await notion(env, `/blocks/${block.id}`, { method: 'PATCH', body: JSON.stringify({ [block.type]: { rich_text: out } }) });
  return { ok: true, line: newLine };
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    let pass = req.headers.get('X-Pass') || '';
    try { pass = decodeURIComponent(pass); } catch (_) {}
    const norm = v => String(v || '').normalize('NFC').trim().toLowerCase();
    if (!env.PASSCODE || norm(pass) !== norm(env.PASSCODE)) {
      await new Promise(r => setTimeout(r, 400));
      return json({ error: 'auth' }, 401, h);
    }
    try {
      if (req.method === 'GET' && url.pathname === '/memo') {
        const m = await readMemo(env);
        return json({ text: m.text, lastEdited: m.lastEdited, pageUrl: `https://www.notion.so/${env.PAGE_ID}` }, 200, h);
      }
      if (req.method === 'POST' && url.pathname === '/status') {
        const b = await req.json();
        if (!['미결', '결제완료'].includes(b.status)) return json({ error: 'bad status' }, 400, h);
        const r = await setStatus(env, +b.lineIndex, String(b.headerRaw || ''), b.status);
        return json(r, r.ok ? 200 : 409, h);
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, h);
    }
  },
};
