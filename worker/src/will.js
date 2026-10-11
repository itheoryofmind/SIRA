// «رسالة آلية من القائم على الموقع»: the owner answers a monthly «طمّنّا عليك»; after 90 days of silence the sites show a quiet notice,
// and the owner's family can open what he left (sealed on his own phone: the server never sees the text or the answers).
// Nothing here holds the owner's name. The owner is known only by a key he alone holds (its hash is kept here).
const DAY = 864e5;
const AR = (n) => String(n).replace(/[0-9]/g, (c) => '٠١٢٣٤٥٦٧٨٩'[c]);
const STEPS = [30, 37, 45, 60, 75, 85];   // reminders, in days of silence
const RELEASE = 90;
const MAX_PKG = 20 * 1024 * 1024;   // the sealed package, as text
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rnd = (n = 24) => { const b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
// equal-time comparison of two hex strings
const same = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function state(env) { return (await env.PUSH.get('w:st', 'json')) || {}; }
const put = (env, st) => env.PUSH.put('w:st', JSON.stringify(st));
const base = (st) => Math.max(st.last || 0, st.until || 0);
const quiet = (st, t = Date.now()) => st.last ? Math.max(0, (t - base(st)) / DAY) : 0;
const released = (st) => !!(st.rel && !st.opened);

async function isOwner(env, k) {
  const h = await env.PUSH.get('w:own');
  return !!(h && typeof k === 'string' && k.length >= 20 && same(h, await sha('own:' + k)));
}

// a few tries an hour from one address, and a ceiling for the day from everyone, so the answers cannot be guessed by trying
async function allowed(env, ip) {
  const hr = Math.floor(Date.now() / 36e5), dy = Math.floor(Date.now() / DAY);
  const k1 = 'w:rl:' + (await sha(ip || '-')).slice(0, 16) + ':' + hr, k2 = 'w:rd:' + dy;
  const a = +(await env.PUSH.get(k1) || 0), b = +(await env.PUSH.get(k2) || 0);
  if (a >= 5 || b >= 60) return false;
  await env.PUSH.put(k1, String(a + 1), { expirationTtl: 7200 });
  await env.PUSH.put(k2, String(b + 1), { expirationTtl: 2 * 86400 });
  return true;
}

function msgFor(days) {
  const left = Math.max(0, Math.round(RELEASE - days));
  if (days < 31) return { t: 'طمّنّا عليك', b: 'اضغط هنا ليعرف الموقع أنك بخير.', tag: 'wok' };
  if (left <= 6) return { t: 'طمّنّا عليك', b: 'لم تردّ منذ مدة. بعد ' + AR(left) + ' أيام تظهر الرسالة الآلية لأهلك في الموقعين. اضغط هنا لإلغائها.', tag: 'wok' };
  return { t: 'طمّنّا عليك', b: 'لم تردّ منذ ' + AR(Math.floor(days)) + ' يومًا. اضغط هنا ليعرف الموقع أنك بخير.', tag: 'wok' };
}

async function mail(env, subject, text) {
  const to = await env.PUSH.get('w:mail');
  if (!env.MAIL || !to) return false;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const from = 'noreply@seeratuh.com';
    const b64 = (s) => { const b = enc.encode(s); let x = ''; for (const c of b) x += String.fromCharCode(c); return btoa(x); };
    const raw = ['From: =?UTF-8?B?' + b64('سيرته') + '?= <' + from + '>', 'To: <' + to + '>', 'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Message-ID: <' + rnd(12) + '@seeratuh.com>', 'Date: ' + new Date().toUTCString(), 'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n')].join('\r\n');
    await env.MAIL.send(new EmailMessage(from, to, raw));
    return true;
  } catch (e) { console.log('mail', String(e)); return false; }
}

// one reminder: to the owner's phone, and (when set) a mail whose link answers by itself
async function remind(env, st, sendPush, site) {
  const days = quiet(st), m = msgFor(days);
  let pushed = 0;
  const sub = await env.PUSH.get('w:sub', 'json');
  if (sub) {
    const s = await sendPush(env, sub, { ...m, u: site + '/#wok' }).catch(() => 0);
    pushed = s >= 200 && s < 300 ? 1 : 0;
    if (s === 404 || s === 410) await env.PUSH.delete('w:sub');
  }
  const tok = rnd(24);
  await env.PUSH.put('w:tok:' + await sha(tok), '1', { expirationTtl: 120 * 86400 });
  const mailed = await mail(env, m.t, m.b + '\n\nللرد اضغط الرابط:\nhttps://push.seeratuh.com/w/ok?t=' + tok + '\n\n(رسالة آلية من موقعك)');
  return { pushed, mailed };
}

// hourly, from the scheduler
export async function willTick(env, sendPush, site) {
  const st = await state(env);
  if (!st.last) return;   // not claimed yet
  const days = quiet(st);
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  if (days >= RELEASE && !st.rel) { st.rel = Date.now(); await put(env, st); await mail(env, 'ظهرت الرسالة الآلية', 'ظهرت الرسالة الآلية لأهلك في الموقعين بعد ٩٠ يومًا بلا رد. إن كنت بخير فافتح الموقع من جوالك أو اضغط الرابط في آخر تذكير لإلغائها.'); return; }
  if (h < 10 || h > 21) return;   // reminders in the day, Riyadh time
  const due = STEPS.filter((d) => days >= d && !(st.sent || []).includes(d));
  if (!due.length || st.rel) return;
  await remind(env, st, sendPush, site);
  st.sent = [...new Set([...(st.sent || []), ...due])];
  await put(env, st);
}

const pub = (st) => ({ r: released(st) ? 1 : 0 });

export async function willFetch(req, env, u, json, sendPush, site) {
  const p = u.pathname;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (e) { body = {}; } }
  // the sites ask whether to show the notice
  if (p === '/w/s') return json(pub(await state(env)));
  // the questions, for the family, only once the notice is shown
  if (p === '/w/q') {
    const st = await state(env), pk = await env.PUSH.get('w:pkg', 'json');
    if (!st.rel || !pk) return json({ ok: false }, 404);
    return json({ ok: true, qs: pk.qs, salt: pk.salt, it: pk.it });
  }
  // the family's answers: a proof made from them on their phone; the sealed package only when it matches
  if (p === '/w/open' && req.method === 'POST') {
    const st = await state(env), pk = await env.PUSH.get('w:pkg', 'json');
    if (!st.rel || !pk) return json({ ok: false }, 404);
    if (!(await allowed(env, req.headers.get('CF-Connecting-IP')))) return json({ ok: false, wait: 1 }, 429);
    if (!same(pk.vh, await sha('v:' + (body.v || '')))) return json({ ok: false });
    st.opened = st.opened || Date.now(); await put(env, st);
    return json({ ok: true, iv: pk.iv, ct: pk.ct });
  }
  // a mail link answers «I am well»
  if (p === '/w/ok' && req.method === 'GET') {
    const t = u.searchParams.get('t') || '';
    const k = 'w:tok:' + await sha(t), okT = t.length > 20 && await env.PUSH.get(k);
    const page = (m) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:20px system-ui;direction:rtl;text-align:center;padding:60px 20px;background:#14231e;color:#efe7d2">' + m + '</body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (!okT) return page('هذا الرابط قديم أو مستعمل. افتح الموقع من جوالك المسجّل.');
    await env.PUSH.delete(k);
    const st = await state(env); st.last = Date.now(); st.sent = []; delete st.rel; delete st.opened; await put(env, st);
    return page('الحمد لله. وصل ردك، وبدأ العدّ من جديد.');
  }
  // from here on: the owner only
  if (req.method !== 'POST') return json({ ok: false }, 404);
  if (p === '/w/claim') {   // the first opening of the private link marks this key as the owner's; later ones are refused
    if (await env.PUSH.get('w:own')) return json({ ok: await isOwner(env, body.k) });
    if (typeof body.k !== 'string' || body.k.length < 30) return json({ ok: false }, 400);
    await env.PUSH.put('w:own', await sha('own:' + body.k));
    const st = await state(env); st.last = Date.now(); st.sent = []; await put(env, st);
    return json({ ok: true, claimed: 1 });
  }
  if (!(await isOwner(env, body.k))) return json({ ok: false }, 403);
  const st = await state(env);
  if (p === '/w/ok') { st.last = Date.now(); st.sent = []; delete st.rel; delete st.opened; await put(env, st); return json({ ok: true, ...await info(env, st) }); }
  if (p === '/w/info') return json({ ok: true, ...await info(env, st) });
  if (p === '/w/sub') {
    const s = body.sub;
    if (!s || !s.endpoint || !s.keys || !/^https:\/\//.test(s.endpoint)) return json({ ok: false }, 400);
    await env.PUSH.put('w:sub', JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }));
    if (body.test) { const r = await remind(env, st, sendPush, site); return json({ ok: true, ...r }); }
    return json({ ok: true });
  }
  if (p === '/w/away') {   // travel: the count starts again from the day named
    const until = +body.until;
    if (until && until > Date.now() && until < Date.now() + 400 * DAY) st.until = until; else delete st.until;
    st.last = Date.now(); st.sent = []; delete st.rel; await put(env, st);
    return json({ ok: true, ...await info(env, st) });
  }
  if (p === '/w/mail') {
    const m = (body.mail || '').trim();
    if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return json({ ok: false }, 400);
    if (m) await env.PUSH.put('w:mail', m); else await env.PUSH.delete('w:mail');
    const sent = m && body.test ? await mail(env, 'تجربة', 'هذه رسالة تجريبية: إذا وصلتك فالتذكير بالبريد يعمل.') : false;
    return json({ ok: true, sent, canMail: !!env.MAIL });
  }
  if (p === '/w/seal') {   // the package, sealed on the owner's phone
    const x = body.pkg;
    if (!x || typeof x.ct !== 'string' || typeof x.iv !== 'string' || typeof x.salt !== 'string' || typeof x.vh !== 'string' || !Array.isArray(x.qs)) return json({ ok: false }, 400);
    if (x.ct.length > MAX_PKG) return json({ ok: false, big: 1 }, 413);
    const pk = { ct: x.ct, iv: x.iv, salt: x.salt, it: +x.it || 600000, vh: await sha('v:' + x.vh), qs: x.qs.slice(0, 8).map((q) => String(q).slice(0, 200)), at: Date.now(), n: x.ct.length };
    await env.PUSH.put('w:pkg', JSON.stringify(pk));
    return json({ ok: true, ...await info(env, st) });
  }
  if (p === '/w/mine') {   // the owner reopens his own package to edit it: the same proof as the family's
    const pk = await env.PUSH.get('w:pkg', 'json');
    if (!pk) return json({ ok: false }, 404);
    if (!body.v) return json({ ok: true, qs: pk.qs, salt: pk.salt, it: pk.it });
    if (!same(pk.vh, await sha('v:' + body.v))) return json({ ok: false });
    return json({ ok: true, iv: pk.iv, ct: pk.ct });
  }
  return json({ ok: false }, 404);
}

async function info(env, st) {
  const pk = await env.PUSH.get('w:pkg', 'json'), sub = await env.PUSH.get('w:sub'), m = await env.PUSH.get('w:mail');
  return { last: st.last || 0, until: st.until || 0, days: Math.floor(quiet(st)), left: Math.max(0, Math.ceil(RELEASE - quiet(st))), rel: st.rel || 0, opened: st.opened || 0,
    sealed: pk ? { at: pk.at, n: pk.n, q: pk.qs.length } : null, phone: !!sub, mail: m ? m.replace(/^(.).*(@.*)$/, '$1…$2') : '', canMail: !!env.MAIL };
}
