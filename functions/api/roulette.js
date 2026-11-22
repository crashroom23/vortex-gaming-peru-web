import {onRequestGet as verifyFreeFire} from './freefire/verify.js';
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
const miss = 'Sigue intentando';
const unavailableSectors = [
  'S/ 2 de descuento · 0 %',
  'S/ 4 de descuento · 0 %',
  'S/ 8 de descuento · 0 %',
  '6,000 diamantes · 0 %',
  'Tu próxima compra gratis · 0 %'
];
const discount = 'S/ 1 de descuento (desde 1,000 diamantes)';
const isDiscount = label => label === discount || /^S\/ 1\.00 DESCUENTO \(de 1k para arriba\)$/i.test(label.trim());
const isMiss = label => ['sigue intentando', 'sera para la proxima'].includes(
  label.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
);
const testUntil = Date.parse('2026-11-29T05:00:00Z');
const testCodeHashes = new Set([
  '6a383f62d734ca632e156c62e199daeb281ea8f7154e6fabd90b3f4bd7e184ba',
  '7b445231ac70d02eba45330d202ad6f7cb388791b19a5cf2224899e96cce2ae0',
  '1e62374903043f0fbea603857ab9a18036c6e7cd63369019866299348e8fc64d',
  '3744321309e0a1ea141e1f6d51e4171c3935d46ee13b1b3261ccd7b0b64191a1',
  '9f0d2562bed2d1dbe7e81e43e7a1ce8a9655a19a19b857c43374961ff6616ab5',
  '210c730837a7445053aba5af4dc168054de119cef0b1be6316a9c58d946dfa05',
  '4079f388670a7e5b1f05d007a3b67cd7a677c1b86c0fb2a7543eb46562241328',
  'c4158e6e94df8437441524155dece76019e08fde2226f37c50c23a93f24033db',
  'b4367585caaf577fc71b629cac1ce7c1b2463e387e50e362166840fbb2f119bb',
  '9e4e06c4854113221887b92f62f2e91f9bdcc0311c0ed5ecd19346ae6979c971',
]);
const isTestCode = code => typeof code === 'string' && /^VT-[A-F0-9]{16}$/.test(code);

async function registerTestCode(db, code) {
  if (Date.now() >= testUntil) return;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (!testCodeHashes.has(hash)) return;
  await db.prepare('INSERT INTO roulette_entries (code, confirmed_at) VALUES (?,CURRENT_TIMESTAMP) ON CONFLICT(code) DO NOTHING')
    .bind(code).run();
}

function buildWheel(options) {
  const wheel = options.length ? options.map(label => isDiscount(label) ? discount : miss) : Array(8).fill(miss);
  if (!wheel.includes(discount)) wheel[0] = discount;
  if (!wheel.includes(miss)) wheel[wheel.length - 1] = miss;
  return wheel;
}

function addUnavailableSectors(wheel) {
  const display = [...wheel];
  const firstWin = display.indexOf(discount);
  const firstMiss = display.indexOf(miss);
  display.length = Math.max(display.length, unavailableSectors.length + 2);
  const replaceable = Array.from(display.keys()).filter(index => index !== firstWin && index !== firstMiss);
  unavailableSectors.forEach((label,index) => {
    display[replaceable[replaceable.length - unavailableSectors.length + index]] = label;
  });
  return display;
}

function randomIndex(count) {
  const limit = 2 ** 32 - (2 ** 32 % count);
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= limit);
  return random[0] % count;
}

const token = prefix => prefix + crypto.randomUUID().replaceAll('-', '').toUpperCase();
const isCode = (code, prefix) => typeof code === 'string' && code.startsWith(prefix) &&
  /^[A-F0-9]{32}$/.test(code.slice(prefix.length));

async function admin(db, body) {
  const {action, code} = body;
  if (action === 'prizes') {
    const prizes = body.prizes;
    if (!Array.isArray(prizes) || prizes.length < 2 || prizes.length > 12 ||
        prizes.some(label => typeof label !== 'string' || (!isMiss(label) && !isDiscount(label))) ||
        !prizes.some(isMiss) || !prizes.some(isDiscount))
      return reply({message:'Usa de 2 a 12 casillas e incluye «Sigue intentando» y «' + discount + '».'},400);
    await db.prepare('INSERT INTO roulette_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET prizes=excluded.prizes')
      .bind(JSON.stringify(buildWheel(prizes))).run();
    return reply({message:'Premios guardados.'});
  }
  if (action === 'create') {
    const code = token('VX-');
    await db.prepare('INSERT INTO roulette_entries (code, confirmed_at) VALUES (?,CURRENT_TIMESTAMP)').bind(code).run();
    return reply({code,message:'Código activo. Ya puedes enviarlo al cliente.'});
  }
  if (action === 'inspect' && isCode(code,'VX-')) {
    const row = await db.prepare(`SELECT uid, product_id, cents, confirmed_at, prize,
      EXISTS(SELECT 1 FROM roulette_payment_reports WHERE code=roulette_entries.code) AS reported
      FROM roulette_entries WHERE code=?`)
      .bind(code).first();
    if (!row) return reply({message:'Código de giro no encontrado.'},404);
    const status = row.prize ? 'Girado' : (row.confirmed_at || row.reported) ? 'Activo' : 'Pendiente de confirmación';
    const detail = row.product_id ? 'UID ' + row.uid + ' · Paquete #' + row.product_id +
      ' · S/ ' + (row.cents / 100).toFixed(2) : 'Código manual';
    const paymentStatus = row.reported && !row.confirmed_at ? ' · Pago por verificar' : '';
    return reply({message:detail + ' · ' + status + paymentStatus + (row.prize ? ' · ' + row.prize : '')});
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
      'UPDATE roulette_entries SET redeemed_at=CURRENT_TIMESTAMP WHERE coupon=? AND redeemed_at IS NULL AND confirmed_at IS NOT NULL RETURNING prize'
    ).bind(code).first();
    return row ? reply({message:'Cupón canjeado. Aplica el premio: ' + row.prize}) :
      reply({message:'Cupón no encontrado, ya canjeado o pendiente de confirmar el pago.'},409);
  }
  return reply({message:'Revisa la acción y el código.'},400);
}

async function createOrder(db, {action, order, uid, productId, cents}) {
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
  if (action === 'report-payment') {
    await db.prepare('INSERT INTO roulette_payment_reports (code) VALUES (?) ON CONFLICT(code) DO NOTHING')
      .bind(row.code).run();
  }
  return reply({code:row.code});
}

async function history(db, cursor) {
  const before = cursor === null ? null : Number(cursor);
  if (before !== null && (!Number.isSafeInteger(before) || before < 1))
    return reply({message:'Página de resultados inválida.'},400);
  const {results} = await db.prepare(`SELECT e.rowid AS id, e.code, e.uid, e.prize, e.coupon, e.redeemed_at,
    e.confirmed_at, e.order_token IS NOT NULL AS purchased, g.nickname, g.spun_at
    FROM roulette_entries e LEFT JOIN roulette_spin_details g ON g.code=e.code
    WHERE e.prize IS NOT NULL AND e.rowid < COALESCE(?, 9223372036854775807)
    ORDER BY e.rowid DESC LIMIT 51`).bind(before).all();
  const entries = results.slice(0,50);
  return reply({entries,next:results.length > 50 ? entries.at(-1).id : null});
}

async function spin(db, {code, uid}, wheel, origin, env) {
  const test = isTestCode(code);
  if (!test && !isCode(code,'VX-')) return reply({message:'Escribe un código de giro válido.'},400);
  if (typeof uid !== 'string' || !/^\d{5,15}$/.test(uid))
    return reply({message:'Escribe el ID de Free Fire (5 a 15 dígitos).'},400);
  if (test) await registerTestCode(db, code);
  let row = await db.prepare(`SELECT uid, confirmed_at, prize, coupon, wheel, sector,
    EXISTS(SELECT 1 FROM roulette_payment_reports WHERE code=roulette_entries.code) AS reported
    FROM roulette_entries WHERE code=?`).bind(code).first();
  if (!row) return reply({message:'Código de giro no encontrado o vencido.'},404);
  if (!row.confirmed_at && !row.reported) return reply({message:'Abre el aviso de pago por WhatsApp para activar el código.'},409);
  if (row.uid && row.uid !== uid)
    return reply({message:'El ID debe coincidir con el jugador asociado al código.'},409);
  const existing = Boolean(row.prize);
  if (!existing) {
    const verificationUrl = new URL('/api/freefire/verify',origin);
    verificationUrl.searchParams.set('uid',uid);
    const verification = await verifyFreeFire({request:new Request(verificationUrl),env});
    const profile = await verification.json();
    if (!verification.ok) return reply({message:profile.message},verification.status);
    const player = profile.player;
    if (!profile.ok || player?.uid !== uid || !player.nickname?.trim())
      return reply({message:'No pudimos confirmar el perfil de ese ID.'},422);
    const wins = [];
    const misses = [];
    wheel.forEach((label,index) => {
      if (label === discount) wins.push(index);
      if (label === miss) misses.push(index);
    });
    if (!wins.length) return reply({message:'La ruleta todavía no tiene premios configurados.'},503);
    const pool = randomIndex(5) === 0 ? wins : misses;
    const sector = pool[randomIndex(pool.length)];
    const [,, recorded] = await db.batch([
      db.prepare(`INSERT INTO roulette_spin_details (code,nickname,spun_at)
        SELECT code,?,CURRENT_TIMESTAMP FROM roulette_entries WHERE code=? AND prize IS NULL`)
        .bind(player.nickname.trim().slice(0,100),code),
      db.prepare('UPDATE roulette_entries SET uid=?,prize=?,coupon=?,wheel=?,sector=? WHERE code=? AND prize IS NULL')
        .bind(uid,wheel[sector],!test && !isMiss(wheel[sector]) ? token('VP-') : null,JSON.stringify(wheel),sector,code),
      db.prepare('SELECT uid, prize, coupon, wheel, sector FROM roulette_entries WHERE code=?').bind(code)
    ]);
    row = recorded.results[0];
    if (row.uid !== uid) return reply({message:'El código ya está asociado a otro jugador.'},409);
  }
  const details = await db.prepare('SELECT nickname FROM roulette_spin_details WHERE code=?').bind(code).first();
  return reply({prize:row.prize,coupon:isMiss(row.prize) ? null : row.coupon,prizes:JSON.parse(row.wheel),
    sector:row.sector,existing,test,player:details ? {uid,nickname:details.nickname} : null});
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
      db.prepare('CREATE TABLE IF NOT EXISTS roulette_settings (id INTEGER PRIMARY KEY, prizes TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS roulette_payment_reports (code TEXT PRIMARY KEY)'),
      db.prepare('CREATE TABLE IF NOT EXISTS roulette_spin_details (code TEXT PRIMARY KEY, nickname TEXT NOT NULL, spun_at TEXT NOT NULL)')
    ]);
    if (isAdmin) return body ? await admin(db,body) : await history(db,url.searchParams.get('before'));
    if (body?.action === 'order' || body?.action === 'report-payment') return await createOrder(db,body);
    const saved = await db.prepare('SELECT prizes FROM roulette_settings WHERE id=1').first();
    const prizes = saved ? JSON.parse(saved.prizes) : [];
    const active = buildWheel(prizes);
    const wheel = addUnavailableSectors(active);
    if (request.method === 'GET') return reply({prizes:active,wheel});
    if (body?.action === 'spin') return await spin(db,body,wheel,url.origin,env);
    return reply({message:'Acción inválida.'},400);
  } catch {
    return reply({message:'No pudimos acceder a la ruleta. Intenta de nuevo.'},503);
  }
}
