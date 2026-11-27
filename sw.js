const V='portafoglio-v29';
const FILES=['./','index.html','manifest.json','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(FILES.map(f=>fetch(new Request(f,{cache:'reload'})).then(r=>r.ok?c.put(f,r):null)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const c=r.clone();caches.open(V).then(ch=>ch.put(e.request,c))}return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch(x){}
  e.waitUntil(self.registration.showNotification(d.title||'Portafoglio',{body:d.body||'',tag:d.tag||'portafoglio',icon:'icon-192.png',data:{url:d.url||'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const scope=self.registration.scope,url=new URL((e.notification.data||{}).url||'./',scope);
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    const c=l.find(x=>x.url.startsWith(scope));
    if(c)return c.focus().then(w=>(w||c).postMessage({apri:url.hash}));
    return self.clients.openWindow(url.href);
  }));
});
