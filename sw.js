// Offline: the page and the fonts here; page images in their own store (kept across updates); the page itself saves the text files
const V='sira-v7',IMG='sira-img';
const SHELL=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
// old stores: page images seen before move to their own store, then the old store goes
async function tidy(){const ks=await caches.keys(),im=await caches.open(IMG);
  for(const k of ks){if(!/^sira-v\d+$/.test(k)||k===V)continue;const c=await caches.open(k);
    for(const r of await c.keys()){if(/\/img\/[^/]+\.png$/.test(new URL(r.url).pathname)&&!(await im.match(r))){const x=await c.match(r);if(x)await im.put(r,x)}}
    await caches.delete(k)}}
self.addEventListener('activate',e=>e.waitUntil(tidy().catch(()=>{}).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const cacheable=u.origin===location.origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname);
  if(!cacheable||/\/data\/[^/]+\.json$/.test(u.pathname))return;
  if(e.request.mode==='navigate'){   // network first, so updates arrive
    e.respondWith(fetch(e.request.url,{cache:'no-store'}).then(x=>{const y=x.clone();if(x.ok)caches.open(V).then(c=>c.put('index.html',y));return x}).catch(()=>caches.match('index.html')));return}
  const store=/\/img\/[^/]+\.png$/.test(u.pathname)?IMG:V;
  e.respondWith(caches.match(e.request,{ignoreVary:true}).then(r=>r||fetch(e.request).then(x=>{if(x.ok||x.type==='opaque'){const y=x.clone();caches.open(store).then(c=>c.put(e.request,y))}return x})));
});

/* «من شمائله»: the daily notification, and a tap opens the hadith in the book */
self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(_){d={b:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.t||'سِيرَتُه',{body:d.b||'',icon:'icon-192.png?v=2',badge:'favicon-96.png?v=2',tag:d.tag||'sira',lang:'ar',dir:'rtl',data:{u:d.u||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.u)||'./';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{for(const c of L){if('focus' in c){return c.navigate(u).then(w=>(w||c).focus()).catch(()=>c.focus())}}return clients.openWindow(u)}))});
