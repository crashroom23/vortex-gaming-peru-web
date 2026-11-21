import {hashPassword, randomHex, readSessionToken} from './account.js';
import {authorized} from './site-settings.js';
import {checkoutPackage} from './preview-orders.js';
import {readSettings} from '../lib/site-settings.js';

const previewHost = 'preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev';
const reply = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
const validCents = (cents) => Number.isSafeInteger(cents) && cents > 0 && cents <= 9999999;
const validCode = (code) => typeof code === 'string' && /^[a-f0-9-]{36}$/.test(code);

async function account(db, username) {
  return db.prepare('SELECT username, balance_cents FROM preview_accounts WHERE username = ?').bind(username).first();
}

async function movement(db, data) {
  const {code, username, kind, cents, productId = null, uid = null} = data;
  const stored = await db.prepare(`
    INSERT INTO preview_wallet_movements (code, username, kind, cents, product_id, uid)
    SELECT ?, username, ?, ?, ?, ? FROM preview_accounts
    WHERE username = ? AND CASE ? WHEN 'credit' THEN balance_cents + ? <= 99999999 ELSE balance_cents >= ? END
    ON CONFLICT(code) DO NOTHING
    RETURNING code, username, kind, cents, product_id, uid, created_at
  `).bind(code, kind, cents, productId, uid, username, kind, cents, cents).first();
  return stored ?? db.prepare('SELECT * FROM preview_wallet_movements WHERE code = ?').bind(code).first();
}

async function administer(request, db, env, body) {
  if (!await authorized(request, env.VORTEX_ADMIN_KEY)) return reply({message:'Clave de administrador inválida.'}, 401);
  if (request.method === 'GET') {
    const query = new URL(request.url).searchParams.get('users');
    if (query !== null) {
      if (!/^[a-z0-9_]{1,24}$/.test(query)) return reply({users:[]});
      const users = await db.prepare(`
        SELECT username, balance_cents FROM preview_accounts
        WHERE instr(username, ?) > 0
        ORDER BY instr(username, ?), username LIMIT 8
      `).bind(query, query).all();
      return reply({users:users.results});
    }
    const [users, orders, prices] = await db.batch([
      db.prepare('SELECT username, balance_cents FROM preview_accounts ORDER BY username LIMIT 200'),
      db.prepare("SELECT code, username, cents, product_id, uid, created_at FROM preview_wallet_movements WHERE kind = 'purchase' ORDER BY rowid DESC LIMIT 50"),
      db.prepare('SELECT product_id, cents FROM preview_wallet_prices ORDER BY product_id')
    ]);
    return reply({users:users.results, orders:orders.results, prices:prices.results});
  }

  const {action, cents, code, productId, password} = body || {};
  if (action === 'price') {
    if (!Number.isSafeInteger(productId) || (cents !== null && !validCents(cents))) {
      return reply({message:'Revisa el código del paquete y el precio.'}, 400);
    }
    if (cents === null) {
      await db.prepare('DELETE FROM preview_wallet_prices WHERE product_id = ?').bind(productId).run();
    } else {
      const {settings} = await readSettings(db);
      if (!checkoutPackage(settings, productId)?.visible) return reply({message:'El paquete no está disponible.'}, 404);
      await db.prepare('INSERT INTO preview_wallet_prices (product_id, cents) VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET cents = excluded.cents')
        .bind(productId, cents).run();
    }
    return reply({saved:true});
  }

  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return reply({message:'Usa de 3 a 24 letras, números o guiones bajos.'}, 400);

  if (action === 'create' || action === 'resetPassword') {
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return reply({message:'La contraseña debe tener entre 6 y 128 caracteres.'}, 400);
    }
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt, env.PREVIEW_ACCOUNT_PEPPER);
    if (action === 'resetPassword') {
      const [updated] = await db.batch([
        db.prepare('UPDATE preview_accounts SET salt = ?, password_hash = ? WHERE username = ?')
          .bind(salt, hash, username),
        db.prepare('DELETE FROM preview_sessions WHERE username = ?').bind(username),
        db.prepare('DELETE FROM preview_auth_attempts WHERE scope = ?').bind('user:' + username)
      ]);
      return updated.meta.changes ? reply({username}) : reply({message:'Usuario no encontrado.'}, 404);
    }
    const user = await db.prepare(`
      INSERT INTO preview_accounts (username, salt, password_hash) VALUES (?, ?, ?)
      ON CONFLICT(username) DO NOTHING RETURNING username
    `).bind(username, salt, hash).first();
    return user ? reply({username}, 201) : reply({message:'Ese usuario ya existe.'}, 409);
  }

  if (action !== 'credit' || !validCents(cents) || !validCode(code)) return reply({message:'Revisa el importe.'}, 400);
  const user = await account(db, username);
  if (!user) return reply({message:'Usuario no encontrado.'}, 404);
  const credit = await movement(db, {code, username, kind:'credit', cents});
  if (!credit) return reply({message:'El saldo superaría el límite.'}, 409);
  if (credit.username !== username || credit.kind !== 'credit' || credit.cents !== cents) {
    return reply({message:'La referencia ya pertenece a otra operación.'}, 409);
  }
  return reply(await account(db, username));
}

async function customer(request, db, url, body) {
  const token = await readSessionToken(request);
  const user = token && await db.prepare(`
    SELECT a.username, a.balance_cents FROM preview_sessions s
    JOIN preview_accounts a ON a.username = s.username
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(token, Math.floor(Date.now()/1000)).first();
  if (!user) return reply({username:null, message:'Inicia sesión para pagar con saldo.'}, 401);

  const productId = request.method === 'GET' ? Number(url.searchParams.get('product')) : body?.productId;
  if (request.method === 'GET' && url.searchParams.has('history')) {
    const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1) return reply({message:'Página inválida.'}, 400);
    const {results} = await db.prepare(`
      SELECT rowid AS cursor, code, product_id AS productId, uid, cents, created_at AS createdAt
      FROM preview_wallet_movements
      WHERE username = ? AND kind = 'purchase' AND rowid < ?
      ORDER BY rowid DESC LIMIT 21
    `).bind(user.username, before).all();
    const page = results.slice(0, 20);
    return reply({...user, orders:page.map(({cursor, ...order}) => order),
      next:results.length > page.length ? page.at(-1).cursor : null});
  }
  if (request.method === 'GET' && !url.searchParams.has('product')) return reply(user);
  const {uid, code, cents:expectedCents} = body || {};
  if (request.method === 'POST' && (!validCode(code) || typeof uid !== 'string' || !/^\d{8,12}$/.test(uid) || !validCents(expectedCents))) {
    return reply({message:'Revisa el UID y vuelve a seleccionar el paquete.'}, 400);
  }

  const receipt = (order) => {
    if (order.username !== user.username || order.kind !== 'purchase' || order.product_id !== productId ||
        order.uid !== uid || order.cents !== expectedCents) return reply({message:'Referencia de pedido en uso.'}, 409);
    return reply({order:{code:order.code, uid:order.uid, cents:order.cents, createdAt:order.created_at}});
  };
  if (request.method === 'POST') {
    const existing = await db.prepare('SELECT * FROM preview_wallet_movements WHERE code = ?').bind(code).first();
    if (existing) return receipt(existing);
  }

  const {settings} = await readSettings(db);
  const product = Number.isSafeInteger(productId) && checkoutPackage(settings, productId);
  if (!product?.visible) return reply({message:'Este paquete ya no está disponible.'}, 404);
  const special = await db.prepare('SELECT cents FROM preview_wallet_prices WHERE product_id = ?').bind(productId).first();
  const cents = special?.cents ?? product.cents;
  if (request.method === 'GET') return reply({...user, cents});
  if (expectedCents !== cents) return reply({message:'El precio cambió. Vuelve a abrir el pedido.'}, 409);
  const order = await movement(db, {code, username:user.username, kind:'purchase', cents, productId, uid});
  return order ? receipt(order) : reply({
    code:'INSUFFICIENT_BALANCE',
    username:user.username,
    message:'Saldo insuficiente. Solicita una recarga de saldo.'
  }, 409);
}

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  if (url.hostname !== previewHost) return reply({message:'Ruta no disponible.'}, 404);
  const db = env.ORDERS_DB;
  if (!db || (env.PREVIEW_ACCOUNT_PEPPER?.length ?? 0) < 32) {
    return reply({message:'La billetera aún no está habilitada en esta vista previa.'}, 503);
  }
  if (!['GET','POST'].includes(request.method)) return reply({message:'Método no permitido.'}, 405);

  let body;
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) {
      return reply({message:'Solicitud no permitida.'}, 403);
    }
    try {
      const raw = await request.text();
      if (raw.length > 2048) return reply({message:'Solicitud demasiado larga.'}, 413);
      body = JSON.parse(raw);
    } catch {
      return reply({message:'Solicitud inválida.'}, 400);
    }
  }
  try {
    return await (url.searchParams.get('admin') === '1' ? administer(request, db, env, body) : customer(request, db, url, body));
  } catch {
    return reply({message:'La billetera no está disponible en este momento.'}, 503);
  }
}
