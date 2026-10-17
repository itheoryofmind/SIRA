// The keeper's control of his two sites (سيرته: seeratuh.com, الدرر السنية: dorarnajdiah.com), from inside each site (edit mode)
// and from push.seeratuh.com/c. Nothing works without his key (the same key as the notice page /o; only its SHA-256 is kept).
//
// Two kinds of change:
//  - text corrections (a text of the site's data, or the site's own wording): kept here as waiting (cms:<time>), then written
//    into the site's repository by its workflow (.github/workflows/cms.yml) within minutes, checked, and published;
//  - the site's settings, applied at once without publishing: pausing the site with a message, hiding any part of it,
//    adding text after any place, and whole new sections (cfg:<site>). Every reader's page asks /st?s=<site> on opening.
// The workflows prove which repository they run in with GitHub's own signed token (OIDC), so no password is kept anywhere.
import { isOwner } from './owner.js';
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

/* ---------- the settings of a site ---------- */
const EMPTY = () => ({ pause: { on: false }, hide: [], add: [], pages: [] });
async function getCfg(env, s) {
  let c = await env.PUSH.get('cfg:' + s, 'json');
  if (!c && s === 'sira') { const p = await env.PUSH.get('pause', 'json'); c = EMPTY(); if (p) c.pause = p; }   // the first pause, kept before the settings existed
  return Object.assign(EMPTY(), c || {});
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
    dz: c.dz || '', dzm: Object.assign({}, DZM_DEF, c.dzm || {}), dzv: c.dzv || {}, pick: c.pick || ['base', 'haram'], noimg: !!c.noimg, pages: c.pages.filter((p) => !p.off).map((p) => ({ id: p.id, sel: p.sel, fp: p.fp, sec: p.sec, title: p.title, sub: p.sub, blocks: p.blocks })), v: c.v || 0 };
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
  if (u.pathname === '/c/pending' || u.pathname === '/c/done') {
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
    let b; try { b = await req.json(); } catch (e) { return out({ ok: false }, 400); }
    const id = str(b.id, 80);
    const v = id.startsWith(P) ? await env.PUSH.getWithMetadata(id, 'json') : null;
    if (!v || !v.value || (v.value.s || 'sira') !== s) return out({ ok: false }, 404);
    const st = b.st === 'ok' ? 'ok' : 'err';
    await env.PUSH.put(id, JSON.stringify({ ...v.value, st, msg: str(b.msg, 400), sha: str(b.sha, 40), at2: Date.now() }), { metadata: { ...v.metadata, st } });
    return out({ ok: true });
  }

  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  if (!(await isOwner(b && b.k, env))) return out({ ok: false }, 403);
  const s = okSite(b.s) ? b.s : 'sira';

  // a new key: its fingerprint replaces the old one at once (the key itself never reaches here)
  if (u.pathname === '/c/key') {
    const nh = str(b.nh, 64);
    if (!/^[0-9a-f]{64}$/.test(nh)) return out({ ok: false, bad: 1 }, 400);
    await env.PUSH.put('ownerh', nh);
    return out({ ok: true });
  }
  if (u.pathname === '/c/hi') { const c = await getCfg(env, s); return out({ ok: true, site: s, pause: c.pause, cfg: c }); }
  if (u.pathname === '/c/list') {
    const L = (await all(env)).filter((x) => siteOf(x) === s).slice(-80).reverse();
    const r = [];
    for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (v) r.push({ id: x.name, ...v }); }
    return out({ ok: true, edits: r });
  }
  if (u.pathname === '/c/save') {
    const { f, path, old, nw } = b;
    if (!okFile(f) || !okPath(path) || !okText(old) || !okText(nw) || old === nw || !nw.trim()) return out({ ok: false, bad: 1 }, 400);
    const AL = await all(env);
    const same = AL.filter((x) => x.metadata && (x.metadata.st === 'p' || x.metadata.st === 't') && x.metadata.f === f && siteOf(x) === s);
    for (const x of same) { const v = await env.PUSH.get(x.name, 'json'); if (v && JSON.stringify(v.path) === JSON.stringify(path)) return out({ ok: false, busy: 1 }); }
    const id = P + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const v = { s, f, path, old, nw, note: str(b.note, 300), lb: str(b.lb, 200), sec: str(b.sec, 120), rv: b.rv ? str(b.rv, 60) : '', st: 'p', at: Date.now() };
    await env.PUSH.put(id, JSON.stringify(v), { metadata: { st: 'p', f, s } });
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
    } else if (a === 'noimg') {
      c.noimg = !!b.on;
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
