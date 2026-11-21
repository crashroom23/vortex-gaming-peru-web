import {authorized} from "../site-settings.js";

// Catálogo de diagnóstico para administración. La clave privada permanece en Cloudflare.
// La respuesta expone solamente productos de Free Fire, nunca precios mayoristas.
const BASE = "https://panel.recargasamerica.com/api/v1";
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: status === 200 ? headers : { ...headers, "cache-control": "no-store" }
});

export async function onRequestGet({ request, env }) {
  if (!await authorized(request, env.VORTEX_ADMIN_KEY)) return reply({ ok: false, message: "Acceso no autorizado." }, 401);
  if (!env.RA_API_KEY) return reply({ ok: false, code: "NOT_CONFIGURED", message: "El catálogo aún no está configurado." }, 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(BASE + "/products/catalog", {
      headers: { Authorization: "Bearer " + env.RA_API_KEY, Accept: "application/json" },
      signal: controller.signal
    });
    if (!upstream.ok) {
      const reason = upstream.status === 401 ? "AUTH_FAILED" :
        upstream.status === 403 ? "ACCESS_DENIED" :
        upstream.status === 429 ? "RATE_LIMIT" : "UPSTREAM_UNAVAILABLE";
      return reply({ ok: false, code: reason, message: "No se pudo consultar el catálogo del proveedor." }, 502);
    }
    const body = await upstream.json();
    if (body.success !== true || !Array.isArray(body.data)) {
      return reply({ ok: false, code: "INVALID_RESPONSE", message: "El proveedor devolvió un catálogo inesperado." }, 502);
    }
    const products = body.data.filter(item => {
      if (!item || item.type !== "recharge" || item.id == null) return false;
      const name = String(item.name || "").toLowerCase();
      const sku = String(item.sku || "").toLowerCase();
      return name.includes("free fire") || name.includes("freefire") || sku.startsWith("mp-ff");
    }).slice(0, 80).map(item => ({
      id: item.id,
      sku: String(item.sku || ""),
      name: String(item.name || ""),
      type: "recharge",
      required_fields: Array.isArray(item.required_fields) ? item.required_fields.filter(x => ["player_id", "zone_id", "server_id"].includes(x)) : []
    }));
    return reply({ ok: true, products });
  } catch (_) {
    return reply({ ok: false, code: "NETWORK_ERROR", message: "No se pudo contactar al proveedor." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
