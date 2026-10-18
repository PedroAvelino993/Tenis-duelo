// Guarda o jogo no aparelho para abrir sem internet.
// Sempre tenta a versão mais nova primeiro; usa a cópia só se estiver offline.
const CACHE_NAME = "tenis-v2";
const ARQUIVOS = ["./", "./index.html", "./style.css", "./jogo.js", "./manifest.json", "./apple-touch-icon.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n.startsWith("tenis-") && n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
