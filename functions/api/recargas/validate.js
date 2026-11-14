// Precheck informativo de Free Fire (NO crea órdenes ni consume dinero).
// Se mantiene desactivado hasta que haya producto verificado y protección antiabuso.
const BASE = "https://panel.recargasamerica.com/api/v1";
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ ok: false, code: "BAD_ORIGIN", message: "Origen no autorizado." }, 403);
  }
  const productId = Number(env.RA_FF_PRECHECK_PRODUCT_ID);
  if (!env.RA_API_KEY || env.RA_VALIDATE_ENABLED !== "true" || !Number.isSafeInteger(productId) || productId <= 0) {
    return reply({ ok: false, code: "NOT_READY", message: "Validación con Recargas América aún no habilitada." }, 503);
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ ok: false, code: "BAD_REQUEST", message: "Solicitud demasiado grande." }, 413);
    body = JSON.parse(raw);
  } catch (_) {
    return reply({ ok: false, code: "BAD_JSON", message: "Formato de solicitud incorrecto." }, 400);
  }
  const uid = String(body?.uid ?? "").trim();
  if (!/^\d{8,12}$/.test(uid)) {
    return reply({ ok: false, code: "INVALID_UID", message: "El UID de Free Fire debe tener de 8 a 12 dígitos." }, 422);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(BASE + "/catalog/validate", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RA_API_KEY,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ product_id: productId, service_user_id: uid }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      return reply({ ok: false, code: "UPSTREAM_ERROR", message: "La validación del proveedor no está disponible." }, 502);
    }
    const data = await upstream.json();
    if (data.success !== true) {
      return reply({ ok: false, code: data.code || "VALIDATION_ERROR", message: "No fue posible validar el jugador." }, 502);
    }
    if (data.data?.supported !== true) {
      return reply({ ok: true, supported: false, verified: false, message: "Este producto no admite verificación previa." });
    }
    if (data.data?.status !== true) {
      return reply({ ok: true, supported: true, verified: false, message: "El proveedor no pudo confirmar ese UID." });
    }
    return reply({
      ok: true, supported: true, verified: true,
      player: { uid, nickname: String(data.data.account_name || "Jugador validado"), regionLabel: "Sur LATAM (tienda)" }
    });
  } catch (_) {
    return reply({ ok: false, code: "NETWORK_ERROR", message: "La validación no respondió." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
