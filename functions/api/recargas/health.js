// Estado de configuración. Expone únicamente el sitekey público de Turnstile, nunca claves privadas ni saldo.
export function onRequestGet({ env }) {
  const configured = Boolean(env.RA_API_KEY);
  const turnstileConfigured = Boolean(env.RA_TURNSTILE_SITE_KEY && env.RA_TURNSTILE_SECRET);
  const productId = Number(env.RA_FF_PRECHECK_PRODUCT_ID || 5);
  const enabled = Boolean(env.ORDERS_DB) && configured && turnstileConfigured && env.RA_VALIDATE_ENABLED === "true" &&
    Number.isSafeInteger(productId) && productId > 0;
  return new Response(JSON.stringify({
    ok: true,
    catalogConfigured: configured,
    validationReady: enabled,
    turnstileConfigured,
    turnstileSiteKey: enabled ? String(env.RA_TURNSTILE_SITE_KEY) : null,
    purchasesEnabled: false,
    note: "No se cobran ni ejecutan recargas desde esta integración."
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
