export const priceDefaults = {
  100:350, 220:680, 310:981, 441:1320, 520:1500, 792:2200,
  1060:2700, 2180:5200, 4796:10300, 5600:12800, 10956:23200, 21912:46400
};
export const categories = ['diamantes','fragmentos','pase','tarjetas','nivel'];
export const bannerDefaults = {
  diamantes:{title:'Diamantes',image:'/images/vortex-banner.webp?v=6a62bac',category:'diamantes'},
  nivel:{title:'Aumento de nivel',image:'/images/oferta-nivel.webp',category:'nivel'},
  tarjetas:{title:'Oferta de 3 tarjetas',image:'/images/oferta-tarjetas.webp',category:'tarjetas'}
};
export const fragmentDefaults = {
  cajas: [
    {quantity:10, cents:800},
    {quantity:20, cents:1500},
    {quantity:30, cents:2500},
    {quantity:40, cents:3000},
    {quantity:50, cents:4000},
    {quantity:100, cents:8000},
    {quantity:150, cents:11000},
    {quantity:200, cents:14000},
    {quantity:250, cents:17000},
    {quantity:300, cents:20000}
  ],
  tokens: [
    {quantity:50, cents:1000},
    {quantity:90, cents:1500},
    {quantity:100, cents:2000},
    {quantity:200, cents:3500},
    {quantity:300, cents:4800},
    {quantity:400, cents:7000},
    {quantity:500, cents:8000},
    {quantity:600, cents:9000},
    {quantity:700, cents:10000},
    {quantity:800, cents:11000},
    {quantity:900, cents:12000},
    {quantity:1200, cents:15000}
  ]
};
const passDefault = {title:'Pase Booyah',description:'Pase Booyah de la temporada actual de Free Fire.',cents:500,visible:true,image:''};
export const defaults = {
  heading:'Ruleta VortexPeru', description:'Prueba Tu Suerte',
  accent:'#a06aff', activity:true, copy:{},
  banners:Object.values(bannerDefaults).map(item => ({...item,visible:true})),
  products:Object.fromEntries(Object.entries(priceDefaults).map(([id,cents]) => [id,{cents,image:'',visible:true}])),
  offers:{pase:passDefault,nivel:{title:'Aumento de nivel',description:'Hasta 1,400 diamantes según tu nivel',cents:1400,visible:true},tarjetas:{title:'Oferta de 3 tarjetas',description:'Mensual, semanal y semanal básica',cents:4000,visible:true}},
  fragments:fragmentDefaults,
  payment:{whatsapp:'51960452730',qr:'/images/vortex-yape.jpeg',yapeNumber:'981359098'}
};

export async function readSettings(db) {
  if (!db) return {revision:0, settings:defaults};
  const table = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='site_settings'").first();
  if (!table) return {revision:0, settings:defaults};
  const entry = await db.prepare('SELECT revision, value FROM site_settings WHERE id=1').first();
  if (!entry) return {revision:0,settings:defaults};
  const saved = JSON.parse(entry.value);
  const products = {...defaults.products, ...saved.products};
  if (!saved.products?.[220]) {
    for (const id of [310, 5600]) {
      products[id] = {...products[id], cents:priceDefaults[id]};
    }
  }
  return {revision:entry.revision,settings:{
    fragments:fragmentDefaults,
    ...saved,
    heading: !saved.heading || saved.heading === 'Catálogo de recargas' ? defaults.heading : saved.heading,
    description: !saved.description || saved.description === 'Elige una categoría de Free Fire.' ? defaults.description : saved.description,
    products,
    offers:{pase:passDefault,...saved.offers},
    payment:{yapeNumber:'',...saved.payment}
  }};
}

function validText(value,max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function validImage(value) {
  return typeof value === 'string' && (value === '' ||
    /^\/images\/[\w.-]+(?:\?v=[\w-]+)?$/.test(value) ||
    (value.length <= 350000 && /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)));
}
function validPrice(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 9999999;
}
const copyKeys = new Set(["verifyTitle","midTitle","midLabel","midBody","walletLabel","footer","faqTitle","diamantesTitle","diamantesDesc","fragmentosTitle","fragmentosDesc","paseTitle","paseDesc","tarjetasTitle","tarjetasDesc","nivelTitle","nivelDesc"]);
const coreSections = ["inicio","beneficios","recargas","promocion","seguimiento","ayuda"];
function validLayout(layout) {
  if (layout === undefined) return true;
  if (!Array.isArray(layout) || layout.length < coreSections.length || layout.length > 26) return false;
  const ids = new Set();
  for (const block of layout) {
    if (!block || typeof block.id !== 'string' || ids.has(block.id) || typeof block.visible !== 'boolean') return false;
    ids.add(block.id);
    if (coreSections.includes(block.id)) continue;
    if (!/^bloque-[a-f0-9-]{36}$/.test(block.id) || !['texto','imagen','promocion','boton'].includes(block.type) ||
      typeof block.title !== 'string' || block.title.length > 90 || typeof block.body !== 'string' || block.body.length > 800 ||
      typeof block.button !== 'string' || block.button.length > 50 || !validImage(block.image) ||
      (block.imageSize !== undefined && !['small','medium','full'].includes(block.imageSize)) ||
      !['left','center','right'].includes(block.align) || !['normal','wide','full'].includes(block.width) ||
      !/^#[0-9a-f]{6}$/i.test(block.background) || !/^#[0-9a-f]{6}$/i.test(block.color) ||
      typeof block.link !== 'string' || block.link.length > 300 ||
      !(block.link === '' || /^#[a-z0-9-]+$/i.test(block.link) || /^https:\/\/[^\s\\]+$/i.test(block.link))) return false;
  }
  return coreSections.every(id => ids.has(id));
}
function validFragments(fragments) {
  if (fragments === undefined) return true;
  return fragments && ['cajas','tokens'].every(kind => {
    const options = fragments[kind];
    return Array.isArray(options) && options.length <= 60 &&
      options.every(option => option && Number.isSafeInteger(option.quantity) &&
        option.quantity >= 1 && option.quantity <= 99999 && validPrice(option.cents)) &&
      new Set(options.map(option => option.quantity)).size === options.length;
  });
}
export function validSettings(s) {
  return s && validFragments(s.fragments) && validLayout(s.layout) && validText(s.heading,80) && validText(s.description,180) &&
    (s.copy === undefined || (s.copy && typeof s.copy === 'object' && !Array.isArray(s.copy) &&
      Object.entries(s.copy).every(([key,value]) => copyKeys.has(key) && validText(value,180)))) &&
    /^#[0-9a-f]{6}$/i.test(s.accent) && typeof s.activity === 'boolean' &&
    Array.isArray(s.banners) && s.banners.length <= 8 &&
    s.banners.every(b => b && validText(b.title,70) && !!b.image && validImage(b.image) &&
      categories.includes(b.category) && typeof b.visible === 'boolean') &&
    s.products && Object.keys(s.products).length === Object.keys(priceDefaults).length &&
    Object.keys(priceDefaults).every(id => {
      const p = s.products[id];
      return p && validPrice(p.cents) && validImage(p.image) && typeof p.visible === 'boolean';
    }) && s.offers && ['nivel','tarjetas', ...(s.offers.pase === undefined ? [] : ['pase'])].every(id => {
      const o = s.offers[id];
      return o && validText(o.title,70) && validText(o.description,180) && validPrice(o.cents) &&
        (o.image === undefined || validImage(o.image)) && typeof o.visible === 'boolean';
    }) && s.payment && validImage(s.payment.qr) &&
    (s.payment.yapeNumber === undefined || (typeof s.payment.yapeNumber === 'string' && /^(?:9\d{8})?$/.test(s.payment.yapeNumber))) &&
    typeof s.payment.whatsapp === 'string' && /^(?:[1-9]\d{7,14})?$/.test(s.payment.whatsapp);
}
