function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

export async function onRequestGet({ env }) {
  return reply({
    ok: true,
    app: "VortexGamer",
    platform: "Cloudflare Pages Functions",
    freeFireVerificationConfigured: Boolean(env.FREE_FIRE_API_KEY),
    paymentsEnabled: false
  });
}
