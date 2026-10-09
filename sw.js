// Offline: the page (with all its texts inside it), page images once seen, and the fonts
const V='sira-v3';
const SHELL=['./','index.html','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('sira-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const cacheable=u.origin===location.origin||['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname);
  if(!cacheable)return;
  if(e.request.mode==='navigate'){   // network first, so updates arrive
    e.respondWith(fetch(e.request.url,{cache:'no-store'}).then(x=>{const y=x.clone();if(x.ok)caches.open(V).then(c=>c.put('index.html',y));return x}).catch(()=>caches.match('index.html')));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{if(x.ok||x.type==='opaque'){const y=x.clone();caches.open(V).then(c=>c.put(e.request,y))}return x})));
});
