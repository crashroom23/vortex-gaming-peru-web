// Estado de configuración. Nunca revela credenciales ni saldo de la billetera.
export function onRequestGet({ env }) {
  const configured = Boolean(env.RA_API_KEY);
  const enabled = configured && env.RA_VALIDATE_ENABLED === "true" && /^\d+$/.test(String(env.RA_FF_PRECHECK_PRODUCT_ID || ""));
  return new Response(JSON.stringify({
    ok: true,
    service: "RecargasAmerica",
    catalogConfigured: configured,
    validationReady: enabled,
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
