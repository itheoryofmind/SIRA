// The site keeper's private page: write a notice and send it to every device that turned notifications on, then see how many it reached.
// Nothing of it is in the sites themselves. The page is at push.seeratuh.com/o and does nothing without his key;
// only the key's SHA-256 is kept here, so the key itself is nowhere but on his phone.
export const OWNER_H = 'a1cb1d5fd3785c36ee881003acbe3710c8bcde4058a777fb0ceed768fb8c9487';
const PAGE_ORIGIN = 'https://push.seeratuh.com';
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function isOwner(k) {
  if (typeof k !== 'string' || k.length < 30 || k.length > 100) return false;
  const h = hex(await crypto.subtle.digest('SHA-256', enc.encode(k)));
  let d = 0; for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ OWNER_H.charCodeAt(i);
  return d === 0 && h.length === OWNER_H.length;
}
async function allIds(env) {
  const ids = []; let cursor;
  do { const l = await env.PUSH.list({ prefix: 's:', cursor }); for (const x of l.keys) ids.push(x.name); cursor = l.list_complete ? null : l.cursor; } while (cursor);
  return ids;
}
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
export async function ownerFetch(req, env, u, ctx) {
  if (u.pathname === '/o' && req.method === 'GET' && ctx.page)
    return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
  if (req.method !== 'POST' || (u.pathname !== '/o/count' && u.pathname !== '/o/send')) return null;
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return out({ ok: false }, 400); }
  if (!(await isOwner(b && b.k))) return out({ ok: false }, 403);
  const ids = await allIds(env);
  if (u.pathname === '/o/count') return out({ ok: true, n: ids.length, ins: await installs(env) });
  const t = String(b.t || '').trim().slice(0, 80) || ctx.name, body = String(b.b || '').trim().slice(0, 600);
  if (!body) return out({ ok: false, empty: 1 }, 400);
  const msg = { t, b: body, u: ctx.site + '/', tag: 'bc' + Date.now() };
  const r = await ctx.fanOut(env, ids.map((id) => ctx.job(id, msg)));
  return out({ ok: true, n: ids.length, ...r });
}

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#14130f">
<title>إرسال تنبيه</title>
<style>
:root{--bg:#14130f;--card:#1d1b16;--line:#3a352a;--ink:#f1ece0;--muted:#a59d8b;--brass:#c9a24a;--ok:#7fb48a;--bad:#d9826b}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.8 -apple-system,"SF Arabic","Geeza Pro",system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:calc(18px + env(safe-area-inset-top)) 16px 40px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);font-size:14px;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin:0 0 14px}
.card h2{font-size:15px;color:var(--brass);margin:0 0 8px;padding-bottom:6px;border-bottom:1px dashed var(--line)}
label{display:block;font-size:14px;color:var(--muted);margin:10px 0 4px}
input[type=text],textarea{width:100%;font:inherit;font-size:17px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
textarea{min-height:150px;resize:vertical}
.sites label{display:flex;align-items:center;gap:10px;color:var(--ink);font-size:16px;margin:6px 0}.sites input{width:22px;height:22px;accent-color:var(--brass)}
.n{color:var(--muted);font-size:13px}
.cnt{font-size:12.5px;color:var(--muted);text-align:left}
.pv{background:#2a2720;border-radius:16px;padding:12px 14px}.pv b{display:block;font-size:15px}.pv p{margin:2px 0 0;font-size:15px;white-space:pre-wrap;color:var(--ink)}
button{font:inherit;font-weight:700;border:0;border-radius:14px;padding:13px;width:100%;background:var(--brass);color:#1a1209;cursor:pointer}button:disabled{opacity:.5}
.st{padding:6px 0 4px;border-bottom:1px dashed var(--line)}.st b{display:block;color:var(--ink);margin-bottom:2px}.sr{display:flex;justify-content:space-between;font-size:15px;color:var(--muted);padding:2px 0}.sv{color:var(--ink);font-weight:700}
.res div{padding:6px 0;border-bottom:1px dashed var(--line)}.res div:last-child{border:0}.good{color:var(--ok)}.err{color:var(--bad)}
</style></head><body><main id="m"><p class="sub">…</p></main>
<script>
const K='ok',SITES=[['sira','سِيرَتُه','https://push.seeratuh.com'],['durar','الدرر السنية','https://push.dorarnajdiah.com']];
const ar=n=>new Intl.NumberFormat('ar-SA-u-nu-arab').format(n);
const m=document.getElementById('m');const E=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
let key='';try{const h=new URLSearchParams(location.hash.slice(1)).get('k');if(h){localStorage.setItem(K,h);history.replaceState(null,'',location.pathname)}key=localStorage.getItem(K)||''}catch(e){}
const call=(base,p,o)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({k:key,...(o||{})})}).then(r=>r.json()).catch(()=>({ok:false}));
(async()=>{
  const c=key?await call(SITES[0][2],'/o/count'):{ok:false};
  m.textContent='';if(!c.ok){m.append(E('p','sub','هذه الصفحة خاصة.'));return}
  m.append(E('h1',null,'إرسال تنبيه'),E('p','sub','يصل إلى كل جهاز فعّل الإشعارات في الموقع الذي تختاره، ثم ترى هنا كم جهازاً وصل إليه.'));
  const s=E('div','card sites');s.append(E('h2',null,'إلى من'));const box={},nn={};
  for(const [id,nm] of SITES){const l=E('label');const i=E('input');i.type='checkbox';i.checked=id==='sira';box[id]=i;nn[id]=E('span','n','');l.append(i,E('span',null,nm),nn[id]);s.append(l)}
  const st=E('div','card');st.append(E('h2',null,'الأرقام'));const row=(nm,j)=>{const d=E('div','st');d.append(E('b',null,nm));
    if(!j||!j.ok){d.append(E('div','n','تعذّر الاتصال'));return d}
    [['ثبّتوا التطبيق',j.ins.all],['فتحوه خلال آخر ٣٠ يوماً',j.ins.m30],['ثبّتوه خلال آخر ٧ أيام',j.ins.w7],['فعّلوا الإشعارات',j.n]].forEach(([a,v])=>{const r=E('div','sr');r.append(E('span',null,a),E('span','sv',ar(v)));d.append(r)});return d};
  const sd=E('div','n','…');st.append(row('سِيرَتُه',c),sd,E('p','n','عُدّ التطبيق المثبت ابتداءً من ١٢ أكتوبر ٢٠٢٦: كل من يفتحه من الشاشة الرئيسية يُحسب مرة واحدة، ومن ثبّته قبل ذلك يُحسب عند أول فتح له.'));m.append(st);
  m.append(s);nn.sira.textContent='(المشتركون الآن: '+ar(c.n)+')';
  call(SITES[1][2],'/o/count').then(j=>{sd.replaceWith(row('الدرر السنية',j));nn.durar.textContent=j.ok?'(المشتركون الآن: '+ar(j.n)+')':'(تعذّر الاتصال)'});
  const f=E('div','card');f.append(E('h2',null,'النص'));
  const lt=E('label',null,'العنوان (اتركه فارغاً ليكون اسم الموقع)');const ti=E('input');ti.type='text';ti.maxLength=80;
  const lb=E('label',null,'نص التنبيه');const tx=E('textarea');tx.maxLength=600;const cn=E('div','cnt','');
  f.append(lt,ti,lb,tx,cn);m.append(f);
  const pc=E('div','card');pc.append(E('h2',null,'هكذا يظهر'));const pv=E('div','pv');const pb=E('b'),pp=E('p');pv.append(pb,pp);pc.append(pv);m.append(pc);
  const upd=()=>{const on=SITES.filter(([id])=>box[id].checked);pb.textContent=ti.value.trim()||(on[0]?on[0][1]:'');pp.textContent=tx.value;cn.textContent=ar(tx.value.length)+' / ٦٠٠'};
  [ti,tx].forEach(x=>x.oninput=upd);Object.values(box).forEach(x=>x.onchange=upd);upd();
  const go=E('button',null,'أرسل');const res=E('div','card res');res.hidden=true;m.append(go,E('div',null,''),res);res.style.marginTop='14px';
  go.onclick=async()=>{const on=SITES.filter(([id])=>box[id].checked);
    if(!on.length){alert('اختر موقعاً واحداً على الأقل.');return}if(!tx.value.trim()){alert('اكتب نص التنبيه.');return}
    if(!confirm('سيُرسل إلى كل المشتركين في: '+on.map(x=>x[1]).join(' و')+'. هل أنت متأكد؟'))return;
    go.disabled=true;go.textContent='يُرسل…';res.hidden=false;res.textContent='';
    for(const [id,nm,base] of on){const r=E('div',null,nm+': يُرسل…');res.append(r);
      const j=await call(base,'/o/send',{t:ti.value,b:tx.value});
      r.className=j.ok?'good':'err';r.textContent=j.ok?nm+' — عدد الأجهزة التي وصلها: '+ar(j.sent)+(j.removed?'. واشتراكات منتهية أُزيلت (أوقف أصحابها الإشعارات أو حذفوا التطبيق): '+ar(j.removed):'')+(j.tried>j.sent+j.removed?'. وتعذّر الوصول الآن إلى: '+ar(j.tried-j.sent-j.removed):''):nm+': تعذّر الإرسال.'}
    go.disabled=false;go.textContent='أرسل'};
})();
</script></body></html>`;
