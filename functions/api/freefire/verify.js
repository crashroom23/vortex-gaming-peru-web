// Consulta perfiles públicos. Esta ruta no ejecuta recargas ni pagos.
const FIXED_LATAM_REGION = "br";
const FREE_FIRE_MANIA = "https://www.freefiremania.com.br";
const PROFILE_TIMEOUT_MS = 5000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

async function findPublicProfile(uid) {
  // La ficha se sirve como HTML. Su JSON-LD identifica al jugador por UID.
  const url = new URL(`/cuenta/${uid}.html`, FREE_FIRE_MANIA);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS)
    });
    if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
      return { code: "PROFILE_NOT_FOUND" };
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      return { code: "PROFILE_UNAVAILABLE" };
    }

    const html = await response.text();
    const structuredData = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    const page = structuredData && JSON.parse(structuredData)["@graph"]?.find(
      entry => entry.url === url.href && entry.mainEntity?.["@type"] === "Person"
    );
    const person = page?.mainEntity;
    const nickname = person?.name;
    if (String(person?.identifier?.value) !== uid || typeof nickname !== "string" || !nickname.trim()) {
      return { code: "PROFILE_UNAVAILABLE" };
    }

    const profilePrefix = `Consulta el perfil de ${nickname} (ID ${uid}) en Free Fire, `;
    const description = page.description || "";
    const metadata = description.startsWith(profilePrefix)
      ? description.slice(profilePrefix.length).match(/^nivel (\d+), región ([a-z]+)\b/i)
      : null;
    const region = metadata?.[2]?.toUpperCase();
    if (!region) return { code: "PROFILE_UNAVAILABLE" };
    if (region !== "SAC") return { code: "REGION_UNSUPPORTED" };
    return { player: { uid, nickname, region, level: Number(metadata[1]) } };
  } catch {
    return { code: "PROFILE_UNAVAILABLE" };
  }
}

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const uid = (requestUrl.searchParams.get("uid") || "").trim();
  const region = FIXED_LATAM_REGION; // No se permite seleccionar otra región desde el cliente.
  if (!/^\d{5,15}$/.test(uid)) {
    return json({ ok: false, message: "UID invalido: escribe entre 5 y 15 digitos." }, 400);
  }
  const profile = await findPublicProfile(uid);
  if (profile.player) {
    return json({ ok: true, source: "Free Fire Mania", player: profile.player });
  }
  if (profile.code === "REGION_UNSUPPORTED") {
    return json({ ok: false, code: profile.code, message: "Este perfil pertenece a otra región. La tienda atiende Sur LATAM." }, 422);
  }
  if (!env.FREE_FIRE_API_KEY) {
    const unavailable = profile.code === "PROFILE_UNAVAILABLE";
    return json({
      ok: false,
      code: profile.code,
      message: unavailable
        ? "La consulta de perfiles no está disponible. Inténtalo en unos momentos."
        : "No pudimos confirmar el ID con una ficha pública. Revisa el número o inténtalo después."
    }, unavailable ? 502 : 404);
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
