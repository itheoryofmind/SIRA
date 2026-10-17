// «من شمائله» daily notification for seeratuh.com
// - keeps the devices that asked for it (the push address the browser gives and the reader's time zone; no name, no e-mail)
// - every day at 6:00 in the reader's own time zone: the hadith the site shows that day (al-Albani graded it sahih or hasan)
// - every Friday at 9:00 in the reader's own time zone: al-Ahzab 56
// - for a reader who keeps a reading plan and asked for it: the day's pages of the Mukhtasar at 20:00 where the reader is
// - an event of the Sira, and one of the rightly guided caliphs, each day in order (the site's timeline, in the Mukhtasar's words)
// - each reader picks which of these, and the hour of each (where the reader is)
// Web Push: RFC 8291 (aes128gcm) and RFC 8292 (VAPID), with WebCrypto only.
import { ownerFetch, installSeen, hourTxt, topOf } from './owner.js';
import { cmsFetch, pauseFetch, pushPaused, mediaFetch } from './cms.js';
import H, { DAY0, SKIP } from './hadith.js';
const HR = H.map((_, i) => i).filter((i) => !SKIP.includes(i));   // the days pass over the hadiths whose digital text has a misprint (dayskip.py)
import { SI, KH } from './tl.js';
import MG from './mg.js';

const SITE = 'https://seeratuh.com';
const FRI = '0 6 * * 5';   // Friday 9:00 in Riyadh
const enc = new TextEncoder();
const b64u = {
  enc: (b) => { b = new Uint8Array(b); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); return Uint8Array.from(b, (c) => c.charCodeAt(0)); },
};
const cat = (...a) => { const n = a.reduce((t, x) => t + x.length, 0), o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });

// the push services browsers use; anything else is refused
const OK_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

async function vapid(env) {
  let v = await env.PUSH.get('vapid', 'json');
  if (!v) {   // made once, on first use, and kept in the store
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { pub: b64u.enc(await crypto.subtle.exportKey('raw', k.publicKey)), jwk: await crypto.subtle.exportKey('jwk', k.privateKey) };
    await env.PUSH.put('vapid', JSON.stringify(v));
  }
  return v;
}

async function vapidHeader(env, endpoint) {
  const v = await vapid(env);
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${v.pub}`;
}

async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

async function encrypt(sub, payload) {
  const ua = b64u.dec(sub.keys.p256dh), auth = b64u.dec(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// a notification carries the whole text; when the whole text does not fit one notification, it carries a pointer to it instead (never a part of it)
const fitMsg = (msg) => {
  const s = JSON.stringify(msg);
  if (enc.encode(s).length <= 3800) return s;
  return JSON.stringify(Object.assign({}, msg, { b: 'النص أطول مما يتسع له الإشعار، فاضغط لتقرأه كاملاً في الموقع.' }));
};
async function send(env, sub, msg) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'TTL': '86400', 'Urgency': 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': await vapidHeader(env, sub.endpoint) },
    body: await encrypt(sub, fitMsg(msg)),
  });
  return r.status;
}

const idOf = async (endpoint) => 's:' + b64u.enc(await crypto.subtle.digest('SHA-256', enc.encode(endpoint))).slice(0, 32);


const DEF_TZ = 'Asia/Riyadh';   // readers who subscribed before the time zone was kept
const okTz = (tz) => { try { return typeof tz === 'string' && tz.length < 64 && !!new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { return false; } };
// the reader's date, hour and weekday now
function local(tz, t = Date.now()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: (+p.hour) % 24, mi: +p.minute, wd: p.weekday };
}

// the same hadith as the site's card that day (the reader's date)
function today(tz) {
  const L = local(tz);
  const day = Date.UTC(L.y, L.m - 1, L.d) / 864e5;
  const i = HR[((day - DAY0) % HR.length + HR.length) % HR.length], h = H[i];   // DAY0 keeps the day's hadith when the list grew (2026-10-11)
  return { t: 'من شمائله صلى الله عليه وسلم', b: h.t, u: SITE + '/#hd=' + i, tag: 'shamail' };   // the site opens the hadith itself, in place
}

// the ordered kinds (the Sira, the caliphs, the Maghazi) go on by the reader's reading, not by the date:
// the item stays the same until the reader opens it (from the notification or in the site); then the next one comes
const listOf = (m, kind) => kind === 'si' ? (m.cx ? SIKH : SI) : kind === 'kh' ? KH : MG;
function curIx(m, kind, tz) {
  const L = listOf(m, kind);
  if (m.ix && Number.isInteger(m.ix[kind])) return ((m.ix[kind] % L.length) + L.length) % L.length;
  const d = dayNo(tz) - (+((m.sd || {})[kind]) || 0);   // readers from before: where the date had brought them
  return d < 0 ? null : d % L.length;
}
function seqMsg(m, kind, i) {
  const x = listOf(m, kind)[i], again = !!(m.sn && m.sn[kind] === i);
  const u = kind === 'mg' ? SITE + '/#mg=' + i + ';r=mg.' + i : SITE + '/#ev=' + x[3] + ';r=' + kind + '.' + i;
  return { t: (again ? 'لم تقرأه بعد · ' : '') + x[0], b: x[1], u, tag: kind === 'mg' ? 'maghazi' : kind };
}

// every Friday to all who turned the notifications on: al-Ahzab 56 only (King Fahd Complex text)
const VERSE = "إِنَّ ٱللَّهَ وَمَلَٰٓئِكَتَهُۥ يُصَلُّونَ عَلَى ٱلنَّبِيِّۚ يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُواْ صَلُّواْ عَلَيۡهِ وَسَلِّمُواْ تَسۡلِيمًا";
function friday() {
  return { t: 'يوم الجمعة', b: '﴿' + VERSE + '﴾ [الأحزاب: ٥٦]', u: SITE + '/#fr', tag: 'friday' };
}

// the reading plan of the site: the Mukhtasar from page 3 to 329, in d days from the reader's first day t
const PL_A = 3, PL_B = 329, PL_N = PL_B - PL_A + 1;
const AR = (n) => String(n).replace(/[0-9]/g, (c) => '٠١٢٣٤٥٦٧٨٩'[c]);
const planOf = (x) => (x && Number.isFinite(+x.t) && [30, 60, 100].includes(+x.d)) ? { t: +x.t, d: +x.d } : null;
function plan(pl) {
  const day = Math.floor((Date.now() - pl.t) / 864e5) + 1;
  if (day < 1 || day > pl.d) return null;
  const per = Math.ceil(PL_N / pl.d), a = PL_A + (day - 1) * per, b = Math.min(PL_B, a + per - 1);
  return { t: 'ورد اليوم من السيرة', b: 'اليوم ' + AR(day) + ' من ' + AR(pl.d) + ': مختصر سيرة الرسول صلى الله عليه وسلم، الصفحات ' + AR(a) + '–' + AR(b) + '.', u: SITE + '/#v17p' + a, tag: 'plan' };
}
// what a reader asked for: sh (the hadith and the Friday reminder; every subscription before the plan had it), pl (the plan)

// the reader's day number (for the daily order of the Sira and the caliphs)
const dayNo = (tz) => { const L = local(tz); return Date.UTC(L.y, L.m - 1, L.d) / 864e5; };

// what a reader asked for, and when: h = {kind: hour}; readers kept before the choice of hours: the hadith at 6, Friday at 9, the plan at 20
const SIKH = SI.concat(KH);   // the Sira, then the caliphs, for a reader who asked to go on
const KINDS = { mg: 7, sh: 6, fr: 9, si: 21, kh: 22, pl: 20 };
const ORDER = ['sh', 'mg', 'si', 'kh', 'pl', 'fr'];   // as on the notifications page
function norm(m) {
  m = m || {};
  if (m.h && typeof m.h === 'object') return m;
  const h = {};
  if (m.sh !== 0) { h.sh = 6; h.fr = 9; }
  if (planOf(m.pl)) h.pl = 20;
  return { ...m, h };
}
const okH = (x) => Number.isInteger(+x) && +x >= 0 && +x <= 23;

function valid(sub) {
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && OK_HOSTS.some((r) => r.test(u.hostname)) && sub.keys && sub.keys.p256dh && sub.keys.auth && JSON.stringify(sub).length < 2000;
  } catch (e) { return false; }
}

// a secret between the scheduler and its own sending calls
async function inner(env) {
  let k = await env.PUSH.get('inner');
  if (!k) { k = b64u.enc(crypto.getRandomValues(new Uint8Array(24))); await env.PUSH.put('inner', k); }
  return k;
}

// every reader whose hour it is: [id, kind]
async function due(env, force) {
  const out = [];
  let cursor;
  do {
    const l = await env.PUSH.list({ prefix: 's:', cursor });
    for (const k of l.keys) {
      const m = norm(k.metadata), tz = okTz(m.tz) ? m.tz : DEF_TZ;
      if (force) { if ({ daily: 'sh', friday: 'fr' }[force] in m.h || force in m.h) out.push([k.name, force]); continue; }
      const L = local(tz), slot = Math.floor(L.mi / 5);
      // the kinds due this hour, in the page's order; two in one hour come five minutes apart, not together
      const now = ORDER.filter((kind) => kind in m.h && m.h[kind] === L.h
        && !(kind === 'fr' && L.wd !== 'Fri') && !(kind === 'pl' && !planOf(m.pl)));
      const kind = now[slot];
      if (kind) out.push([k.name, kind === 'sh' ? 'daily' : kind === 'fr' ? 'friday' : kind]);
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
}

// a few readers per call, so each call stays small
async function fanOut(env, jobs) {
  const r = { tried: 0, sent: 0, removed: 0 };
  if (!jobs.length) return r;
  const key = await inner(env);
  const parts = [];
  for (let i = 0; i < jobs.length; i += 6) parts.push(jobs.slice(i, i + 6));
  for (let i = 0; i < parts.length; i += 10) {
    const res = await Promise.all(parts.slice(i, i + 10).map((p) =>
      (env.SELF ? env.SELF.fetch('https://self/inner/send', { method: 'POST', headers: { 'X-Inner': key, 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then((x) => x.json())
                : sendJobs(env, p)).catch(() => ({ tried: p.length, sent: 0, removed: 0 }))));
    for (const x of res) { r.tried += x.tried || 0; r.sent += x.sent || 0; r.removed += x.removed || 0; }
  }
  return r;
}

async function sendJobs(env, jobs) {
  const r = { tried: 0, sent: 0, removed: 0 };
  for (const [id, kind, bm] of jobs) {
    const v = await env.PUSH.getWithMetadata(id, 'json');
    if (!v || !v.value) continue;
    const m = norm(v.metadata), tz = okTz(m.tz) ? m.tz : DEF_TZ;
    let msg, si = null;
    if (kind === 'bc') msg = bm;   // the keeper's own notice, the same to everyone
    else if (['si', 'kh', 'mg'].includes(kind)) { si = curIx(m, kind, tz); msg = si === null ? null : seqMsg(m, kind, si); }
    else msg = kind === 'friday' ? friday() : (kind === 'plan' || kind === 'pl') ? plan(planOf(m.pl) || { t: 0, d: 30 }) : today(tz);
    if (!msg) continue;   // the plan has ended, or the reader's first day has not come yet
    const st = await send(env, v.value, msg).catch(() => 0);
    if (si !== null && st >= 200 && st < 300) {   // keep the place, and remember it was sent (to say «not read yet» if it comes again)
      const md = { ...v.metadata, ix: { ...(m.ix || {}), [kind]: si }, sn: { ...(m.sn || {}), [kind]: si }, st: { ...(m.st || {}), [kind]: Date.now() } };
      await env.PUSH.put(id, JSON.stringify(v.value), { metadata: md });
    }
    r.tried++;
    if (st >= 200 && st < 300) r.sent++;
    if (st === 404 || st === 410) { await env.PUSH.delete(id); r.removed++; }   // the reader turned it off or removed the app
  }
  return r;
}

// for the keeper's page: how many chose each kind, and the hour most of them chose
const OKINDS = [['sh', 'حديث من الشمائل كل يوم'], ['mg', 'حديث من المغازي كل يوم'], ['si', 'محطة من السيرة كل يوم'], ['kh', 'من أخبار الخلفاء الراشدين'], ['pl', 'ورد خطة القراءة'], ['fr', 'تذكير يوم الجمعة']];
function siraStats(ms) {
  const hs = ms.map((m) => norm(m).h);
  return [{ t: 'الأنواع التي فعّلوها', r: OKINDS.map(([k, l]) => { const v = hs.filter((h) => k in h), tp = topOf(v.map((h) => +h[k]))[0]; return [l, v.length, tp ? 'أكثرهم الساعة ' + hourTxt(+tp[0]) : '']; }) }];
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    { const c = await mediaFetch(req, env, u); if (c) return c; }
    { const c = await pauseFetch(req, env, u, SITE); if (c) return c; }
    { const c = await cmsFetch(req, env, u); if (c) return c; }
    { const o = await ownerFetch(req, env, u, { site: SITE, name: 'سِيرَتُه', page: 1, fanOut, job: (id, msg) => [id, 'bc', msg], stats: siraStats }); if (o) return o; }
    if (req.method === 'POST' && u.pathname === '/i') return installSeen(req, env, cors);
    if (u.pathname === '/key') return json({ key: (await vapid(env)).pub });
    if (u.pathname === '/health') return json({ ok: true, hadiths: H.length, maghazi: MG.length, sira: SI.length, caliphs: KH.length });
    if (req.method === 'POST' && u.pathname === '/inner/send') {
      if (req.headers.get('X-Inner') !== await inner(env)) return json({ ok: false }, 403);
      return json(await sendJobs(env, await req.json()));
    }
    // a test send, now, to everyone subscribed: only with the key the deploy step keeps in the store
    if (req.method === 'POST' && u.pathname === '/admin/send') {
      const k = await env.PUSH.get('admin');
      if (!k || req.headers.get('X-Admin') !== k) return json({ ok: false }, 403);
      const kd = u.searchParams.get('kind');
      const r = await fanOut(env, await due(env, ['friday', 'si', 'kh'].includes(kd) ? kd : 'daily'));
      return json({ ok: true, ...r });
    }
    // the reader opened an item of an ordered kind: if it is the one waiting, the next one comes next time
    if (req.method === 'POST' && (u.pathname === '/read' || u.pathname === '/pending')) {
      let body; try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }
      if (!body || typeof body.endpoint !== 'string') return json({ ok: false }, 400);
      const id = await idOf(body.endpoint), v = await env.PUSH.getWithMetadata(id, 'json');
      if (!v || !v.value) return json({ ok: false, none: 1 });
      const m = norm(v.metadata), tz = okTz(m.tz) ? m.tz : DEF_TZ, ix = { ...(m.ix || {}) };
      const kinds = ['si', 'kh', 'mg'].filter((k) => k in m.h || (m.ix && k in m.ix));
      for (const k of kinds) if (!Number.isInteger(ix[k])) { const c = curIx(m, k, tz); if (c !== null) ix[k] = c; }
      if (u.pathname === '/read') {
        let moved = false;
        for (const k of kinds) {
          const L = listOf(m, k), c = ix[k];
          if (!Number.isInteger(c)) continue;
          const hit = body.kind === k ? body.i === c : (body.kind === 'ev' && k !== 'mg' && L[c] && L[c][3] === body.id);
          if (hit) { ix[k] = (c + 1) % L.length; moved = true; }
        }
        if (moved) { const sn = { ...(m.sn || {}) }; const md = { ...v.metadata, ix, sn }; await env.PUSH.put(id, JSON.stringify(v.value), { metadata: md }); }
        return json({ ok: true, moved, ix });
      }
      // what came lately, kind by kind: the waiting one and the five before it
      const out = {};
      for (const k of kinds) {
        const L = listOf(m, k), c = ix[k];
        if (!Number.isInteger(c)) continue;
        const r = [];
        for (let j = Math.max(0, c - 5); j <= c; j++) { const x = L[j]; r.push({ i: j, t: x[0], ev: k === 'mg' ? null : x[3], read: j < c }); }
        out[k] = r;
      }
      // sent, not opened, and sent less than twelve hours ago: the app shows a small dot that leads to it
      const w = kinds.filter((k) => m.sn && m.sn[k] === ix[k] && m.st && Date.now() - (m.st[k] || 0) < 12 * 36e5);
      return json({ ok: true, ix, p: out, w });
    }
    if (req.method === 'POST' && (u.pathname === '/sub' || u.pathname === '/unsub')) {
      let body; try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }
      const sub = body && body.sub ? body.sub : body;   // {sub, tz} now; the bare subscription from older pages
      if (!sub || !sub.endpoint) return json({ ok: false }, 400);
      const id = await idOf(sub.endpoint);
      if (u.pathname === '/unsub') { await env.PUSH.delete(id); return json({ ok: true }); }
      if (!valid(sub)) return json({ ok: false }, 400);
      const old = await env.PUSH.getWithMetadata(id);
      // what this call says, over what was kept
      const om = old && old.value ? norm(old.metadata) : null;
      const md = { tz: okTz(body.tz) ? body.tz : (om && okTz(om.tz) ? om.tz : DEF_TZ) };
      let h = om ? { ...om.h } : {};
      if (body.h && typeof body.h === 'object') {   // the notifications page: the whole choice
        h = {};
        for (const k in KINDS) if (k in body.h && okH(body.h[k])) h[k] = +body.h[k];
      }
      if ('sh' in body) { if (body.sh) { h.sh = h.sh ?? 6; h.fr = h.fr ?? 9; } else { delete h.sh; delete h.fr; } }   // pages before the notifications page
      const pl = 'pl' in body ? planOf(body.pl) : (om ? planOf(om.pl) : null);
      if (pl) md.pl = pl;
      if ('pl' in body && !body.h) { if (pl) h.pl = h.pl ?? 20; else delete h.pl; }
      if (!pl) delete h.pl;
      md.h = h;
      if ('cx' in body ? !!body.cx : !!(om && om.cx)) md.cx = 1;   // after the Sira, the caliphs
      // where each reader is in the Sira and the caliphs: the day the reader turned it on (or the page's own count)
      const sd = {}, osd = (om && om.sd) || {}, bsd = (body.sd && typeof body.sd === 'object') ? body.sd : {};
      for (const k of ['si', 'kh', 'mg']) if (k in h) { const x = Number.isInteger(bsd[k]) ? bsd[k] : Number.isInteger(osd[k]) ? osd[k] : dayNo(md.tz); sd[k] = x; }
      if (Object.keys(sd).length) md.sd = sd;
      if (om && om.ix) md.ix = om.ix;
      if (om && om.sn) md.sn = om.sn;
      if (!Object.keys(h).length) { await env.PUSH.delete(id); return json({ ok: true, removed: true }); }
      await env.PUSH.put(id, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), { metadata: md });
      if (body.test) {   // the page's test button
        const st = await send(env, sub, { t: 'سِيرَتُه', b: 'هذا إشعار تجريبي، وستصلك الإشعارات التي اخترتها في أوقاتها.', u: SITE + '/', tag: 'test' }).catch(() => 0);
        return json({ ok: true, sd, sent: st });
      }
      if (om) return json({ ok: true, sd });   // the same reader again
      // a first notification right away: the reader sees it works
      const st = await send(env, sub, { t: 'سِيرَتُه', b: 'فُعّلت الإشعارات، وتستطيع اختيار أنواعها وأوقاتها من صفحة «الإشعارات» في القائمة.', u: SITE + '/', tag: 'welcome' }).catch(() => 0);
      return json({ ok: true, sd, sent: st });
    }
    return json({ ok: false }, 404);
  },
  async scheduled(ev, env, ctx) {
    if (await pushPaused(env)) { console.log('paused'); return; }
    const r = await fanOut(env, await due(env));
    // the old owner's-notice feature was removed: its stored records (keys beginning w:) are deleted once
    if (!(await env.PUSH.get('wgone'))) { let c; do { const l = await env.PUSH.list({ prefix: 'w:', cursor: c }); for (const k of l.keys) await env.PUSH.delete(k.name); c = l.list_complete ? null : l.cursor; } while (c); await env.PUSH.put('wgone', '1'); }
    console.log('tried', r.tried, 'sent', r.sent, 'removed', r.removed);
  },
};
