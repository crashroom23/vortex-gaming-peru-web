// Verificacion del UID con Free Fire Community (NO ejecuta recargas ni pagos).
// FREE_FIRE_API_KEY se configura como secreto privado de Cloudflare Pages.
const regions = new Set(["br", "sg", "ind"]);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const uid = (requestUrl.searchParams.get("uid") || "").trim();
  const region = (requestUrl.searchParams.get("region") || env.FREE_FIRE_REGION || "br").trim().toLowerCase();
  if (!/^\d{5,15}$/.test(uid)) {
    return json({ ok: false, message: "UID invalido: escribe entre 5 y 15 digitos." }, 400);
  }
  if (!regions.has(region)) {
    return json({ ok: false, message: "Region no valida. Usa br, sg o ind." }, 400);
  }
  if (!env.FREE_FIRE_API_KEY) {
    return json({ ok: false, message: "El administrador aun no ha configurado la API de verificacion." }, 503);
  }

  const base = (env.FREE_FIRE_API_BASE_URL || "https://developers.freefirecommunity.com/api/v1").replace(/\/+$/, "");
  const endpoint = new URL(base + "/info");
  endpoint.searchParams.set("uid", uid);
  endpoint.searchParams.set("region", region);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(endpoint, {
      headers: { "x-api-key": env.FREE_FIRE_API_KEY, "User-Agent": env.APP_USER_AGENT || "VortexGamer/1.0", "Accept": "application/json" },
      signal: controller.signal
    });
    if (!upstream.ok) {
      return json({ ok: false, message: upstream.status === 429
        ? "El servicio de verificacion alcanzo su limite temporal."
        : "El proveedor no pudo verificar esta cuenta. Revisa la clave y la region." }, 502);
    }
    const data = await upstream.json();
    const player = data?.basicInfo || data?.data?.basicInfo || data?.player;
    const nickname = player?.nickname || player?.name;
    if (!nickname) {
      return json({ ok: false, message: "No se encontro el jugador. Comprueba UID y region." }, 404);
    }
    return json({
      ok: true,
      player: {
        uid: String(player.accountId || player.uid || uid),
        nickname: String(nickname),
        level: player.level ?? null,
        region
      }
    });
  } catch (error) {
    return json({ ok: false, message: error.name === "AbortError"
      ? "La consulta tardo demasiado."
      : "No fue posible contactar al proveedor de verificacion." }, error.name === "AbortError" ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}
