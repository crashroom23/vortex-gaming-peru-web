export const priceDefaults = {100:350,310:980,520:1500,1060:2700,2180:5200,5600:13000};
export const categories = ['diamantes','fragmentos','pase','tarjetas','nivel'];
export const bannerDefaults = {
  diamantes:{title:'Diamantes',image:'/images/vortex-banner.webp?v=6a62bac',category:'diamantes'},
  nivel:{title:'Aumento de nivel',image:'/images/oferta-nivel.webp',category:'nivel'},
  tarjetas:{title:'Oferta de 3 tarjetas',image:'/images/oferta-tarjetas.webp',category:'tarjetas'}
};
export const defaults = {
  heading:'Catálogo de recargas', description:'Elige una categoría de Free Fire.',
  accent:'#a06aff', activity:true,
  banners:Object.values(bannerDefaults).map(item => ({...item,visible:true})),
  products:Object.fromEntries(Object.entries(priceDefaults).map(([id,cents]) => [id,{cents,image:'',visible:true}])),
  offers:{nivel:{title:'Aumento de nivel',description:'Hasta 1,400 diamantes según tu nivel',cents:1400,visible:true},tarjetas:{title:'Oferta de 3 tarjetas',description:'Mensual, semanal y semanal básica',cents:4000,visible:true}},
  payment:{whatsapp:'',qr:''}
};

export async function readSettings(db) {
  if (!db) return {revision:0, settings:defaults};
  const table = await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='site_settings'").first();
  if (!table) return {revision:0, settings:defaults};
  const entry = await db.prepare('SELECT revision, value FROM site_settings WHERE id=1').first();
  return entry ? {revision:entry.revision,settings:JSON.parse(entry.value)} : {revision:0,settings:defaults};
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
export function validSettings(s) {
  return s && validText(s.heading,80) && validText(s.description,180) &&
    /^#[0-9a-f]{6}$/i.test(s.accent) && typeof s.activity === 'boolean' &&
    Array.isArray(s.banners) && s.banners.length <= 8 &&
    s.banners.every(b => b && validText(b.title,70) && !!b.image && validImage(b.image) &&
      categories.includes(b.category) && typeof b.visible === 'boolean') &&
    s.products && Object.keys(s.products).length === Object.keys(priceDefaults).length &&
    Object.keys(priceDefaults).every(id => {
      const p = s.products[id];
      return p && validPrice(p.cents) && validImage(p.image) && typeof p.visible === 'boolean';
    }) && s.offers && ['nivel','tarjetas'].every(id => {
      const o = s.offers[id];
      return o && validText(o.title,70) && validText(o.description,180) && validPrice(o.cents) &&
        typeof o.visible === 'boolean';
    }) && s.payment && validImage(s.payment.qr) &&
    typeof s.payment.whatsapp === 'string' && /^(?:[1-9]\d{7,14})?$/.test(s.payment.whatsapp);
}
