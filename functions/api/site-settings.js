import {readSettings, validSettings} from '../lib/site-settings.js';

const previewHost = 'preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev';
const reply = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const bearer = request.headers.get('Authorization') || '';
  if (!bearer.startsWith('Bearer ') || bearer.length > 256) return false;
  const encoder = new TextEncoder();
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
  const [actual, expected] = await Promise.all([digest(bearer.slice(7)),digest(secret)]);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual[i] ^ expected[i];
  return mismatch === 0;
}

export async function onRequest({request,env}) {
  const url = new URL(request.url);
  const db = env.ORDERS_DB;
  const isAdmin = url.searchParams.get('admin') === '1' || request.method !== 'GET';
  if (url.hostname !== previewHost) return reply({message:'Ruta no disponible.'},404);
  try {
    if (isAdmin) {
      if (!db || !env.VORTEX_ADMIN_KEY || env.VORTEX_ADMIN_KEY.length < 32)
        return reply({message:'El acceso de administrador aún no está configurado.'},503);
      if (!await authorized(request,env.VORTEX_ADMIN_KEY)) return reply({message:'Clave incorrecta.'},401);
    }
    if (request.method === 'GET') {
      const data = await readSettings(db);
      if (!isAdmin) {
        data.settings = {...data.settings, payment:{whatsapp:data.settings.payment?.whatsapp || ''}};
      }
      return reply(data);
    }
    if (request.method !== 'PUT') return reply({message:'Método no disponible.'},405);
    if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json'))
      return reply({message:'Solicitud no permitida.'},403);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 900000) return reply({message:'Las imágenes superan el tamaño permitido.'},413);
    let data;
    try { data = JSON.parse(raw); }
    catch { return reply({message:'Solicitud inválida.'},400); }
    if (!Number.isSafeInteger(data?.revision) || data.revision < 0 || !validSettings(data.settings))
      return reply({message:'Revisa los textos, precios, imágenes y el número de WhatsApp.'},400);
    await db.prepare('CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)').run();
    const result = await db.prepare(
      'INSERT INTO site_settings(id,revision,value) SELECT 1,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM site_settings WHERE id=1) ' +
      'ON CONFLICT(id) DO UPDATE SET revision=site_settings.revision+1,value=excluded.value WHERE site_settings.revision=?'
    ).bind(JSON.stringify(data.settings),data.revision,data.revision).run();
    if (!result.meta.changes) return reply({message:'Hay una versión más reciente. Sal y vuelve a entrar antes de publicar.'},409);
    return reply({revision:data.revision+1});
  } catch {
    return reply({message:'No se pudo acceder a la configuración.'},503);
  }
}
