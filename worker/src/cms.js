// The keeper's control of his two sites (سيرته: seeratuh.com, الدرر السنية: dorarnajdiah.com), from inside each site (edit mode)
// and from push.seeratuh.com/c. Nothing works without his key (the same key as the notice page /o; only its SHA-256 is kept).
//
// Two kinds of change:
//  - text corrections (a text of the site's data, or the site's own wording): kept here as waiting (cms:<time>), then written
//    into the site's repository by its workflow (.github/workflows/cms.yml) within minutes, checked, and published;
//  - the site's settings, applied at once without publishing: pausing the site with a message, hiding any part of it,
//    adding text after any place, and whole new sections (cfg:<site>). Every reader's page asks /st?s=<site> on opening.
// The workflows prove which repository they run in with GitHub's own signed token (OIDC), so no password is kept anywhere.
import { isOwner, whoIs, OWNER_H } from './owner.js';
import PAGE from './cms_page.js';

const SITES = { sira: { origin: 'https://seeratuh.com', repo: 'itheoryofmind/sira' }, durar: { origin: 'https://dorarnajdiah.com', repo: 'itheoryofmind/durar' } };
const P = 'cms:';
const okSite = (s) => Object.prototype.hasOwnProperty.call(SITES, s);
function H(req) {
  const o = req.headers.get('Origin') || '';
  const allow = Object.values(SITES).some((x) => x.origin === o) ? o : 'https://seeratuh.com';
  return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Access-Control-Allow-Origin': allow, 'Vary': 'Origin' };
}
const okFile = (f) => f === 'ui' || (typeof f === 'string' && /^[a-z0-9_]{1,40}\.json$/.test(f));   // ui: the site's own wording
const okPath = (p) => Array.isArray(p) && p.length > 0 && p.length <= 24 && p.every((x) => (typeof x === 'string' && x.length <= 4000) || (Number.isInteger(x) && x >= 0));
const okText = (s) => typeof s === 'string' && s.length <= 300000;
const str = (x, n) => String(x == null ? '' : x).slice(0, n);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function all(env) {
  const L = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: P, cursor }); for (const x of l.keys) L.push(x); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return L;
}
const siteOf = (x) => (x.metadata && x.metadata.s) || 'sira';

/* ---------- the home message's sound or video: kept here in pieces of 20 MB, served with ranges ---------- */
const MD_CH = 20 * 1024 * 1024, MD_MAX = 10;
async function dropMedia(env, id) {
  const md = await env.PUSH.get('md:' + id, 'json'); if (!md) return;
  for (let i = 0; i < md.n; i++) await env.PUSH.delete('md:' + id + ':' + i);
  await env.PUSH.delete('md:' + id);
}
export async function mediaFetch(req, env, u) {
  const mt = u.pathname.match(/^\/m\/([a-z0-9]{8,40})$/); if (!mt || (req.method !== 'GET' && req.method !== 'HEAD')) return null;
  const md = await env.PUSH.get('md:' + mt[1], 'json');
  if (!md || !md.done) return new Response('', { status: 404 });
  const size = md.size, h = { 'Content-Type': md.ct, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' };
  let a = 0, e = size - 1, part = false;
  const rg = (req.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (rg) {
    if (rg[1] === '' && rg[2] !== '') { a = Math.max(0, size - +rg[2]); } else { a = +rg[1]; if (rg[2] !== '') e = Math.min(+rg[2], size - 1); }
    if (a >= size || a > e) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    e = Math.min(e, a + MD_CH - 1); part = true;   // at most one piece's length per answer; the player asks for the rest
  }
  h['Content-Length'] = String(e - a + 1);
  if (part) h['Content-Range'] = 'bytes ' + a + '-' + e + '/' + size;
  if (req.method === 'HEAD') return new Response(null, { status: part ? 206 : 200, headers: h });
  const first = Math.floor(a / MD_CH), last = Math.floor(e / MD_CH);
  const body = new ReadableStream({
    async start(ctl) {
      for (let i = first; i <= last; i++) {
        const buf = await env.PUSH.get('md:' + mt[1] + ':' + i, 'arrayBuffer'); if (!buf) break;
        const lo = i === first ? a - i * MD_CH : 0, hi = i === last ? e - i * MD_CH + 1 : buf.byteLength;
        ctl.enqueue(new Uint8Array(buf, lo, hi - lo));
      }
      ctl.close();
    }
  });
  return new Response(body, { status: part ? 206 : 200, headers: h });
}

/* ---------- the settings of a site ---------- */
const EMPTY = () => ({ pause: { on: false }, hide: [], add: [], pages: [] });
async function getCfg(env, s) {
  let c = await env.PUSH.get('cfg:' + s, 'json');
  if (!c && s === 'sira') { const p = await env.PUSH.get('pause', 'json'); c = EMPTY(); if (p) c.pause = p; }   // the first pause, kept before the settings existed
  c = Object.assign(EMPTY(), c || {});
  // 2026-10-18, the keeper's word: on the Durar site readers choose only «تلقائي» and نجد (once; he can change it from the panel after)
  if (s === 'durar' && !c.m1) { c.pick = (c.pick || []).filter((x) => x !== 'base'); if (!c.pick.includes('najd')) c.pick.push('najd'); c.m1 = 1; await env.PUSH.put('cfg:durar', JSON.stringify(c)); }
  return c;
}
async function putCfg(env, s, c) {
  c.v = Date.now();
  await env.PUSH.put('cfg:' + s, JSON.stringify(c));
  try { await caches.default.delete(new Request('https://push.seeratuh.com/st?s=' + s)); } catch (e) {}
}
// what «تلقائي» means in each design when the reader has not chosen a mode himself: the device's (auto), always white, or always night
const DZM_DEF = { haram: 'white' };
// what a reader's page receives: the pause, the hidden parts, the added texts and sections (nothing else)
function pub(c) {
  return { on: !!c.pause.on, msg: c.pause.on ? c.pause.msg : '', np: !!(c.pause.on && c.pause.np), hide: c.hide.map((h) => ({ id: h.id, sel: h.sel, fp: h.fp, sec: h.sec })),
    add: c.add.map((a) => ({ id: a.id, sel: a.sel, fp: a.fp, sec: a.sec, k: a.k, t: a.t })),
    note: (c.note && c.note.on && !(c.note.from && Date.now() < c.note.from) && !(c.note.to && Date.now() >= c.note.to)) ? { t: c.note.t || '', m: c.note.m || null, v: c.note.at || 0 } : null, tsk: c.tsk !== false, isn: !!c.isn, srch: !!c.srch, dz: c.dz || '', dzm: Object.assign({}, DZM_DEF, c.dzm || {}), dzv: c.dzv || {}, pick: c.pick || ['base', 'haram'], noimg: !!c.noimg, noimgb: Array.isArray(c.noimgb) ? c.noimgb : [], lnk: Array.isArray(c.lnk) ? c.lnk.map((x) => [x.f, x.p, x.i, x.k, x.s, x.a, x.z]) : [], pages: c.pages.filter((p) => !p.off).map((p) => ({ id: p.id, sel: p.sel, fp: p.fp, sec: p.sec, title: p.title, sub: p.sub, blocks: p.blocks })), v: c.v || 0 };
}
const okRule = (r) => r && typeof r.sel === 'string' && /^[a-z][a-z0-9]{0,11}(\.[A-Za-z_][A-Za-z0-9_-]{0,39})?$/.test(r.sel) && typeof r.fp === 'string' && /^[0-9a-z]{4,40}$/.test(r.fp) && typeof r.sec === 'string' && r.sec.length <= 200;
const okBlocks = (b) => Array.isArray(b) && b.length <= 400 && b.every((x) => x && ['h', 'p', 'q'].includes(x.k) && typeof x.t === 'string' && x.t.length <= 20000);

/* ---------- GitHub's signed token: which repository's workflow is asking ---------- */
let JWKS = null, JWKS_T = 0;
const b64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function oidcSite(tok) {
  try {
    const [h, p, sg] = String(tok || '').split('.'); if (!sg) return null;
    const hd = JSON.parse(new TextDecoder().decode(b64u(h))), cl = JSON.parse(new TextDecoder().decode(b64u(p)));
    if (hd.alg !== 'RS256') return null;
    const keys = async () => { JWKS = (await (await fetch('https://token.actions.githubusercontent.com/.well-known/jwks')).json()).keys; JWKS_T = Date.now(); };
    if (!JWKS || Date.now() - JWKS_T > 3600e3) await keys();
    let jwk = JWKS.find((k) => k.kid === hd.kid);
    if (!jwk && Date.now() - JWKS_T > 60e3) { await keys(); jwk = JWKS.find((k) => k.kid === hd.kid); }
    if (!jwk || jwk.kty !== 'RSA') return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(sg), new TextEncoder().encode(h + '.' + p));
    const now = Date.now() / 1000;
    if (!ok || cl.iss !== 'https://token.actions.githubusercontent.com' || cl.aud !== 'seeratuh-cms' || !(cl.exp > now) || !(cl.nbf == null || cl.nbf <= now + 60)) return null;
    const repo = String(cl.repository || '').toLowerCase();
    for (const [s, x] of Object.entries(SITES)) if (x.repo === repo) return s;
  } catch (e) {}
  return null;
}

/* ---------- the reader's question, on opening any page of either site ---------- */
export async function pauseFetch(req, env, u) {
  if (u.pathname !== '/st') return null;
  const s = okSite(u.searchParams.get('s')) ? u.searchParams.get('s') : 'sira';
  const ck = new Request('https://push.seeratuh.com/st?s=' + s);
  let r = null; try { r = await caches.default.match(ck); } catch (e) {}
  if (!r) {
    r = new Response(JSON.stringify(pub(await getCfg(env, s))), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=20' } });
    try { await caches.default.put(ck, r.clone()); } catch (e) {}
  }
  const o = req.headers.get('Origin') || '';
  const h = new Headers(r.headers); h.set('Access-Control-Allow-Origin', Object.values(SITES).some((x) => x.origin === o) ? o : SITES[s].origin); h.set('Vary', 'Origin'); h.set('Cache-Control', 'no-store');
  return new Response(r.body, { headers: h });
}
// while a site is paused with «and the notifications» chosen, its scheduled notifications are not sent
export async function pushPaused(env, s) { const c = await getCfg(env, s || 'sira'); return !!(c.pause && c.pause.on && c.pause.np); }

export async function cmsFetch(req, env, u) {
  if (u.pathname !== '/c' && !u.pathname.startsWith('/c/')) return null;
  const out = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: H(req) });
  if (u.pathname === '/c' && req.method === 'GET')
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
  if (req.method !== 'POST') return null;

  // the workflows: the waiting corrections of their own site, and the result of each
  if (u.pathname === '/c/pending' || u.pathname === '/c/done' || u.pathname === '/c/report' || u.pathname === '/c/wkctl' || u.pathname === '/c/wkst') {
    let s = await oidcSite(req.headers.get('X-OIDC'));
    if (!s) { const k = await env.PUSH.get('admin'); if (k && req.headers.get('X-Admin') === k) s = 'sira'; }
    if (!s) return out({ ok: false }, 403);
    if (u.pathname === '/c/pending') {
      const now = Date.now();
      const L = (await all(env)).filter((x) => x.metadata && siteOf(x) === s && (x.metadata.st === 'p' || (x.metadata.st === 't' && now - (x.metadata.tk || 0) > 20 * 60e3)));
      const edits = [];
      for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (!v) continue; edits.push({ id: x.name, ...v }); await env.PUSH.put(x.name, JSON.stringify({ ...v, st: 't' }), { metadata: { ...x.metadata, st: 't', tk: now } }); }
      return out({ ok: true, site: s, edits });
    }
    if (u.pathname === '/c/wkctl') {   // the weekly check asks: run now? stop? which notes did he set aside for good?
      if (s !== 'sira') return out({ ok: false }, 403);
      const ign = []; let cur;
      do { const l = await env.PUSH.list({ prefix: 'wk:', cursor: cur }); for (const k of l.keys) if (k.metadata && k.metadata.c === 'ignore') ign.push(k.name.slice(3)); cur = l.list_complete ? null : l.cursor; } while (cur);
      return out({ ok: true, ctl: (await env.PUSH.get('wkctl', 'json')) || { auto: true }, st: (await env.PUSH.get('wkst', 'json')) || {}, ign });
    }
    if (u.pathname === '/c/wkst') {   // and says how it goes
      if (s !== 'sira') return out({ ok: false }, 403);
      let r; try { r = await req.json(); } catch (e) { return out({ ok: false }, 400); }
      const st = { ...((await env.PUSH.get('wkst', 'json')) || {}), ...(r && typeof r === 'object' ? r : {}), t: Date.now() };
      await env.PUSH.put('wkst', JSON.stringify(st));
      return out({ ok: true });
    }
    if (u.pathname === '/c/report') {   // a word to the keeper's phone from his site's own workflows: what was published, what was refused, a weekly check
      let r; try { r = await req.json(); } catch (e) { return out({ ok: false }, 400); }
      const t = str(r.t, 80), m = str(r.b, 700);
      if (!t || !m) return out({ ok: false, bad: 1 }, 400);
      const n = await ownerAlert(env, null, 0, { t: SNAME[s] + ' · ' + t, b: m, u: PANEL, tag: 'own-cms-' + s + (r.tag ? '-' + str(r.tag, 20) : '') });
      return out({ ok: true, sent: n });
    }
    let b; try { b = await req.json(); } catch (e) { return out({ ok: false }, 400); }
    const id = str(b.id, 80);
    const v = id.startsWith(P) ? await env.PUSH.getWithMetadata(id, 'json') : null;
    if (!v || !v.value || (v.value.s || 'sira') !== s) return out({ ok: false }, 404);
    const st = b.st === 'ok' ? 'ok' : 'err';
    await env.PUSH.put(id, JSON.stringify({ ...v.value, st, msg: str(b.msg, 400), sha: str(b.sha, 40), at2: Date.now() }), { metadata: { ...v.metadata, st } });
    return out({ ok: true });
  }

  if (u.pathname === '/c/up') {
    let f; try { f = await req.formData(); } catch (e) { return out({ ok: false }, 400); }
    if (!(await isOwner(f.get('k'), env))) return out({ ok: false }, 403);
    const s = okSite(f.get('s')) ? f.get('s') : 'sira', part = f.get('f'), i = +f.get('i'), n = +f.get('n'), size = +f.get('size'), ct = str(f.get('ct'), 80);
    if (!part || typeof part === 'string' || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > MD_MAX || i < 0 || i >= n || !/^(audio|video)\/[a-z0-9.+-]{1,40}$/i.test(ct) || !(size > 0 && size <= MD_CH * MD_MAX)) return out({ ok: false, bad: 1 }, 400);
    let id = str(f.get('id'), 40);
    if (i === 0) { id = rid() + Math.random().toString(36).slice(2, 6); await env.PUSH.put('md:' + id, JSON.stringify({ s, ct, size, n, got: 0, done: false, at: Date.now() })); }
    const md = /^[a-z0-9]{8,40}$/.test(id) ? await env.PUSH.get('md:' + id, 'json') : null;
    if (!md || md.n !== n || md.got !== i) return out({ ok: false, bad: 1 }, 400);
    const buf = await part.arrayBuffer();
    if (buf.byteLength > MD_CH || (i < n - 1 && buf.byteLength !== MD_CH)) return out({ ok: false, bad: 1 }, 400);
    await env.PUSH.put('md:' + id + ':' + i, buf);
    md.got = i + 1; md.done = md.got === n; await env.PUSH.put('md:' + id, JSON.stringify(md));
    return out({ ok: true, id, done: md.done });
  }
  if (u.pathname === '/c/fx') {   // the weekly check of the text against its fingerprints (fidelity.yml), with the deploy's key
    const k = await env.PUSH.get('admin');
    if (!k || req.headers.get('X-Admin') !== k) return out({ ok: false }, 403);
    let b; try { b = await req.json(); } catch (e) { return out({ ok: false }, 400); }
    const s = okSite(b.s) ? b.s : 'sira', ch = Array.isArray(b.changed) ? b.changed.slice(0, 500) : [];
    // a text the keeper corrected from the edit mode is his, not a change against the source
    const mine = new Set();
    for (const x of (await all(env)).filter((x) => siteOf(x) === s)) { const v = await env.PUSH.get(x.name, 'json'); if (v && v.st === 'ok') mine.add(v.f + '|' + JSON.stringify(v.path)); }
    const bad = ch.filter((c) => !mine.has(c.f + '|' + JSON.stringify(c.p)));
    const r = { at: Date.now(), total: +b.total || 0, changed: ch.length, bad: bad.length, miss: +b.miss || 0, first: bad.slice(0, 5) };
    await env.PUSH.put('fxres:' + s, JSON.stringify(r));
    if (bad.length || r.miss) await ownerAlert(env, 'fx' + s, 6 * 3600e3, { t: 'فحص أمانة النقل · ' + SNAME[s], b: 'وجد الفحص الأسبوعي ' + (bad.length ? bad.length + ' نصاً يخالف النص المفحوص' : '') + (r.miss ? (bad.length ? ' و' : '') + r.miss + ' ملفاً لا يُقرأ' : '') + '. افتح «فحص أمانة النقل» في اللوحة.', u: PANEL, tag: 'own-fx' });
    return out({ ok: true, ...r });
  }
  if (u.pathname === '/c/pairgo') {   // the keeper's phone, with the code the panel showed (public, a few tries per address)
    const ip = req.headers.get('CF-Connecting-IP') || '';
    const rk = 'rlp:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pair' + ip)))].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
    const tries = +(await env.PUSH.get(rk)) || 0;
    if (tries >= 5) return out({ ok: false, wait: 1 }, 429);
    let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
    const code = String(b && b.code || '');
    const ok = /^\d{6}$/.test(code) && (await env.PUSH.get('pair:' + code));
    if (!ok) { await env.PUSH.put(rk, String(tries + 1), { expirationTtl: 600 }); return out({ ok: false }); }
    await env.PUSH.delete('pair:' + code);
    const r = await osubSet(env, b.sub, 'sira');
    return out(r);
  }
  if (u.pathname === '/c/fb') return fbIn(req, env, out);
  if (u.pathname === '/c/hit') return hitIn(req, env, out);
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  const who = await whoIs(b && b.k, env);
  if (!who) { await logAuth(env, req, false, u.pathname); return out({ ok: false }, 403); }
  const HP = who.helper ? who.helper.perms : null;
  if (HP && !helperMay(u.pathname, b, HP)) return out({ ok: false, perm: 1 }, 403);
  const s = okSite(b.s) ? b.s : 'sira';
  if (u.pathname === '/c/hi' && b.login) await logAuth(env, req, true, u.pathname + (who.helper ? ' · ' + who.helper.name : ''));
  { const r = await panelExtra(u, b, s, env, out, who); if (r) return r; }

  // a new key: its fingerprint replaces the old one at once (the key itself never reaches here)
  if (u.pathname === '/c/key') {
    const nh = str(b.nh, 64);
    if (!/^[0-9a-f]{64}$/.test(nh)) return out({ ok: false, bad: 1 }, 400);
    await env.PUSH.put('ownerh', nh);
    return out({ ok: true });
  }
  if (u.pathname === '/c/hi') { const c = await getCfg(env, s); return out({ ok: true, site: s, pause: c.pause, cfg: c, ...(who.helper ? { helper: who.helper } : {}) }); }
  if (u.pathname === '/c/list') {
    const L = (await all(env)).filter((x) => siteOf(x) === s).slice(-80).reverse();
    const r = [];
    for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (v) r.push({ id: x.name, ...v }); }
    return out({ ok: true, edits: r });
  }
  if (u.pathname === '/c/save') {
    const { f, path, old, nw } = b;
    if (!okFile(f) || !okPath(path) || !okText(old) || !okText(nw) || old === nw) return out({ ok: false, bad: 1 }, 400);
    const AL = await all(env);
    const same = AL.filter((x) => x.metadata && (x.metadata.st === 'p' || x.metadata.st === 't') && x.metadata.f === f && siteOf(x) === s);
    if (!b.force) for (const x of same) { const v = await env.PUSH.get(x.name, 'json'); if (v && JSON.stringify(v.path) === JSON.stringify(path)) return out({ ok: false, busy: 1 }); }
    const id = P + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const q = HP && !HP.pub;   // a helper who may not publish by himself: kept for the keeper's approval
    const v = { s, f, path, old, nw, note: (who.helper ? '[' + who.helper.name + '] ' : '') + str(b.note, 300), lb: str(b.lb, 200), sec: str(b.sec, 120), rv: b.rv ? str(b.rv, 60) : '', force: b.force ? 1 : 0, st: q ? 'q' : 'p', at: Date.now(), ...(who.helper ? { by: who.helper.name } : {}) };
    await env.PUSH.put(id, JSON.stringify(v), { metadata: { st: q ? 'q' : 'p', f, s } });
    if (q) { await ownerAlert(env, 'hq', 30 * 60e3, { t: 'تعديل ينتظر موافقتك', b: who.helper.name + ': ' + (v.lb || f) }); return out({ ok: true, id, queued: 1 }); }
    await ghRun(env, s, 'cms.yml');
    const fin = AL.filter((x) => x.metadata && (x.metadata.st === 'ok' || x.metadata.st === 'err'));
    for (const x of fin.slice(0, Math.max(0, AL.length - 300))) await env.PUSH.delete(x.name);
    return out({ ok: true, id });
  }
  if (u.pathname === '/c/cancel') {
    const id = str(b.id, 80);
    const v = await env.PUSH.getWithMetadata(id);
    if (!id.startsWith(P) || !v || !v.metadata || v.metadata.st !== 'p' || siteOf({ metadata: v.metadata }) !== s) return out({ ok: false });
    await env.PUSH.delete(id);
    return out({ ok: true });
  }
  // the settings: one action at a time, applied at once
  if (u.pathname === '/c/cfg') {
    const c = await getCfg(env, s), a = b.a, at = Date.now();
    if (a === 'pause') {
      const on = !!b.on, msg = str(b.msg, 1000).trim();
      if (on && !msg) return out({ ok: false, bad: 1 }, 400);
      c.pause = { on, msg: on ? msg : c.pause.msg || '', np: on && !!b.np, t: at };
    } else if (a === 'hide') {
      if (!okRule(b.r)) return out({ ok: false, bad: 1 }, 400);
      if (!c.hide.some((h) => h.sel === b.r.sel && h.fp === b.r.fp && h.sec === b.r.sec)) c.hide.push({ id: rid(), sel: b.r.sel, fp: b.r.fp, sec: b.r.sec, lb: str(b.lb, 300), at });
      if (c.hide.length > 2000) return out({ ok: false, full: 1 }, 400);
    } else if (a === 'unhide') {
      c.hide = c.hide.filter((h) => h.id !== b.id);
    } else if (a === 'add') {
      if (!['h', 'p', 'q'].includes(b.kind) || !okText(b.t) || !String(b.t).trim()) return out({ ok: false, bad: 1 }, 400);
      if (b.id) { const x = c.add.find((x) => x.id === b.id); if (!x) return out({ ok: false }, 404); x.k = b.kind; x.t = String(b.t); x.at2 = at; }
      else { if (!okRule(b.r)) return out({ ok: false, bad: 1 }, 400); c.add.push({ id: rid(), sel: b.r.sel, fp: b.r.fp, sec: b.r.sec, k: b.kind, t: String(b.t), lb: str(b.lb, 300), at }); }
      if (c.add.length > 2000) return out({ ok: false, full: 1 }, 400);
    } else if (a === 'unadd') {
      c.add = c.add.filter((x) => x.id !== b.id);
    } else if (a === 'page') {
      const p = b.p || {};
      if (!str(p.title, 200).trim() || !okBlocks(p.blocks)) return out({ ok: false, bad: 1 }, 400);
      if (p.id) { const x = c.pages.find((x) => x.id === p.id); if (!x) return out({ ok: false }, 404); Object.assign(x, { title: str(p.title, 200), sub: str(p.sub, 300), blocks: p.blocks, off: !!p.off, at2: at }); }
      else { if (!okRule(b.r)) return out({ ok: false, bad: 1 }, 400); c.pages.push({ id: rid(), sel: b.r.sel, fp: b.r.fp, sec: b.r.sec, title: str(p.title, 200), sub: str(p.sub, 300), blocks: p.blocks, lb: str(b.lb, 300), at }); }
      if (c.pages.length > 200) return out({ ok: false, full: 1 }, 400);
    } else if (a === 'note') {
      const t = str(b.t, 3000).trim(), m = b.m && typeof b.m === 'object' ? b.m : null, on = !!b.on;
      let mm = null;
      if (m && m.k === 'y' && /^[A-Za-z0-9_-]{11}$/.test(String(m.u || ''))) mm = { k: 'y', u: m.u };
      else if (m && (m.k === 'a' || m.k === 'v') && /^[a-z0-9]{8,40}$/.test(String(m.u || ''))) { const md = await env.PUSH.get('md:' + m.u, 'json'); if (!md || !md.done) return out({ ok: false, bad: 1 }, 400); mm = { k: m.k, u: m.u, ct: md.ct }; }
      else if (m && m.k) return out({ ok: false, bad: 1 }, 400);
      if (on && !t && !mm) return out({ ok: false, bad: 1 }, 400);
      const old = c.note && c.note.m;
      if (old && (old.k === 'a' || old.k === 'v') && (!mm || mm.u !== old.u)) await dropMedia(env, old.u);
      const from = Number.isFinite(+b.from) && +b.from > 0 ? +b.from : 0, to = Number.isFinite(+b.to) && +b.to > 0 ? +b.to : 0;
      if (from && to && to <= from) return out({ ok: false, bad: 1 }, 400);
      c.note = { on, t, m: mm, at, from, to };
    } else if (a === 'tsk') {
      c.tsk = !!b.on;
    } else if (a === 'isn' || a === 'srch') {
      // features the keeper tries first and then shows to readers: the isnad tree, the search of the books
      c[a] = !!b.on;
    } else if (a === 'noimg') {
      c.noimg = !!b.on;
    } else if (a === 'lnk') {
      // a verse link chosen by the keeper for a quotation that stands in more than one place of the mushaf
      const e = b.e || {}, n = (x) => Number.isInteger(x) && x >= 0 && x < 100000;
      if (!okFile(e.f) || !n(e.p) || !n(e.i) || !n(e.k) || (b.on && !(n(e.s) && e.s >= 1 && e.s <= 114 && n(e.a) && n(e.z) && e.a >= 1 && e.z >= e.a))) return out({ ok: false, bad: 1 }, 400);
      const key = e.f + ':' + e.p + ':' + e.i + ':' + e.k;
      c.lnk = (Array.isArray(c.lnk) ? c.lnk : []).filter((x) => x.key !== key);
      if (b.on) c.lnk.push({ key, f: e.f, p: e.p, i: e.i, k: e.k, s: e.s, a: e.a, z: e.z, at });
      if (c.lnk.length > 5000) return out({ ok: false, full: 1 }, 400);
    } else if (a === 'noimgb') {
      const k = str(b.k, 12);
      if (!/^[a-z0-9]{1,12}$/.test(k)) return out({ ok: false, bad: 1 }, 400);
      const L = new Set(Array.isArray(c.noimgb) ? c.noimgb : []);
      if (b.on) L.add(k); else L.delete(k);
      c.noimgb = [...L].slice(0, 200);
    } else if (a === 'design') {
      const id = str(b.id, 30);
      if (id && !/^[a-z]{2,20}$/.test(id)) return out({ ok: false, bad: 1 }, 400);
      c.dz = id;
    } else if (a === 'dzmode') {
      const id = str(b.id, 30) || 'base', m = str(b.m, 10);
      if (!/^[a-z]{2,20}$/.test(id) || !['auto', 'white', 'night'].includes(m)) return out({ ok: false, bad: 1 }, 400);
      c.dzm = Object.assign({}, c.dzm || {}); c.dzm[id] = m;
    } else if (a === 'dzvar') {
      const id = str(b.id, 30), v = str(b.v, 2);
      if (!/^[a-z]{2,20}$/.test(id) || (v && !/^[a-z]$/.test(v))) return out({ ok: false, bad: 1 }, 400);
      c.dzv = Object.assign({}, c.dzv || {}); if (v) c.dzv[id] = v; else delete c.dzv[id];
    } else if (a === 'pick') {
      const id = str(b.id, 30) || 'base';
      if (!/^[a-z]{2,20}$/.test(id)) return out({ ok: false, bad: 1 }, 400);
      const P = (c.pick || ['base', 'haram']).filter((x) => x !== id); if (b.on) P.push(id); c.pick = P;
    } else if (a === 'unpage') {
      c.pages = c.pages.filter((x) => x.id !== b.id);
    } else return out({ ok: false }, 400);
    if (new TextEncoder().encode(JSON.stringify(c)).length > 1.5e6) return out({ ok: false, full: 1 }, 400);
    await putCfg(env, s, c);
    return out({ ok: true, cfg: c, pause: c.pause });
  }
  return out({ ok: false }, 404);
}


/* ---------- سجل الدخول: every opening of the panel with the key, and every try with a wrong key ---------- */
export async function logAuth(env, req, ok, path) {
  try {
    const L = (await env.PUSH.get('log', 'json')) || [], now = Date.now();
    if (!ok) { const last = L.find((x) => !x.ok); if (last && now - last.t < 30e3) { last.n = (last.n || 1) + 1; await env.PUSH.put('log', JSON.stringify(L)); return; } }
    const cf = req.cf || {}, ua = req.headers.get('User-Agent') || '';
    const dev = /iPhone/.test(ua) ? 'آيفون' : /iPad/.test(ua) ? 'آيباد' : /Android/.test(ua) ? 'أندرويد' : /Mac OS X/.test(ua) ? 'ماك' : /Windows/.test(ua) ? 'ويندوز' : 'جهاز آخر';
    L.unshift({ t: now, ok: !!ok, cc: str(cf.country, 4), city: str(cf.city, 60), dev, p: str(path, 20), n: 1 });
    await env.PUSH.put('log', JSON.stringify(L.slice(0, 80)));
    if (!ok) await ownerAlert(env, 'bad', 3600e3, { t: 'لوحة التحكم', b: 'محاولة دخول بمفتاح خاطئ' + (cf.city ? ' من ' + cf.city : '') + ' (' + dev + '). إن لم تكن أنت فغيّر المفتاح.', u: PANEL, tag: 'own-bad' });
  } catch (e) {}
}

/* ---------- the keeper's own alerts, on the devices he marked (osub:…): a wrong key, a reader's note, a site down, the week ---------- */
async function osubSet(env, sub, s) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { ok: false, bad: 1 };
  const id = 'osub:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint)))].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
  await env.PUSH.put(id, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), { metadata: { at: Date.now(), s } });
  const n = await ownerAlert(env, null, 0, { t: 'تنبيهات لوحة التحكم', b: 'رُبط هذا الجهاز: محاولات الدخول الخاطئة، وملاحظات القرّاء، وتعطّل أحد الموقعين، ونتيجة فحص الأمانة، وملخص كل جمعة.', u: 'https://push.seeratuh.com/c', tag: 'own-on' });
  return { ok: true, on: true, sent: n };
}
let NOTIFY = null;
export function setNotify(f) { NOTIFY = f; }
export async function ownerAlert(env, key, gapMs, msg) {
  try {
    if (!NOTIFY) return 0;
    if (key) { const k = 'oa:' + key; if (await env.PUSH.get(k)) return 0; await env.PUSH.put(k, '1', { expirationTtl: Math.max(60, Math.round(gapMs / 1000)) }); }
    return await NOTIFY(env, msg);
  } catch (e) { return 0; }
}
const SNAME = { sira: 'سِيرَتُه', durar: 'الدرر السنية' };
const PANEL = 'https://push.seeratuh.com/c';

/* ---------- ملاحظات القرّاء: a copy of each note a reader sends from the site (the e-mail still goes), to read here ---------- */
async function fbIn(req, env, out) {
  if (req.method !== 'POST') return out({ ok: false }, 405);
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ipk = 'rl:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fb' + ip)))].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  if (await env.PUSH.get(ipk)) return out({ ok: false, wait: 1 }, 429);
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  const s = okSite(b.s) ? b.s : 'sira', m = str(b.m, 4000).trim();
  if (!m && !b.img) return out({ ok: false, bad: 1 }, 400);
  let img = '';
  if (typeof b.img === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.img) && b.img.length <= 900000) img = b.img;
  const at = Date.now(), id = 'fb:' + at + '-' + rid();
  await env.PUSH.put(id, JSON.stringify({ s, ty: str(b.ty, 60), m, who: str(b.who, 200), ref: str(b.ref, 600), url: str(b.url, 300), ver: str(b.ver, 40), img, at }), { metadata: { s, st: 'n', at } });
  await env.PUSH.put(ipk, '1', { expirationTtl: 60 });
  await ownerAlert(env, 'fb', 10 * 60e3, { t: 'ملاحظة من قارئ · ' + SNAME[s], b: (b.ty ? str(b.ty, 60) + ': ' : '') + m.slice(0, 140), u: PANEL, tag: 'own-fb' });
  return out({ ok: true });
}
async function fbAll(env) {
  const L = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: 'fb:', cursor }); for (const x of l.keys) L.push(x); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return L;
}

/* ---------- القراءة: how often each part is opened; each device sends its own day's counts once (nothing about the reader) ---------- */
async function hitIn(req, env, out) {
  if (req.method !== 'POST' || !env.STATS) return out({ ok: false, nodb: 1 });
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  const s = okSite(b.s) ? b.s : 'sira', d = str(b.d, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !b.c || typeof b.c !== 'object') return out({ ok: false, bad: 1 }, 400);
  const E = Object.entries(b.c).filter(([k, n]) => typeof k === 'string' && k.length >= 1 && k.length <= 80 && !/[\u0000-\u001f]/.test(k) && Number.isInteger(n) && n > 0 && n <= 500).slice(0, 60);
  const q = 'INSERT INTO hits (site, day, k, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(site, day, k) DO UPDATE SET n = n + excluded.n';
  const st = E.map(([k, n]) => env.STATS.prepare(q).bind(s, d, k, n));
  st.push(env.STATS.prepare(q).bind(s, d, '·أجهزة', 1));
  // where the reader is, as Cloudflare knows it from the connection: the country and the city only (no address is kept)
  const cf = req.cf || {};
  if (cf.country && /^[A-Z]{2}$/.test(cf.country)) st.push(env.STATS.prepare(q).bind(s, d, '·بلد:' + cf.country, 1));
  if (cf.city && typeof cf.city === 'string') st.push(env.STATS.prepare(q).bind(s, d, '·مدينة:' + String(cf.city).slice(0, 60) + (cf.country ? '|' + cf.country : ''), 1));
  try { await env.STATS.batch(st); } catch (e) { return out({ ok: false }, 500); }
  return out({ ok: true });
}

/* ---------- the panel's other cards ---------- */
// GitHub runs a scheduled workflow only every few hours; with a key of his (Actions: read and write, the two repositories only)
// his choices are published at once: each saved correction starts its site's «لوحة المحتوى», and «شغّل الفحص الآن» starts the weekly check
const GH_REPO = { sira: 'itheoryofmind/SIRA', durar: 'itheoryofmind/DURAR' };
async function ghRun(env, site, wf, gap = 90e3) {
  try {
    const t = await env.PUSH.get('ghtok'); if (!t) return false;
    const k = 'ghrun:' + site + ':' + wf; if (gap && (await env.PUSH.get(k))) return true;
    const r = await fetch('https://api.github.com/repos/' + GH_REPO[site] + '/actions/workflows/' + wf + '/dispatches', { method: 'POST', headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'User-Agent': 'seeratuh-panel', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    if (gap) await env.PUSH.put(k, '1', { expirationTtl: Math.max(60, Math.round(gap / 1000)) });
    return r.status === 204;
  } catch (e) { return false; }
}
// what a helper may do, by what the keeper gave him
function helperMay(p, b, P) {
  if (P.boss) return p !== '/c/key';   // «رئيسي»: all the keeper does in this panel (the keeper himself is never one of the helpers, so none can stop him)
  if (p === '/c/export') return !!P.dl;
  if (p === '/c/hi') return !(b && b.s === undefined && !b.login && !P.push);   // the Durar worker's check before sending a notice asks with the key alone
  if (p === '/c/list' || p === '/c/stats') return true;
  if (p === '/c/save' || p === '/c/cancel') return !!(P.ed || P.rv);
  if (p === '/c/rv') return !!P.rv;
  if (p === '/c/dorar') return !!(P.rv || P.wk);
  if (p === '/c/wk') return b && b.a === 'ctl' ? !!P.wk : !!(P.rv || P.wk);
  if (p === '/c/fbi' || p === '/c/fbl' || p === '/c/fbs') return !!P.fb;
  if (p === '/c/sched') return !!P.push;
  if (p === '/c/cfg') {
    const a = b && b.a;
    if (['hide', 'unhide', 'add', 'unadd', 'page', 'unpage', 'lnk'].includes(a)) return !!P.cfg;
    if (a === 'note') return !!P.msg;
    if (a === 'pause') return !!P.pause;
    if (['design', 'dzmode', 'dzvar', 'pick', 'noimg', 'noimgb', 'tsk', 'isn', 'srch'].includes(a)) return !!P.dz;
    return false;
  }
  return false;
}
const PERMS = ['rv', 'ed', 'pub', 'cfg', 'wk', 'fb', 'msg', 'push', 'dz', 'pause', 'dl', 'boss'];
async function panelExtra(u, b, s, env, out, who) {
  const p = u.pathname;
  if (p === '/c/helpers') {   // the keeper's helpers: add (a new key, shown once), change what one may do, stop or remove one
    const L = (await env.PUSH.get('helpers', 'json')) || [];
    const clean = (o) => Object.fromEntries(PERMS.map((k) => [k, !!(o && (o[k] || o.boss))]));   // «رئيسي» holds every permission
    if (b.a === 'add') {
      const name = str(b.name, 60).trim(); if (!name || L.length >= 20) return out({ ok: false, bad: 1 }, 400);
      const key = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const x = { id: 'h' + Date.now().toString(36), name, h, perms: clean(b.perms), at: Date.now() };
      L.push(x); await env.PUSH.put('helpers', JSON.stringify(L));
      return out({ ok: true, key, id: x.id });
    }
    const x = L.find((x) => x.id === b.id);
    if (b.a === 'set' && x) { if (b.perms) x.perms = clean(b.perms); if (b.off != null) x.off = !!b.off; await env.PUSH.put('helpers', JSON.stringify(L)); }
    if (b.a === 'del' && x) await env.PUSH.put('helpers', JSON.stringify(L.filter((y) => y !== x)));
    const R = ((await env.PUSH.get('helpers', 'json')) || []).map(({ h, ...y }) => y);
    return out({ ok: true, helpers: R });
  }
  if (p === '/c/export') {   // everything the panel keeps, for moving the sites elsewhere: the settings and the decisions (no keys)
    const X = { v: 1, at: Date.now(), cfg: {}, fxres: {}, rv: {}, wk: {} };
    for (const s2 of ['sira', 'durar']) { X.cfg[s2] = await env.PUSH.get('cfg:' + s2, 'json'); X.fxres[s2] = await env.PUSH.get('fxres:' + s2, 'json'); }
    for (const [pre, o] of [['rv:', X.rv], ['wk:', X.wk]]) { let cur; do { const l = await env.PUSH.list({ prefix: pre, cursor: cur }); for (const k of l.keys) o[k.name.slice(pre.length)] = k.metadata || {}; cur = l.list_complete ? null : l.cursor; } while (cur); }
    X.wkctl = await env.PUSH.get('wkctl', 'json'); X.wkst = await env.PUSH.get('wkst', 'json');
    X.helpers = ((await env.PUSH.get('helpers', 'json')) || []).map((x) => ({ name: x.name, perms: x.perms, off: !!x.off }));
    // the fingerprints (never the keys) of the keeper's key and of each «رئيسي»: one of them becomes the keeper's key on a new home
    const oh = await env.PUSH.get('ownerh');
    if (!who.helper || (who.helper.perms && who.helper.perms.boss)) X.keys = { owner: /^[0-9a-f]{64}$/.test(oh || '') ? oh : OWNER_H, boss: ((await env.PUSH.get('helpers', 'json')) || []).filter((x) => x.perms && x.perms.boss).map((x) => ({ name: x.name, h: x.h })) };
    return out({ ok: true, x: X });
  }
  if (p === '/c/import') {   // the same, put back on a new home (the keeper or a «رئيسي» only; the helpers' keys cannot move: make new ones)
    if (who.helper && !(who.helper.perms && who.helper.perms.boss)) return out({ ok: false, denied: 1 }, 403);
    const X = b.x; if (!X || X.v !== 1 || typeof X.cfg !== 'object') return out({ ok: false, bad: 1 }, 400);
    let n = 0;
    for (const s2 of ['sira', 'durar']) {
      if (X.cfg[s2] && typeof X.cfg[s2] === 'object') { const old = await env.PUSH.get('cfg:' + s2); if (old) await env.PUSH.put('cfgold:' + s2, old); await env.PUSH.put('cfg:' + s2, JSON.stringify(X.cfg[s2])); n++; }
      if (X.fxres && X.fxres[s2]) await env.PUSH.put('fxres:' + s2, JSON.stringify(X.fxres[s2]));
    }
    // the decisions, a few hundred at a time (the panel asks again with «from» until «next» is null)
    const D = [...Object.entries(X.rv || {}).map(([k, m]) => ['rv:' + k, m]), ...Object.entries(X.wk || {}).map(([k, m]) => ['wk:' + k, m])];
    const from = Math.max(0, +b.from || 0), to = Math.min(D.length, from + 300);
    if (from > 0) n = 0;
    for (let i = from; i < to; i++) { const [k, m] = D[i]; if (!/^(rv|wk):[\w.:-]{1,200}$/.test(k)) continue; await env.PUSH.put(k, '1', { metadata: m || {} }); n++; }
    if (from === 0) { if (X.wkctl) await env.PUSH.put('wkctl', JSON.stringify(X.wkctl)); if (X.wkst) await env.PUSH.put('wkst', JSON.stringify(X.wkst)); }
    return out({ ok: true, n, next: to < D.length ? to : null, total: D.length });
  }
  if (p === '/c/queue') {   // a helper's edits that wait for the keeper: list, publish, or drop
    const AL = (await all(env)).filter((x) => x.metadata && x.metadata.st === 'q');
    if (b.a === 'ok' || b.a === 'no') {
      const x = AL.find((x) => x.name === b.id); if (!x) return out({ ok: false });
      if (b.a === 'no') { await env.PUSH.delete(x.name); return out({ ok: true }); }
      const v = await env.PUSH.get(x.name, 'json'); if (!v) return out({ ok: false });
      await env.PUSH.put(x.name, JSON.stringify({ ...v, st: 'p' }), { metadata: { ...x.metadata, st: 'p' } });
      await ghRun(env, v.s || 'sira', 'cms.yml');
      return out({ ok: true });
    }
    const R = []; for (const x of AL) { const v = await env.PUSH.get(x.name, 'json'); if (v) R.push({ id: x.name, ...v }); }
    return out({ ok: true, q: R });
  }
  if (p === '/c/osub') {   // the keeper's device: its subscription (from the site, where the app is installed) gets his alerts
    const sub = b.sub;
    if (b.a === 'list') { const l = await env.PUSH.list({ prefix: 'osub:' }); return out({ ok: true, n: l.keys.length, at: l.keys.map((x) => x.metadata || {}) }); }
    if (b.a === 'pair') { const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); await env.PUSH.put('pair:' + code, '1', { expirationTtl: 600 }); return out({ ok: true, code }); }
    if (b.a === 'clear') { const l = await env.PUSH.list({ prefix: 'osub:' }); for (const k of l.keys) await env.PUSH.delete(k.name); return out({ ok: true }); }
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return out({ ok: false, bad: 1 }, 400);
    const id = 'osub:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint)))].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
    if (b.a === 'off') { await env.PUSH.delete(id); return out({ ok: true, on: false }); }
    if (b.a === 'is') return out({ ok: true, on: !!(await env.PUSH.get(id)) });
    await env.PUSH.put(id, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), { metadata: { at: Date.now(), s } });
    const n = await ownerAlert(env, null, 0, { t: 'تنبيهات لوحة التحكم', b: 'فُعّلت على هذا الجهاز: محاولات الدخول الخاطئة، وملاحظات القرّاء، وتعطّل أحد الموقعين، وملخص كل جمعة.', u: PANEL, tag: 'own-on' });
    return out({ ok: true, on: true, sent: n });
  }
  if (p === '/c/gh') {   // his GitHub key for publishing at once: kept here only, never sent back
    if (b.a === 'is') return out({ ok: true, on: !!(await env.PUSH.get('ghtok')) });
    if (b.a === 'clear') { await env.PUSH.delete('ghtok'); return out({ ok: true, on: false }); }
    const t = str(b.t, 300).trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) return out({ ok: false, bad: 1 });
    const h = { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'User-Agent': 'seeratuh-panel' };
    const chk = await Promise.all(Object.values(GH_REPO).map((r) => fetch('https://api.github.com/repos/' + r + '/actions/workflows', { headers: h }).then((x) => x.status).catch(() => 0)));
    if (chk.some((x) => x !== 200)) return out({ ok: false, denied: 1 });
    await env.PUSH.put('ghtok', t);
    return out({ ok: true, on: true });
  }
  if (p === '/c/dorar') {   // a hadith's words looked up in the hadith encyclopedia (dorar.net), for comparing in the panel
    const q = str(b.q, 300).replace(/[\u064B-\u065F\u0670]/g, '').split(/\s+/).filter((w) => /[\u0621-\u064A]/.test(w)).slice(0, 10).join(' ');
    if (!q) return out({ ok: false, bad: 1 }, 400);
    const search = 'https://dorar.net/hadith/search?q=' + encodeURIComponent(q);
    try {
      const r = await fetch('https://dorar.net/dorar_api.json?skey=' + encodeURIComponent(q), { headers: { 'User-Agent': 'Mozilla/5.0 (seeratuh.com keeper check)', Accept: 'application/json' } });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { return out({ ok: false, blocked: 1, search }); }
      const H = (j.ahadith && j.ahadith.result) || '';
      const res = H.split('<div class="hadith"').slice(1).map((blk) => {
        const i = blk.indexOf('</div>');
        const strip = (x) => x.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        const links = [...blk.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /^(https?:\/\/dorar\.net)?\//.test(h)).map((h) => (h.startsWith('/') ? 'https://dorar.net' + h : h));
        return { t: strip((i >= 0 ? blk.slice(0, i) : blk).replace(/^[^>]*>/, '')), info: strip(i >= 0 ? blk.slice(i + 6) : '').slice(0, 400), links: links.slice(0, 4) };
      }).slice(0, 15);
      return out({ ok: true, res, search });
    } catch (e) { return out({ ok: false, net: 1, search }); }
  }
  if (p === '/c/wk') {   // «الفحص الأسبوعي»: its switch, a run asked now, a stop, and his choice on each note (the notes are in the repository)
    const ctl = (await env.PUSH.get('wkctl', 'json')) || { auto: true };
    if (b.a === 'get') {
      const dec = {}; let cur;
      do { const l = await env.PUSH.list({ prefix: 'wk:', cursor: cur }); for (const k of l.keys) dec[k.name.slice(3)] = k.metadata || {}; cur = l.list_complete ? null : l.cursor; } while (cur);
      return out({ ok: true, ctl, st: (await env.PUSH.get('wkst', 'json')) || {}, dec });
    }
    if (b.a === 'ctl') {
      if (typeof b.auto === 'boolean') ctl.auto = b.auto;
      if (b.run) { ctl.run = Date.now(); ctl.stop = 0; await env.PUSH.put('wkctl', JSON.stringify(ctl)); ctl.now = await ghRun(env, 'sira', 'weekly.yml', 0); }
      if (b.stop) ctl.stop = Date.now();
      await env.PUSH.put('wkctl', JSON.stringify(ctl));
      return out({ ok: true, ctl });
    }
    if (b.a === 'set') {
      const id = str(b.id, 80);
      if (!/^wk[vh]_[0-9a-f]{12}$/.test(id) || !['ignore', 'fixed', 'later', ''].includes(b.c || '')) return out({ ok: false, bad: 1 }, 400);
      if (!b.c) { await env.PUSH.delete('wk:' + id); return out({ ok: true }); }
      await env.PUSH.put('wk:' + id, '1', { metadata: { c: b.c, at: Date.now() } });
      return out({ ok: true });
    }
    return out({ ok: false, bad: 1 }, 400);
  }
  if (p === '/c/rv') {   // «فروق النص والطبعة»: the keeper's choice on each difference (the list itself is in the repository)
    if (b.a === 'list') {
      const r = {}; let cur;
      do { const l = await env.PUSH.list({ prefix: 'rv:', cursor: cur }); for (const k of l.keys) r[k.name.slice(3)] = k.metadata || {}; cur = l.list_complete ? null : l.cursor; } while (cur);
      return out({ ok: true, rv: r });
    }
    if (b.a === 'set') {
      const id = str(b.id, 80);
      if (!/^[a-z0-9_:.-]{1,80}$/i.test(id) || !['print', 'shamela', 'later', ''].includes(b.c || '')) return out({ ok: false, bad: 1 }, 400);
      if (!b.c && !b.n) { await env.PUSH.delete('rv:' + id); return out({ ok: true }); }
      await env.PUSH.put('rv:' + id, '1', { metadata: { c: b.c || '', n: str(b.n, 250), eid: str(b.eid, 60), at: Date.now() } });
      return out({ ok: true });
    }
    return out({ ok: false, bad: 1 }, 400);
  }
  if (p === '/c/log') return out({ ok: true, log: (await env.PUSH.get('log', 'json')) || [] });
  if (p === '/c/fbl') {
    const L = (await fbAll(env)).filter((x) => !b.s || (x.metadata && x.metadata.s === s)).sort((a, c) => (c.metadata.at || 0) - (a.metadata.at || 0)).slice(0, 150);
    const r = [];
    for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (v) { const { img, ...rest } = v; r.push({ id: x.name, st: x.metadata.st, hasImg: !!img, ...rest }); } }
    return out({ ok: true, fb: r });
  }
  if (p === '/c/fbi') { const v = String(b.id || '').startsWith('fb:') ? await env.PUSH.get(String(b.id), 'json') : null; return out({ ok: !!v, img: v ? v.img : '' }); }
  if (p === '/c/fbs') {
    const id = String(b.id || ''); if (!id.startsWith('fb:')) return out({ ok: false }, 400);
    if (b.st === 'x') { await env.PUSH.delete(id); return out({ ok: true }); }
    const v = await env.PUSH.getWithMetadata(id); if (!v || !v.value) return out({ ok: false }, 404);
    await env.PUSH.put(id, v.value, { metadata: { ...v.metadata, st: b.st === 'd' ? 'd' : 'n' } });
    return out({ ok: true });
  }
  if (p === '/c/sched') {   // a notification to send at a time chosen ahead
    if (b.a === 'add') {
      const at = +b.at, t = str(b.t, 80).trim(), body = str(b.b, 600).trim(), sites = (Array.isArray(b.sites) ? b.sites : []).filter(okSite);
      if (!(at > Date.now() + 60e3) || at > Date.now() + 400 * 864e5 || !body || !sites.length) return out({ ok: false, bad: 1 }, 400);
      const id = 'sch:' + at + '-' + rid();
      await env.PUSH.put(id, JSON.stringify({ at, t, b: body, sites }), { metadata: { at } });
      return out({ ok: true, id });
    }
    if (b.a === 'del') { const id = String(b.id || ''); if (id.startsWith('sch:')) await env.PUSH.delete(id); return out({ ok: true }); }
    const L = []; let cursor;
    do { const l = await env.PUSH.list({ prefix: 'sch:', cursor }); for (const x of l.keys) L.push(x.name); cursor = l.list_complete ? null : l.cursor; } while (cursor);
    const r = []; for (const id of L) { const v = await env.PUSH.get(id, 'json'); if (v) r.push({ id, ...v }); }
    return out({ ok: true, sched: r.sort((a, c) => a.at - c.at), done: (await env.PUSH.get('schdone', 'json')) || [] });
  }
  if (p === '/c/backup') {
    const cfg = { sira: await getCfg(env, 'sira'), durar: await getCfg(env, 'durar') };
    const edits = []; for (const x of await all(env)) { const v = await env.PUSH.get(x.name, 'json'); if (v) edits.push({ id: x.name, ...v }); }
    const sched = []; { let cursor; do { const l = await env.PUSH.list({ prefix: 'sch:', cursor }); for (const x of l.keys) { const v = await env.PUSH.get(x.name, 'json'); if (v) sched.push({ id: x.name, ...v }); } cursor = l.list_complete ? null : l.cursor; } while (cursor); }
    return out({ ok: true, kind: 'seeratuh-backup', v: 1, at: Date.now(), cfg, edits, sched });
  }
  if (p === '/c/restore') {
    const c = b.cfg;
    if (!c || typeof c !== 'object' || !Array.isArray(c.hide) || !Array.isArray(c.add) || !Array.isArray(c.pages) || !c.pause || typeof c.pause !== 'object') return out({ ok: false, bad: 1 }, 400);
    if (new TextEncoder().encode(JSON.stringify(c)).length > 1.5e6) return out({ ok: false, full: 1 }, 400);
    const old = await getCfg(env, s);
    await env.PUSH.put('cfgold:' + s, JSON.stringify(old), { expirationTtl: 30 * 86400 });   // the settings before, for a month
    await putCfg(env, s, Object.assign(EMPTY(), c));
    return out({ ok: true });
  }
  if (p === '/c/stats') {
    if (!env.STATS) return out({ ok: false, nodb: 1 });
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    try {
      const Q = (w, lim) => env.STATS.prepare("SELECT k, SUM(n) AS n FROM hits WHERE site = ?1 AND day >= ?2 AND " + w + " GROUP BY k ORDER BY n DESC LIMIT " + lim).bind(s, from).all().then((r) => r.results || []);
      const [top, dz, mine, cc, city] = await Promise.all([Q("substr(k,1,1) <> '·'", 25), Q("k LIKE '·تصميم:%'", 20), Q("k LIKE '·اختار:%'", 20), Q("k LIKE '·بلد:%'", 30), Q("k LIKE '·مدينة:%'", 30)]);
      const cut = (L) => L.map((x) => ({ k: x.k.slice(x.k.indexOf(':') + 1), n: x.n }));
      const days = await env.STATS.prepare("SELECT day, n FROM hits WHERE site = ?1 AND day >= ?2 AND k = '·أجهزة' ORDER BY day DESC").bind(s, from).all();
      return out({ ok: true, top, dz: cut(dz), mine: cut(mine), cc: cut(cc), city: cut(city), days: days.results || [] });
    } catch (e) { return out({ ok: false, nodb: 1 }); }
  }
  return null;
}

/* ---------- the notifications set ahead: sent by the scheduler when their time comes ---------- */
export async function runSched(env, sendSira) {
  const now = Date.now(), L = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: 'sch:', cursor }); for (const x of l.keys) if (x.metadata && x.metadata.at <= now) L.push(x.name); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  for (const id of L) {
    const v = await env.PUSH.get(id, 'json'); await env.PUSH.delete(id); if (!v) continue;
    const msg = { t: v.t, b: v.b }, res = {};
    for (const site of v.sites) {
      if (await pushPaused(env, site)) { res[site] = 'paused'; continue; }
      try {
        if (site === 'sira') res[site] = await sendSira(msg);
        else { const pk = await env.PUSH.get('admin'); const r = await fetch('https://push.dorarnajdiah.com/o/bc', { method: 'POST', headers: { 'X-Peer': pk || '', 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }); res[site] = await r.json(); }
      } catch (e) { res[site] = { ok: false }; }
    }
    const D = (await env.PUSH.get('schdone', 'json')) || []; D.unshift({ ...v, sent: now, res }); await env.PUSH.put('schdone', JSON.stringify(D.slice(0, 30)));
  }
}

/* ---------- every five minutes: are the two sites answering? (an alert after ten minutes down, and when they are back) ---------- */
export async function runWatch(env) {
  for (const [s, url] of [['sira', 'https://seeratuh.com/version.json'], ['durar', 'https://dorarnajdiah.com/version.json']]) {
    let ok = false;
    try { const r = await fetch(url + '?w=' + Date.now(), { cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(15000) }); ok = r.ok; } catch (e) {}
    const k = 'down:' + s, n = +(await env.PUSH.get(k)) || 0;
    if (ok) { if (n >= 2) await ownerAlert(env, null, 0, { t: SNAME[s], b: 'عاد الموقع يعمل.', u: s === 'sira' ? 'https://seeratuh.com/' : 'https://dorarnajdiah.com/', tag: 'own-up-' + s }); if (n) await env.PUSH.delete(k); continue; }
    await env.PUSH.put(k, String(n + 1), { expirationTtl: 86400 });
    if (n + 1 === 2) await ownerAlert(env, null, 0, { t: SNAME[s] + ' لا يفتح', b: 'الموقع لا يجيب منذ عشر دقائق تقريباً. سأخبرك حين يعود.', u: PANEL, tag: 'own-down-' + s });
  }
}
/* ---------- every Friday after nine in the morning (Riyadh): the week in one notice ---------- */
export async function runWeekly(env) {
  const now = new Date(Date.now() + 3 * 36e5);   // Riyadh
  if (now.getUTCDay() !== 5 || now.getUTCHours() < 9) return;
  const wk = 'wk:' + now.toISOString().slice(0, 10);
  if (await env.PUSH.get(wk)) return;
  await env.PUSH.put(wk, '1', { expirationTtl: 8 * 86400 });
  const since = Date.now() - 7 * 864e5, fb = (await fbAll(env)).filter((x) => x.metadata && x.metadata.at >= since);
  const L = [];
  const n = fb.length, nw = fb.filter((x) => x.metadata.st === 'n').length;
  L.push('ملاحظات القرّاء: ' + (n ? n + (nw ? ' (لم تُراجع ' + nw + ')' : '') : 'لا شيء'));
  if (env.STATS) {
    const from = new Date(since).toISOString().slice(0, 10);
    for (const s of ['sira', 'durar']) {
      try {
        const dv = await env.STATS.prepare("SELECT SUM(n) AS n FROM hits WHERE site = ?1 AND day >= ?2 AND k = '·أجهزة'").bind(s, from).first();
        const tp = await env.STATS.prepare("SELECT k, SUM(n) AS n FROM hits WHERE site = ?1 AND day >= ?2 AND substr(k,1,1) <> '·' GROUP BY k ORDER BY n DESC LIMIT 1").bind(s, from).first();
        if (dv && dv.n) L.push(SNAME[s] + ': ' + dv.n + ' جهاز×يوم' + (tp ? '، وأكثر ما قُرئ: ' + tp.k : ''));
      } catch (e) {}
    }
  }
  for (const s of ['sira', 'durar']) { const r = await env.PUSH.get('fxres:' + s, 'json'); if (r && Date.now() - r.at < 8 * 864e5) L.push('أمانة النقل في ' + SNAME[s] + ': ' + (r.bad || r.miss ? 'وُجد ما يخالف — افتح اللوحة' : 'سليمة')); }
  await ownerAlert(env, null, 0, { t: 'أسبوعك في الموقعين', b: L.join('\n'), u: PANEL, tag: 'own-week' });
}
