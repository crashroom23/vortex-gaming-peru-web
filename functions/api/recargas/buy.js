// Bloqueo explícito de compras: esta API nunca debe invocarse desde un botón público
// sin verificación de pago, persistencia transaccional, autorización e idempotencia.
export function onRequest({ request }) {
  return new Response(JSON.stringify({
    ok: false,
    code: "PURCHASES_DISABLED",
    message: "Compras reales no habilitadas: falta integración y confirmación de pagos."
  }), {
    status: 403,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
