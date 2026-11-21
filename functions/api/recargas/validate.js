// Validación de UID con Recargas América: nunca genera compras ni toca billeteras.
// Protegida con Turnstile y desactivada si falta cualquier configuración.
// Para uso público, configurar además Rate Limiting/WAF en Cloudflare.
const BASE = "https://panel.recargasamerica.com/api/v1";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export async function onRequestPost({ request, env }) {
  const currentUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== currentUrl.origin) {
    return reply({ ok: false, code: "BAD_ORIGIN", message: "Origen no autorizado." }, 403);
  }

  const productId = Number(env.RA_FF_PRECHECK_PRODUCT_ID || 5);
  const testUid = String(env.RA_VALIDATE_TEST_UID || "").trim();
  if (!env.RA_API_KEY || env.RA_VALIDATE_ENABLED !== "true" ||
      !env.RA_TURNSTILE_SITE_KEY || !env.RA_TURNSTILE_SECRET ||
      !/^\d{8,12}$/.test(testUid) ||
      !Number.isSafeInteger(productId) || productId <= 0) {
    return reply({ ok: false, code: "NOT_READY", message: "La verificación de jugadores todavía no está habilitada." }, 503);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ ok: false, code: "BAD_REQUEST", message: "Solicitud demasiado grande." }, 413);
    body = JSON.parse(raw);
  } catch (_) {
    return reply({ ok: false, code: "BAD_JSON", message: "Formato de solicitud incorrecto." }, 400);
  }

  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  const token = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
  if (!/^\d{8,12}$/.test(uid)) {
    return reply({ ok: false, code: "INVALID_UID", message: "El UID de Free Fire debe tener de 8 a 12 dígitos." }, 422);
  }
  // En esta fase solo permite el UID de prueba; sin un UID de prueba válido falla cerrado.
  if (uid !== testUid) {
    return reply({ ok: false, code: "TEST_ONLY", message: "La verificación está limitada al UID autorizado para pruebas." }, 403);
  }
  if (!token || token.length > 2048) {
    return reply({ ok: false, code: "CHALLENGE_REQUIRED", message: "Completa la comprobación de seguridad e inténtalo nuevamente." }, 403);
  }

  // No enviar consultas al proveedor sin validar primero Turnstile en el servidor.
  const challengeController = new AbortController();
  const challengeTimer = setTimeout(() => challengeController.abort(), 8000);
  try {
    const payload = new URLSearchParams({ secret: env.RA_TURNSTILE_SECRET, response: token });
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) payload.set("remoteip", ip);
    const challengeResponse = await fetch(VERIFY_URL, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: challengeController.signal
    });
    if (!challengeResponse.ok) {
      return reply({ ok: false, code: "CHALLENGE_UNAVAILABLE", message: "La comprobación de seguridad no está disponible." }, 503);
    }
    const challenge = await challengeResponse.json();
    if (challenge.success !== true ||
        challenge.action !== "ff_uid" ||
        String(challenge.hostname || "").toLowerCase() !== currentUrl.hostname.toLowerCase()) {
      return reply({ ok: false, code: "CHALLENGE_FAILED", message: "Comprobación de seguridad no válida o vencida. Inténtalo nuevamente." }, 403);
    }
  } catch (_) {
    return reply({ ok: false, code: "CHALLENGE_UNAVAILABLE", message: "No se pudo comprobar el desafío de seguridad." }, 503);
  } finally {
    clearTimeout(challengeTimer);
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
      const status = upstream.status === 429 ? 429 : 502;
      return reply({
        ok: false, code: upstream.status === 429 ? "RATE_LIMIT" : "UPSTREAM_ERROR",
        message: status === 429 ? "El proveedor limitó temporalmente las consultas." : "La validación del proveedor no está disponible."
      }, status);
    }
    const data = await upstream.json();
    if (data.success !== true) {
      return reply({ ok: false, code: "VALIDATION_ERROR", message: "No fue posible validar el jugador." }, 502);
    }
    if (data.data?.supported !== true) {
      return reply({ ok: true, supported: false, verified: false, message: "Este producto no admite verificación previa." });
    }
    if (data.data?.status !== true) {
      return reply({ ok: true, supported: true, verified: false, message: "El proveedor no pudo confirmar ese UID." });
    }
    const rawName = data.data.account_name;
    const nickname = typeof rawName === "string" && rawName.trim() ? rawName.trim().slice(0, 100) : null;
    if (nickname?.toLowerCase() === "sandbox user") {
      return reply({
        ok: true, supported: true, verified: false, code: "SANDBOX_RESULT",
        message: "La verificación devolvió un usuario de prueba. El nombre real del jugador sigue sin confirmar."
      });
    }
    return reply({
      ok: true, supported: true, verified: true,
      player: { uid, nickname }
    });
  } catch (_) {
    return reply({ ok: false, code: "NETWORK_ERROR", message: "La validación no respondió." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
