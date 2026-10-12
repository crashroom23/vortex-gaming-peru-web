require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.FREE_FIRE_API_KEY || "";
const API_BASE = (process.env.FREE_FIRE_API_BASE_URL ||
  "https://developers.freefirecommunity.com/api/v1").replace(/\/+$/, "");
const DEFAULT_REGION = (process.env.FREE_FIRE_REGION || "br").toLowerCase();
const USER_AGENT = process.env.APP_USER_AGENT || "VortexGamingPeru/1.0";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const allowedRegions = new Set(["br", "sg", "ind"]);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// Servir la web desde la misma aplicación: no necesita CORS en el uso normal.
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas consultas. Espera un minuto e inténtalo otra vez." }
}));

// Si configuras ALLOWED_ORIGINS, limita solicitudes API cross-origin a esos dominios.
// Las llamadas desde la propia página usan el mismo origen.
app.use("/api/", (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin === `${req.protocol}://${req.get("host")}`) return next();
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.sendStatus(204);
    }
    return next();
  }
  return res.status(403).json({ ok: false, message: "Origen no autorizado." });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Vortex Gaming Perú",
    apiKeyConfigured: Boolean(API_KEY && API_KEY !== "PEGA_TU_CLAVE_API_AQUI")
  });
});

app.get("/api/freefire/verify", async (req, res) => {
  const uid = String(req.query.uid || "").trim();
  const region = String(req.query.region || DEFAULT_REGION).trim().toLowerCase();

  if (!/^\d{5,15}$/.test(uid)) {
    return res.status(400).json({ ok: false, message: "UID inválido. Introduce entre 5 y 15 dígitos, sin espacios." });
  }
  if (!allowedRegions.has(region)) {
    return res.status(400).json({ ok: false, message: "Región no válida. Usa br, sg o ind." });
  }
  if (!API_KEY || API_KEY === "PEGA_TU_CLAVE_API_AQUI") {
    return res.status(503).json({
      ok: false,
      message: "Falta configurar la clave de Free Fire Community en el servidor. Añádela en el archivo .env."
    });
  }

  const url = new URL(`${API_BASE}/info`);
  url.searchParams.set("uid", uid);
  url.searchParams.set("region", region);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": API_KEY, "User-Agent": USER_AGENT },
      signal: controller.signal
    });
    const raw = await upstream.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}

    if (!upstream.ok) {
      console.error("Free Fire API status:", upstream.status);
      if (upstream.status === 429) {
        return res.status(503).json({ ok: false, message: "La API alcanzó su límite de consultas. Inténtalo más tarde." });
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return res.status(502).json({ ok: false, message: "La API rechazó la consulta. Revisa la clave, el plan y los requisitos del proveedor." });
      }
      return res.status(502).json({ ok: false, message: "El proveedor no pudo completar la consulta." });
    }

    const player = data?.basicInfo || data?.data?.basicInfo || data?.player;
    const nickname = player?.nickname || player?.name;
    if (!nickname) {
      return res.status(404).json({ ok: false, message: "No se encontró el nombre esperado. Comprueba el UID, la región o el formato de respuesta." });
    }

    res.json({
      ok: true,
      player: {
        uid: String(player.accountId || player.uid || uid),
        nickname,
        level: player.level ?? null,
        region
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ ok: false, message: "La consulta tardó demasiado. Inténtalo otra vez." });
    }
    console.error("Error API:", error.message);
    res.status(502).json({ ok: false, message: "No se pudo conectar con el proveedor de la API." });
  } finally {
    clearTimeout(timeout);
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Vortex Gaming Perú listo en puerto ${PORT}`));
