// «من شمائله» daily notification for seeratuh.com
// - keeps the devices that asked for it (only the push address the browser gives; no name, no e-mail)
// - every morning sends the same hadith the site shows that day (al-Albani graded it sahih or hasan)
// Web Push: RFC 8291 (aes128gcm) and RFC 8292 (VAPID), with WebCrypto only.
import H from './hadith.js';

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

async function send(env, sub, msg) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'TTL': '86400', 'Urgency': 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': await vapidHeader(env, sub.endpoint) },
    body: await encrypt(sub, JSON.stringify(msg)),
  });
  return r.status;
}

const idOf = async (endpoint) => 's:' + b64u.enc(await crypto.subtle.digest('SHA-256', enc.encode(endpoint))).slice(0, 32);

// the same hadith as the site's card that day (Riyadh's date)
function today() {
  const day = Math.floor((Date.now() + 3 * 3600e3) / 864e5);
  const h = H[day % H.length];
  return { t: 'من شمائله صلى الله عليه وسلم', b: h.t, u: SITE + '/#v25p' + h.p, tag: 'shamail' };
}

// every Friday to all who turned the notifications on: al-Ahzab 56 (King Fahd Complex text), and Ibn al-Qayyim's words in Zad al-Ma'ad (vol. 1 p. 364)
const VERSE = "إِنَّ ٱللَّهَ وَمَلَٰٓئِكَتَهُۥ يُصَلُّونَ عَلَى ٱلنَّبِيِّۚ يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُواْ صَلُّواْ عَلَيۡهِ وَسَلِّمُواْ تَسۡلِيمًا";
function friday() {
  return { t: 'يوم الجمعة', b: '﴿' + VERSE + '﴾ [الأحزاب: ٥٦]\n«أكثروا من الصلاة علي يوم الجمعة وليلة الجمعة» (زاد المعاد ١/٣٦٤)', u: SITE + '/#v18p364', tag: 'friday' };
}

function valid(sub) {
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && OK_HOSTS.some((r) => r.test(u.hostname)) && sub.keys && sub.keys.p256dh && sub.keys.auth && JSON.stringify(sub).length < 2000;
  } catch (e) { return false; }
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (u.pathname === '/key') return json({ key: (await vapid(env)).pub });
    if (u.pathname === '/health') return json({ ok: true, hadiths: H.length });
    if (req.method === 'POST' && (u.pathname === '/sub' || u.pathname === '/unsub')) {
      let sub; try { sub = await req.json(); } catch (e) { return json({ ok: false }, 400); }
      if (!sub || !sub.endpoint) return json({ ok: false }, 400);
      const id = await idOf(sub.endpoint);
      if (u.pathname === '/unsub') { await env.PUSH.delete(id); return json({ ok: true }); }
      if (!valid(sub)) return json({ ok: false }, 400);
      await env.PUSH.put(id, JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }));
      // a first notification right away: the reader sees it works
      const st = await send(env, sub, { t: 'سِيرَتُه', b: 'سيصلك كل صباح حديثٌ من شمائله صلى الله عليه وسلم، وكل جمعة تذكيرٌ بالصلاة عليه.', u: SITE + '/', tag: 'welcome' }).catch(() => 0);
      return json({ ok: true, sent: st });
    }
    return json({ ok: false }, 404);
  },
  async scheduled(ev, env, ctx) {
    const msg = ev.cron === FRI ? friday() : today();
    let cursor, n = 0, gone = 0;
    do {
      const l = await env.PUSH.list({ prefix: 's:', cursor });
      for (const k of l.keys) {
        const sub = await env.PUSH.get(k.name, 'json'); if (!sub) continue;
        const st = await send(env, sub, msg).catch(() => 0); n++;
        if (st === 404 || st === 410) { await env.PUSH.delete(k.name); gone++; }   // the reader turned it off or removed the app
      }
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    console.log('sent', n, 'removed', gone);
  },
};
