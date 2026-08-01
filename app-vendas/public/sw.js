// Service worker: precache do app shell + cache-first para assets + cache das
// imagens do Supabase Storage (para o app funcionar offline com as fotos).
const CACHE = 'app-vendas-v2'
const IMG_CACHE = 'app-vendas-img-v1'
const KEEP = [CACHE, IMG_CACHE]
const CORE = ['/', '/index.html', '/manifest.webmanifest']
const IMG_MAX = 300 // teto simples do cache de imagens (FIFO)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      // Mantém o shell atual E o cache de imagens (antes apagava as imagens a
      // cada bump de versão do shell).
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Guarda a imagem no cache e mantém o tamanho sob um teto (FIFO), fora do
// caminho de resposta para não atrasar o carregamento.
function cacheImage(req, res) {
  caches.open(IMG_CACHE).then((c) => {
    c.put(req, res)
    c.keys().then((keys) => {
      if (keys.length > IMG_MAX) c.delete(keys[0])
    })
  })
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Imagens públicas do Supabase Storage → cache-first (cross-origin permitido
  // só para este host/caminho; auth/rest/realtime NÃO passam por aqui).
  if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/')) {
    e.respondWith(
      caches.open(IMG_CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req)
              .then((res) => {
                // Respostas públicas vêm com CORS (type 'cors'); opaque também é
                // aceitável. Nunca condicionar só a status 200 (opaque = 0).
                if (res && (res.ok || res.type === 'opaque')) cacheImage(req, res.clone())
                return res
              })
              .catch(() => caches.match(req, { cacheName: IMG_CACHE })),
        ),
      ),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Assets com hash (build) → cache-first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })),
    )
    return
  }

  // Navegação → network-first com fallback ao cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }
})
