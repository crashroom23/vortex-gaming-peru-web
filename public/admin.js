'use strict';
const $ = selector => document.querySelector(selector);
const status = $('#status');
const fields = $('#fields');
const categoryLabels = {diamantes:'Diamantes',fragmentos:'Fragmentos',pase:'Pase',tarjetas:'Tarjetas',nivel:'Aumento de nivel'};
const tabs = {banners:'Banners',products:'Diamantes',offers:'Ofertas',design:'Diseño',payment:'Pagos'};
let key = '';
let revision = 0;
let settings;
let section = 'banners';
let busy = false;

async function request(method, body) {
  const response = await fetch('/api/site-settings?admin=1',{
    method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}
function action(text, callback) {
  const button = element('button',text);
  button.type = 'button';
  button.addEventListener('click',callback);
  return button;
}
function group(title) {
  const box = element('fieldset');
  box.append(element('legend',title));
  fields.append(box);
  return box;
}
function field(box,label,item,property,{type='text',max=180,options}={}) {
  const wrapper = element('label',label);
  const input = element(options ? 'select' : 'input');
  if (options) {
    for (const [value,text] of Object.entries(options)) input.add(new Option(text,value));
  } else {
    input.type = type;
    if (type === 'number') { input.step = '.01'; input.min = '.01'; input.max = '99999.99'; input.required = true; }
    if (type === 'text') input.maxLength = max;
  }
  if (type === 'checkbox') input.checked = item[property];
  else input.value = type === 'number' ? (item[property]/100).toFixed(2) : item[property];
  input.addEventListener('input',() => {
    item[property] = type === 'checkbox' ? input.checked : type === 'number' ? Math.round(input.valueAsNumber*100) : input.value;
  });
  wrapper.append(input);
  box.append(wrapper);
}
function imageField(box,label,item,property,{qr=false}={}) {
  const photo = element('img');
  photo.alt = label;
  if (item[property]) photo.src = item[property];
  else photo.hidden = true;
  const wrapper = element('label',label);
  const file = element('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/webp';
  file.addEventListener('change',async () => {
    if (!file.files.length) return;
    busy = true;
    $('#publish').disabled = true;
    try {
      const bitmap = await createImageBitmap(file.files[0]);
      const ratio = Math.min(1, (qr ? 640 : 900) / Math.max(bitmap.width,bitmap.height));
      const canvas = element('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width*ratio));
      canvas.height = Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close();
      const image = canvas.toDataURL(qr ? 'image/png' : 'image/webp',.77);
      if (image.length > 350000) throw new Error('La imagen es demasiado grande. Usa una imagen más pequeña.');
      photo.hidden = false;
      photo.src = item[property] = image;
      status.textContent = 'Imagen lista para publicar.';
    } catch (error) {
      status.textContent = error.message || 'No se pudo abrir la imagen.';
    } finally {
      busy = false;
      $('#publish').disabled = false;
      file.value = '';
    }
  });
  wrapper.append(file);
  box.append(photo,wrapper);
}
function render() {
  $('nav').replaceChildren(...Object.entries(tabs).map(([id,label]) => {
    const button = action(label,() => { section=id; render(); });
    button.setAttribute('aria-pressed',String(id===section));
    return button;
  }));
  fields.replaceChildren();
  if (section === 'banners') {
    settings.banners.forEach((banner,index) => {
      const box = group('Banner '+(index+1));
      field(box,'Título',banner,'title',{max:70});
      field(box,'Abrir categoría',banner,'category',{options:categoryLabels});
      field(box,'Visible',banner,'visible',{type:'checkbox'});
      imageField(box,'Subir imagen',banner,'image');
      const controls=element('div');
      const move = offset => {
        const list=settings.banners;
        [list[index+offset],list[index]]=[list[index],list[index+offset]];
        render();
      };
      const up=action('↑ Subir',()=>move(-1));
      const down=action('↓ Bajar',()=>move(1));
      up.disabled=index===0;
      down.disabled=index===settings.banners.length-1;
      controls.append(up,down,action('Quitar',()=>{ settings.banners.splice(index,1); render(); }));
      box.append(controls);
    });
    if(settings.banners.length<8) fields.append(action('Agregar banner',()=>{
      settings.banners.push({title:'Nuevo banner',category:'diamantes',visible:true,image:'/images/vortex-banner.webp?v=6a62bac'});
      render();
    }));
  }
  if (section === 'products') {
    for(const [id,product] of Object.entries(settings.products)) {
      const box = group(id+' diamantes');
      field(box,'Precio en soles',product,'cents',{type:'number'});
      field(box,'Visible',product,'visible',{type:'checkbox'});
      imageField(box,'Reemplazar imagen',product,'image');
    }
  }
  if (section === 'offers') {
    for(const [id,offer] of Object.entries(settings.offers)) {
      const box=group(categoryLabels[id]);
      field(box,'Título',offer,'title',{max:70});
      field(box,'Descripción',offer,'description');
      field(box,'Precio en soles',offer,'cents',{type:'number'});
      field(box,'Visible',offer,'visible',{type:'checkbox'});
    }
  }
  if (section === 'design') {
    const box=group('Catálogo y portada');
    field(box,'Título del catálogo',settings,'heading',{max:80});
    field(box,'Descripción',settings,'description');
    field(box,'Color de acento',settings,'accent',{type:'color'});
    field(box,'Mostrar actividad de ejemplo',settings,'activity',{type:'checkbox'});
  }
  if (section === 'payment') {
    const box=group('Yape manual y WhatsApp');
    field(box,'WhatsApp con código de país, solo dígitos',settings.payment,'whatsapp',{max:15});
    imageField(box,'Subir QR de Yape',settings.payment,'qr',{qr:true});
    box.append(action('Quitar QR',()=>{ settings.payment.qr=''; render(); }));
    box.append(element('p','Estos datos se guardan para configurar el cobro. La tienda de pruebas mantiene los cobros desactivados.'));
  }
}

$('#login').addEventListener('submit',async event => {
  event.preventDefault();
  const button=$('#login button');
  button.disabled=true;
  key=$('#key').value;
  $('#key').value='';
  try {
    ({revision,settings}=await request('GET'));
    render();
    $('#login').hidden=true;
    $('#panel').hidden=false;
    status.textContent='Acceso habilitado.';
  } catch(error) {
    key='';
    status.textContent=error.message || 'No se pudo abrir el panel.';
  } finally { button.disabled=false; }
});
$('#editor').addEventListener('submit',async event => {
  event.preventDefault();
  if (busy) return;
  busy=true;
  $('#publish').disabled=true;
  try {
    ({revision}=await request('PUT',{revision,settings}));
    status.textContent='Cambios publicados en la tienda de pruebas.';
  } catch(error) { status.textContent=error.message || 'No se pudo publicar.'; }
  finally { busy=false; $('#publish').disabled=false; }
});
$('#preview').addEventListener('click',() => {
  if(busy) return;
  let frame=$('#store-preview');
  if(!frame) {
    frame=element('iframe');
    frame.id='store-preview';
    frame.title='Vista previa de la tienda';
    frame.width='100%';
    frame.height='650';
    $('#panel').append(frame);
  }
  const {payment,...draft}=settings;
  frame.onload=()=>frame.contentWindow.postMessage({type:'vortex-admin-preview',settings:draft},location.origin);
  frame.src='/?draft=1';
  frame.scrollIntoView({block:'nearest'});
});
$('#logout').addEventListener('click',() => location.reload());
