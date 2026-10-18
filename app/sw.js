// Guarda os arquivos do app para abrir rápido e sem internet. Os dados sempre vêm da planilha.
const VERSAO = 'fc-v3';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest', 'icone.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO && k !== 'fc-config').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Rede primeiro para os arquivos do app, sempre conferindo com o servidor (sem usar o cache do navegador,
// que no GitHub Pages guarda arquivos por 10 minutos). Sem internet, usa a cópia guardada.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const buscar = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    buscar
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});

// Aviso da planilha (tarefas da casa, dias sem lançar). Chega sem texto; o texto vem da planilha.
const AVISO_PADRAO = { titulo: 'Finanças da Casa', texto: 'Abra o app para ver.', url: '#/inicio' };
async function textoDoAviso() {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const resp = await (await caches.open('fc-config')).match('api-url');
    const api = resp && (await resp.text());
    if (!sub || !api) return AVISO_PADRAO;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
    const id = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const r = await fetch(`${api}?aviso=${id}`);
    const aviso = await r.json();
    return aviso && aviso.texto ? aviso : AVISO_PADRAO;
  } catch {
    return AVISO_PADRAO;
  }
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    textoDoAviso().then((a) => self.registration.showNotification(a.titulo || 'Finanças da Casa', { body: a.texto, data: { url: a.url || '#/inicio' }, tag: 'financas-aviso' })),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || '#/inicio', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const j = janelas[0];
      if (j) return j.navigate(destino).then((x) => (x || j).focus()).catch(() => j.focus());
      return self.clients.openWindow(destino);
    }),
  );
});
