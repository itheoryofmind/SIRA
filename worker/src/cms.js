// The site keeper's content page (لوحة المحتوى): he finds a text of the site, corrects it, and the correction is published.
// The page is at push.seeratuh.com/c and does nothing without his key (the same key as the notice page /o).
// A correction is kept here as waiting (cms:<time>); a GitHub workflow in the site's repository (.github/workflows/cms.yml)
// collects the waiting ones every few minutes with the deploy key, writes them into the site's files, publishes, and marks each done.
import { isOwner } from './owner.js';
import PAGE from './cms_page.js';

const P = 'cms:';
// the edit mode runs inside the site itself (seeratuh.com), so its answers are open to that page
const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Access-Control-Allow-Origin': 'https://seeratuh.com' };
const out = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: H });
const okFile = (f) => f === 'ui' || (typeof f === 'string' && /^[a-z0-9_]{1,40}\.json$/.test(f));   // ui: the site's own wording
const okPath = (p) => Array.isArray(p) && p.length > 0 && p.length <= 24 && p.every((x) => (typeof x === 'string' && x.length <= 4000) || (Number.isInteger(x) && x >= 0));
const okText = (s) => typeof s === 'string' && s.length <= 300000;

async function all(env) {
  const L = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: P, cursor }); for (const x of l.keys) L.push(x); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return L;
}

export async function cmsFetch(req, env, u) {
  if (u.pathname !== '/c' && !u.pathname.startsWith('/c/')) return null;
  if (u.pathname === '/c' && req.method === 'GET')
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
  if (req.method !== 'POST') return null;

  // the workflow: the waiting corrections, and the result of each
  if (u.pathname === '/c/pending' || u.pathname === '/c/done') {
    const k = await env.PUSH.get('admin');
    if (!k || req.headers.get('X-Admin') !== k) return out({ ok: false }, 403);
    if (u.pathname === '/c/pending') {
      const L = (await all(env)).filter((x) => x.metadata && x.metadata.st === 'p');
      const edits = [];
      for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (v) edits.push({ id: x.name, ...v }); }
      return out({ ok: true, edits });
    }
    let b; try { b = await req.json(); } catch (e) { return out({ ok: false }, 400); }
    const v = await env.PUSH.getWithMetadata(String(b.id || ''), 'json');
    if (!v || !v.value) return out({ ok: false }, 404);
    const st = b.st === 'ok' ? 'ok' : 'err';
    const val = { ...v.value, st, msg: String(b.msg || '').slice(0, 400), sha: String(b.sha || '').slice(0, 40), at2: Date.now() };
    await env.PUSH.put(String(b.id), JSON.stringify(val), { metadata: { ...v.metadata, st } });
    return out({ ok: true });
  }

  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  if (!(await isOwner(b && b.k))) return out({ ok: false }, 403);

  if (u.pathname === '/c/hi') return out({ ok: true, pause: (await env.PUSH.get('pause', 'json')) || { on: false } });
  if (u.pathname === '/c/pause') {
    const on = !!b.on, msg = String(b.msg || '').trim().slice(0, 1000);
    if (on && !msg) return out({ ok: false, bad: 1 }, 400);
    const v = { on, msg, np: on && !!b.np, t: Date.now() };
    await env.PUSH.put('pause', JSON.stringify(v));
    return out({ ok: true, pause: v });
  }
  if (u.pathname === '/c/list') {
    const L = (await all(env)).slice(-60).reverse();
    const r = [];
    for (const x of L) { const v = await env.PUSH.get(x.name, 'json'); if (v) r.push({ id: x.name, ...v }); }
    return out({ ok: true, edits: r });
  }
  if (u.pathname === '/c/save') {
    const { f, path, old, nw } = b;
    if (!okFile(f) || !okPath(path) || !okText(old) || !okText(nw) || old === nw || !nw.trim()) return out({ ok: false, bad: 1 }, 400);
    // one waiting correction per place: a second one waits for the first
    const same = (await all(env)).filter((x) => x.metadata && x.metadata.st === 'p' && x.metadata.f === f);
    for (const x of same) { const v = await env.PUSH.get(x.name, 'json'); if (v && JSON.stringify(v.path) === JSON.stringify(path)) return out({ ok: false, busy: 1 }); }
    const id = P + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const v = { f, path, old, nw, note: String(b.note || '').slice(0, 300), lb: String(b.lb || '').slice(0, 200), sec: String(b.sec || '').slice(0, 80), rv: b.rv ? String(b.rv).slice(0, 60) : '', st: 'p', at: Date.now() };
    await env.PUSH.put(id, JSON.stringify(v), { metadata: { st: 'p', f } });
    return out({ ok: true, id });
  }
  if (u.pathname === '/c/cancel') {
    const id = String(b.id || '');
    const v = await env.PUSH.getWithMetadata(id);
    if (!id.startsWith(P) || !v || !v.metadata || v.metadata.st !== 'p') return out({ ok: false });
    await env.PUSH.delete(id);
    return out({ ok: true });
  }
  return out({ ok: false }, 404);
}

// the site and the app ask this when they open: is the site paused, and what to tell the reader
export async function pauseFetch(req, env, u, site) {
  if (u.pathname !== '/st') return null;
  const v = (await env.PUSH.get('pause', 'json')) || { on: false };
  return new Response(JSON.stringify({ on: !!v.on, msg: v.on ? v.msg : '' }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': site } });
}
// while paused with «and the notifications» chosen, the scheduled notifications are not sent
export async function pushPaused(env) { const v = await env.PUSH.get('pause', 'json'); return !!(v && v.on && v.np); }
