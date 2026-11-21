import {authorized} from './site-settings.js';
import {checkoutPackage} from './preview-orders.js';
import {readSettings} from '../lib/site-settings.js';

const hosts = new Set([
  'vortexperu.store',
  'vortex-gaming-peru-web.pages.dev',
  'preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev'
]);
const reply = (data, status = 200) => Response.json(data, {
  status, headers:{'Cache-Control':'no-store'}
});
const miss = 'Será para la próxima';
const token = prefix => prefix + crypto.randomUUID().replaceAll('-', '').toUpperCase();
const isCode = (code, prefix) => typeof code === 'string' && code.startsWith(prefix) &&
  /^[A-F0-9]{32}$/.test(code.slice(prefix.length));

async function admin(db, body) {
  const {action, code} = body;
  if (action === 'prizes') {
    const prizes = body.prizes;
    if (!Array.isArray(prizes) || prizes.length < 2 || prizes.length > 8 ||
        prizes.some(label => typeof label !== 'string' || !label.trim() || label.length > 40 || label.trim().toLowerCase() === miss.toLowerCase()))
      return reply({message:'Ingresa de 2 a 8 premios de hasta 40 caracteres. «Será para la próxima» se agrega automáticamente.'},400);
    await db.prepare('INSERT INTO roulette_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET prizes=excluded.prizes')
      .bind(JSON.stringify(prizes.map(label => label.trim()))).run();
    return reply({message:'Premios guardados.'});
  }
  if (action === 'create') {
    const code = token('VX-');
    await db.prepare('INSERT INTO roulette_entries (code, confirmed_at) VALUES (?,CURRENT_TIMESTAMP)').bind(code).run();
    return reply({code,message:'Código activo. Ya puedes enviarlo al cliente.'});
  }
  if (action === 'inspect' && isCode(code,'VX-')) {
    const row = await db.prepare('SELECT uid, product_id, cents, confirmed_at, prize FROM roulette_entries WHERE code=?')
      .bind(code).first();
    if (!row) return reply({message:'Código de giro no encontrado.'},404);
    const status = row.prize ? 'Girado' : row.confirmed_at ? 'Activo' : 'Pendiente de confirmación';
    const detail = row.uid ? 'UID ' + row.uid + ' · Paquete #' + row.product_id +
      ' · S/ ' + (row.cents / 100).toFixed(2) : 'Código manual';
    return reply({message:detail + ' · ' + status});
  }
  if (action === 'confirm' && isCode(code,'VX-')) {
    const row = await db.prepare(
      'UPDATE roulette_entries SET confirmed_at=COALESCE(confirmed_at,CURRENT_TIMESTAMP) WHERE code=? RETURNING code'
    ).bind(code).first();
    return row ? reply({code,message:'Pago confirmado. El código de giro está activo.'}) :
      reply({message:'Código de giro no encontrado.'},404);
  }
  if (action === 'redeem' && isCode(code,'VP-')) {
    const row = await db.prepare(
      'UPDATE roulette_entries SET redeemed_at=CURRENT_TIMESTAMP WHERE coupon=? AND redeemed_at IS NULL RETURNING prize'
    ).bind(code).first();
    return row ? reply({message:'Cupón canjeado. Aplica el premio: ' + row.prize}) :
      reply({message:'Cupón no encontrado o ya canjeado.'},409);
  }
  return reply({message:'Revisa la acción y el código.'},400);
}

async function createOrder(db, {order, uid, productId, cents}) {
  if (typeof order !== 'string' || !/^[a-f0-9-]{36}$/.test(order) ||
      typeof uid !== 'string' || !/^\d{8,12}$/.test(uid) || !Number.isSafeInteger(productId) ||
      !Number.isSafeInteger(cents) || cents <= 0)
    return reply({message:'Pedido inválido.'},400);
  let row = await db.prepare('SELECT code, uid, product_id, cents FROM roulette_entries WHERE order_token=?').bind(order).first();
  if (!row) {
    const {settings} = await readSettings(db);
    const product = checkoutPackage(settings,productId);
    if (!product?.visible || cents !== product.cents)
      return reply({message:'El precio o paquete cambió. Actualiza la página.'},409);
    await db.prepare('INSERT INTO roulette_entries (code,order_token,uid,product_id,cents) VALUES (?,?,?,?,?) ON CONFLICT(order_token) DO NOTHING')
      .bind(token('VX-'),order,uid,productId,cents).run();
    row = await db.prepare('SELECT code, uid, product_id, cents FROM roulette_entries WHERE order_token=?').bind(order).first();
  }
  if (row.uid !== uid || row.product_id !== productId || row.cents !== cents)
    return reply({message:'Ese código de pedido corresponde a otro pago.'},409);
  return reply({code:row.code});
}

async function spin(db, code, prizes) {
  if (!isCode(code,'VX-')) return reply({message:'Escribe un código de giro válido.'},400);
  let row = await db.prepare('SELECT confirmed_at, prize, coupon, wheel, sector FROM roulette_entries WHERE code=?').bind(code).first();
  if (!row) return reply({message:'Código de giro no encontrado.'},404);
  if (!row.confirmed_at) return reply({message:'El código se activa cuando confirmemos tu pago.'},409);
  const existing = Boolean(row.prize);
  if (!existing) {
    if (!prizes.length) return reply({message:'La ruleta todavía no tiene premios configurados.'},503);
    const wheel = [miss, ...prizes];
    const tickets = 5 * prizes.length;
    const limit = 2 ** 32 - (2 ** 32 % tickets);
    const random = new Uint32Array(1);
    do { crypto.getRandomValues(random); } while (random[0] >= limit);
    const ticket = random[0] % tickets;
    const sector = ticket < prizes.length ? ticket + 1 : 0;
    await db.prepare('UPDATE roulette_entries SET prize=?,coupon=?,wheel=?,sector=? WHERE code=? AND prize IS NULL')
      .bind(wheel[sector],sector ? token('VP-') : null,JSON.stringify(wheel),sector,code).run();
    row = await db.prepare('SELECT prize, coupon, wheel, sector FROM roulette_entries WHERE code=?').bind(code).first();
  }
  return reply({prize:row.prize,coupon:row.coupon,prizes:JSON.parse(row.wheel),sector:row.sector,existing});
}

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  if (!hosts.has(url.hostname)) return reply({message:'Ruta no disponible.'},404);
  const db = env.ORDERS_DB;
  if (!db) return reply({message:'La ruleta aún no está disponible.'},503);
  const isAdmin = url.searchParams.get('admin') === '1';
  if (isAdmin && !await authorized(request,env.VORTEX_ADMIN_KEY))
    return reply({message:'Clave de administrador inválida.'},401);
  try {
    let body;
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json'))
        return reply({message:'Solicitud no permitida.'},403);
      try {
        const raw = await request.text();
        if (raw.length > 2048) return reply({message:'Solicitud demasiado grande.'},413);
        body = JSON.parse(raw);
      } catch { return reply({message:'Solicitud inválida.'},400); }
    } else if (request.method !== 'GET') return reply({message:'Método no disponible.'},405);

    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS roulette_entries (
        code TEXT PRIMARY KEY, order_token TEXT UNIQUE, uid TEXT, product_id INTEGER, cents INTEGER,
        confirmed_at TEXT, prize TEXT, coupon TEXT UNIQUE, wheel TEXT, sector INTEGER, redeemed_at TEXT)`),
      db.prepare('CREATE TABLE IF NOT EXISTS roulette_settings (id INTEGER PRIMARY KEY, prizes TEXT NOT NULL)')
    ]);
    if (isAdmin && body) return await admin(db,body);
    if (body?.action === 'order') return await createOrder(db,body);
    const saved = await db.prepare('SELECT prizes FROM roulette_settings WHERE id=1').first();
    const prizes = saved ? JSON.parse(saved.prizes) : [];
    if (request.method === 'GET') return reply({prizes,wheel:prizes.length ? [miss, ...prizes] : []});
    if (body?.action === 'spin') return await spin(db,body.code,prizes);
    return reply({message:'Acción inválida.'},400);
  } catch {
    return reply({message:'No pudimos acceder a la ruleta. Intenta de nuevo.'},503);
  }
}
