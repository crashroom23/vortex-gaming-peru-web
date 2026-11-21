self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      new URL(request.url).origin !== self.location.origin ||
      new URL(request.url).pathname !== '/') return;

  event.respondWith(fetch(request).catch(() => new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>vortex.store</title><h1>Estás sin conexión</h1><p>Conéctate a Internet para ver los productos y hacer tu pedido.</p><a href="/">Volver a intentar</a></html>',
    {status: 503, headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
  )));
});
