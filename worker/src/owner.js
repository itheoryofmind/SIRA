// The site keeper's private page: write a notice and send it to every device that turned notifications on, then see how many it reached.
// Nothing of it is in the sites themselves. The page is at push.seeratuh.com/o and does nothing without his key;
// only the key's SHA-256 is kept here, so the key itself is nowhere but on his phone.
export const OWNER_H = 'e7bd7daf0e1659ae266b3ebd76e3b7fc4bc76cd5dec5c89ebfce57b4033da161';
const PAGE_ORIGIN = 'https://push.seeratuh.com';
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function isOwner(k, env, remote) {
  if (typeof k !== 'string' || k.length < 30 || k.length > 100) return false;
  const h = hex(await crypto.subtle.digest('SHA-256', enc.encode(k)));
  let want = OWNER_H;
  if (env && env.PUSH && !remote) { const o = await env.PUSH.get('ownerh'); if (o && /^[0-9a-f]{64}$/.test(o)) want = o; }
  let d = 0; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ want.charCodeAt(i);
  if (d === 0 && h.length === want.length) return true;
  if (remote) { try { const r = await (await fetch('https://push.seeratuh.com/c/hi', { method: 'POST', body: JSON.stringify({ k }) })).json(); return !!(r && r.ok); } catch (e) {} }
  return false;
}
async function allIds(env, metas) {
  const ids = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: 's:', cursor }); for (const x of l.keys) { ids.push(x.name); if (metas) metas.push(x.metadata); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return ids;
}
// how a count of choices is shown: [label, count, note], most first
export const hourTxt = (h) => (h === 0 ? '١٢ ليلاً' : h < 12 ? h + ' صباحاً' : h === 12 ? '١٢ ظهراً' : (h - 12) + (h < 18 ? ' عصراً' : ' مساءً')).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
export function topOf(arr) { const c = {}; for (const x of arr) c[x] = (c[x] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); }
// installed apps: each app, when opened from the home screen, sends a random number it made itself (nothing about the reader),
// once at first and then about once a month; kept as i:<number> with the first and the last day it was seen
export async function installSeen(req, env, cors) {
  const id = (await req.text()).trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('', { status: 400, headers: cors });
  const k = 'i:' + id, now = Date.now(), v = await env.PUSH.getWithMetadata(k);
  const f = (v && v.metadata && v.metadata.f) || now;
  await env.PUSH.put(k, '', { metadata: { f, l: now } });
  return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', ...cors } });
}
async function installs(env) {
  const r = { all: 0, m30: 0, w7: 0 }, now = Date.now(); let cursor;
  do { const l = await env.PUSH.list({ prefix: 'i:', cursor });
    for (const x of l.keys) { const m = x.metadata || {}; r.all++; if (now - (m.l || 0) < 30 * 864e5) r.m30++; if (now - (m.f || 0) < 7 * 864e5) r.w7++; }
    cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return r;
}
const out = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': PAGE_ORIGIN, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

// ctx: { site, name, fanOut(env, jobs), job(id, msg) }
export async function sendAll(env, ctx, m) {   // the same notice to everyone with notifications on, now
  const ids = await allIds(env);
  const msg = { t: String(m.t || '').trim().slice(0, 80) || ctx.name, b: String(m.b || '').trim().slice(0, 600), u: ctx.site + '/', tag: 'bc' + Date.now() };
  return { ok: true, n: ids.length, ...(await ctx.fanOut(env, ids.map((id) => ctx.job(id, msg)))) };
}
export async function ownerFetch(req, env, u, ctx) {
  if (u.pathname === '/o' && req.method === 'GET' && ctx.page)
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
  // a notice set ahead in the panel, sent by the other site's worker when its time comes (the two workers share a key the deploy keeps)
  if (req.method === 'POST' && u.pathname === '/o/bc') {
    const pk = await env.PUSH.get('peer');
    if (!pk || req.headers.get('X-Peer') !== pk) return out({ ok: false }, 403);
    let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
    const body = String(b.b || '').trim().slice(0, 600); if (!body) return out({ ok: false }, 400);
    const ids = await allIds(env);
    const msg = { t: String(b.t || '').trim().slice(0, 80) || ctx.name, b: body, u: ctx.site + '/', tag: 'bc' + Date.now() };
    return out({ ok: true, n: ids.length, ...(await ctx.fanOut(env, ids.map((id) => ctx.job(id, msg)))) });
  }
  if (req.method !== 'POST' || (u.pathname !== '/o/count' && u.pathname !== '/o/send')) return null;
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  if (!(await isOwner(b && b.k, env, !ctx.page))) { if (ctx.logAuth) await ctx.logAuth(env, req, false, u.pathname); return out({ ok: false }, 403); }
  const metas = [], ids = await allIds(env, u.pathname === '/o/count' ? metas : null);
  if (u.pathname === '/o/count') return out({ ok: true, n: ids.length, ins: await installs(env), kinds: ctx.stats ? ctx.stats(metas) : [] });
  const t = String(b.t || '').trim().slice(0, 80) || ctx.name, body = String(b.b || '').trim().slice(0, 600);
  if (!body) return out({ ok: false, empty: 1 }, 400);
  const msg = { t, b: body, u: ctx.site + '/', tag: 'bc' + Date.now() };
  const r = await ctx.fanOut(env, ids.map((id) => ctx.job(id, msg)));
  return out({ ok: true, n: ids.length, ...r });
}

// the keeper's control panel page (owner_page.html, built into owner_page.js at deploy)
import PAGE from './owner_page.js';
