import {readSettings} from '../lib/site-settings.js';
const prices = new Map([[100,[10,350]],[310,[31,980]],[520,[52,1500]],[1060,[106,2700]],[2180,[218,5200]],[5600,[560,13000]]]);
const cardOfferId = 30003;
const levelOfferId = 30005;
const individualCards = new Map([
  [30001, {title:'Tarjeta básica', cents:200}],
  [30002, {title:'Tarjeta semanal', cents:650}],
  [30004, {title:'Tarjeta mensual', cents:2800}]
]);
function decodeFragment(id) {
  if (!Number.isSafeInteger(id)) return null;
  const group = Math.floor(id / 1000000);
  const quantity = id % 1000000;
  if (![1,2].includes(group) || quantity < 1 || quantity > 99999) return null;
  return {kind:group === 1 ? 'cajas' : 'tokens', quantity};
}
const host = 'preview-gamer-aura-v2.vortex-gaming-peru-web.pages.dev';
const reply = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export async function onRequest({request, env}) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (url.hostname !== host) return reply({message:'Ruta no disponible.'},404);
  if (origin && origin !== url.origin) return reply({message:'Origen no permitido.'},403);
  const db = env.ORDERS_DB;
  if (!db) return reply({message:'El registro de pedidos de prueba aún no está disponible.'},503);
  const method = request.method;
  if (!['GET','POST','PATCH'].includes(method)) return reply({message:'Método no permitido.'},405);
  let body;
  if (method !== 'GET') {
    try {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({message:'Formato no válido.'},415);
      const raw = await request.text();
      if (raw.length > 2048) return reply({message:'Solicitud demasiado grande.'},413);
      body = JSON.parse(raw);
    } catch (_) { return reply({message:'Solicitud no válida.'},400); }
  }
  const code = method === 'GET' ? url.searchParams.get('code') : body?.code;
  if (typeof code !== 'string' || !/^VG-[A-F0-9]{32}$/.test(code)) return reply({message:'Código de pedido no válido.'},400);
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS demo_order_prices (code TEXT PRIMARY KEY, cents INTEGER NOT NULL)').run();
    if (method === 'POST') {
      const {uid, productId, paymentMethod} = body;
      const fragment = decodeFragment(productId);
      if (typeof uid !== 'string' || !/^\d{8,12}$/.test(uid) || (!prices.has(productId) && productId !== cardOfferId && productId !== levelOfferId && !individualCards.has(productId) && !fragment) ||
          !['yape','binance'].includes(paymentMethod)) return reply({message:'Revisa el UID, paquete y método.'},400);
      const player = typeof body.player === 'string' ? body.player.trim().slice(0,100) : '';
      const existing = await db.prepare('SELECT code FROM demo_orders WHERE code=?').bind(code).first();
      if (!existing) {
        const {settings} = await readSettings(db);
        const individualCard = individualCards.get(productId);
        const fragmentOption = fragment && settings.fragments[fragment.kind].find(option => option.quantity === fragment.quantity);
        const packageSettings = fragment ? fragmentOption && {...fragmentOption,visible:true} : individualCard
          ? {cents:individualCard.cents, visible:settings.offers.tarjetas.visible}
          : productId === levelOfferId ? settings.offers.nivel
          : productId === cardOfferId ? settings.offers.tarjetas : settings.products[productId];
        if (!packageSettings?.visible || (body.cents !== undefined && body.cents !== packageSettings.cents))
          return reply({message:'El paquete o precio cambió. Recarga la página y vuelve a elegir.'},409);
        await db.batch([
          db.prepare('INSERT INTO demo_order_prices (code,cents) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM demo_orders WHERE code=?) ON CONFLICT(code) DO NOTHING')
            .bind(code,packageSettings.cents,code),
          db.prepare('INSERT INTO demo_orders (code,uid,player,product_id,payment_method) VALUES (?,?,?,?,?) ON CONFLICT(code) DO NOTHING')
            .bind(code,uid,player || 'Jugador de prueba',productId,paymentMethod)
        ]);
      }
    }
    if (method === 'PATCH') {
      if (body.stage !== 0 && body.stage !== 1) return reply({message:'Etapa no válida.'},400);
      await db.prepare('UPDATE demo_orders SET stage = stage + 1 WHERE code = ? AND stage = ?').bind(code,body.stage).run();
    }
    const row = await db.prepare('SELECT * FROM demo_orders WHERE code = ?').bind(code).first();
    if (!row) return reply({message:'No encontramos ese pedido de prueba.'},404);
    if (method === 'POST' && (row.uid !== body.uid || row.product_id !== body.productId || row.payment_method !== body.paymentMethod)) {
      return reply({message:'El código ya pertenece a otro pedido.'},409);
    }
    const storedPrice = await db.prepare('SELECT cents FROM demo_order_prices WHERE code=?').bind(code).first();
    const isLevelOffer = row.product_id === levelOfferId;
    const isCardOffer = row.product_id === cardOfferId;
    const individualCard = individualCards.get(row.product_id);
    const [bonus,originalCents] = prices.get(row.product_id) ?? [0, individualCard?.cents ?? (isLevelOffer ? 1400 : 4000)];
    const fragment = decodeFragment(row.product_id);
    const fragmentName = fragment && (fragment.quantity + ' ' + fragment.kind + (fragment.kind === 'cajas' ? ' evolutivas' : ' evolutivos'));
    const packageName = isLevelOffer ? 'Aumento de nivel' : fragmentName || (individualCard?.title ?? (isCardOffer
      ? 'Oferta de 3 tarjetas'
      : row.product_id.toLocaleString('en-US') + ' + ' + bonus + ' diamantes'));
    const cents = storedPrice?.cents ?? originalCents;
    return reply({order:{
      code:row.code, uid:row.uid, player:row.player, stage:row.stage, createdAt:row.created_at,
      package:packageName,
      total:cents / 100, method:row.payment_method === 'yape' ? 'Yape' : 'Binance Pay'
    }});
  } catch (_) { return reply({message:'No se pudo acceder a los pedidos de prueba.'},503); }
}
