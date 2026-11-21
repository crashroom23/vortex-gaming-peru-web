'use strict';
const $ = selector => document.querySelector(selector);
const status = $('#status');
const fields = $('#fields');
const categoryLabels = {diamantes:'Diamantes',fragmentos:'Fragmentos',pase:'Pase',tarjetas:'Tarjetas',nivel:'Aumento de nivel'};
const tabs = {banners:'Banners',products:'Diamantes',fragments:'Fragmentos',offers:'Ofertas',design:'Diseño',payment:'Pagos',users:'Usuarios y saldo',roulette:'Ruleta'};
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
function field(box,label,item,property,{type='text',max=180,options,integer=false}={}) {
  const wrapper = element('label',label);
  const input = element(options ? 'select' : 'input');
  if (options) {
    for (const [value,text] of Object.entries(options)) input.add(new Option(text,value));
  } else {
    input.type = type;
    if (type === 'number') { input.step = integer ? '1' : '.01'; input.min = integer ? '1' : '.01'; input.max = integer ? '99999' : '99999.99'; input.required = true; }
    if (type === 'text') input.maxLength = max;
  }
  if (type === 'checkbox') input.checked = item[property];
  else input.value = type === 'number' ? (integer ? item[property] : (item[property]/100).toFixed(2)) : item[property];
  input.addEventListener('input',() => {
    item[property] = type === 'checkbox' ? input.checked : type === 'number' ? (integer ? input.valueAsNumber : Math.round(input.valueAsNumber*100)) : input.value;
  });
  wrapper.append(input);
  box.append(wrapper);
}
async function walletAdminRequest(method, body, query = '') {
  const response = await fetch('/api/wallet?admin=1' + query, {
    method, headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
}

function walletInput(box, label, properties) {
  const wrapper = element('label', label);
  const input = Object.assign(element('input'), properties);
  wrapper.append(input);
  box.append(wrapper);
  return input;
}

let walletToastTimer;

function renderWalletAdmin() {
  const create = group('Crear usuario');
  const username = walletInput(create, 'Nombre de usuario', {maxLength:24, autocomplete:'off'});
  const password = walletInput(create, 'Contraseña inicial (mínimo 6 caracteres)',
    {type:'password', maxLength:128, autocomplete:'new-password'});

  const credit = group('Acreditar saldo');
  const target = walletInput(credit, 'Usuario', {maxLength:24, autocomplete:'off'});
  const amount = walletInput(credit, 'Importe en soles', {type:'number', step:'.01', min:'.01', max:'99999.99'});

  const matches = element('div');
  matches.className = 'wallet-user-matches';
  matches.setAttribute('role', 'group');
  matches.setAttribute('aria-label', 'Usuarios encontrados');
  matches.hidden = true;
  target.parentElement.after(matches);
  target.placeholder = 'Escribe parte del nombre';
  let searchTimer;
  let searchVersion = 0;
  const soles = cents => 'S/ ' + (cents / 100).toFixed(2);

  function selectUser(name) {
    searchVersion++;
    matches.hidden = true;
    target.value = name;
    amount.focus();
  }

  target.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const version = ++searchVersion;
    const query = target.value.trim().toLowerCase();
    matches.hidden = true;
    if (!query) return;
    searchTimer = setTimeout(async () => {
      try {
        const {users} = await walletAdminRequest('GET', null, '&users=' + encodeURIComponent(query));
        if (version !== searchVersion || !matches.isConnected) return;
        const choices = users.map(user => action(user.username + ' · ' + soles(user.balance_cents),
          () => selectUser(user.username)));
        matches.replaceChildren(...(choices.length ? choices : [element('p', 'No se encontraron usuarios.')]));
        matches.hidden = false;
      } catch (error) {
        if (version !== searchVersion || !matches.isConnected) return;
        matches.replaceChildren(element('p', error.message));
        matches.hidden = false;
      }
    }, 180);
  });

  const pricing = group('Precio especial con saldo');
  const product = walletInput(pricing, 'Código del paquete (por ejemplo, 100 para 100 + 10 diamantes)',
    {type:'number', min:'1', step:'1'});
  const special = walletInput(pricing, 'Precio en soles. Deja vacío para usar el precio normal.',
    {type:'number', step:'.01', min:'.01', max:'99999.99'});

  const summaries = group('Usuarios y pedidos con saldo');
  const summary = element('div');
  summaries.append(summary);

  async function refreshWalletAdmin() {
    if (!summary.isConnected) return;
    try {
      const {users, orders, prices} = await walletAdminRequest('GET');
      if (!summary.isConnected || !key) return;
      const usersList = element('ul');
      for (const user of users) {
        const row = element('li');
        row.append(document.createTextNode(user.username + ' · ' + soles(user.balance_cents) + ' '),
          action('Acreditar', () => selectUser(user.username)));
        usersList.append(row);
      }
      const pricesList = element('ul');
      for (const item of prices) pricesList.append(element('li', 'Paquete ' + item.product_id + ' · ' + soles(item.cents)));
      const ordersList = element('ul');
      for (const order of orders) ordersList.append(element('li', order.created_at + ' UTC · ' + order.username +
        ' · UID ' + order.uid + ' · Paquete ' + order.product_id + ' · ' + soles(order.cents) + ' · ' + order.code));
      summary.replaceChildren(element('h3','Usuarios'), users.length ? usersList : element('p','Todavía no hay usuarios.'),
        element('h3','Precios con saldo'), prices.length ? pricesList : element('p','Se usan los precios del catálogo.'),
        element('h3','Últimos pedidos con saldo'), orders.length ? ordersList : element('p','Todavía no hay pedidos.'));
    } catch (error) {
      if (summary.isConnected) summary.textContent = error.message;
    }
  }

  function addOperation(box, label, data, success) {
    const button = action(label, async () => {
      button.disabled = true;
      try {
        const payload = data();
        const result = await walletAdminRequest('POST', payload);
        if (box.isConnected) status.textContent = success(result, payload);
        await refreshWalletAdmin();
      } catch (error) {
        if (box.isConnected) status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    box.append(button);
  }

  addOperation(create, 'Crear usuario', () => ({
    action:'create', username:username.value, password:password.value
  }), result => {
    username.value = password.value = '';
    return 'Usuario creado: ' + result.username;
  });
  addOperation(create, 'Restablecer contraseña de usuario existente', () => ({
    action:'resetPassword', username:username.value, password:password.value
  }), result => {
    username.value = password.value = '';
    return 'Contraseña actualizada para ' + result.username + '.';
  });
  let creditDraft;
  addOperation(credit, 'Acreditar saldo', () => {
    const cents = Math.round(amount.valueAsNumber * 100);
    const name = target.value.trim().toLowerCase();
    if (creditDraft?.username !== name || creditDraft.cents !== cents) {
      creditDraft = {action:'credit', username:name, cents, code:crypto.randomUUID()};
    }
    return creditDraft;
  }, (result, payload) => {
    creditDraft = null;
    amount.value = '';
    const message = result.username + ' · +' + soles(payload.cents) + ' · Saldo actual: ' + soles(result.balance_cents);
    const toast = $('#wallet-toast');
    toast.replaceChildren(element('strong', '✓ Saldo acreditado'), element('span', message));
    clearTimeout(walletToastTimer);
    walletToastTimer = setTimeout(() => toast.replaceChildren(), 6500);
    return message;
  });
  addOperation(pricing, 'Guardar precio con saldo', () => ({
    action:'price', productId:product.valueAsNumber,
    cents:special.value === '' ? null : Math.round(special.valueAsNumber * 100)
  }), () => 'Precio con saldo actualizado.');
  void refreshWalletAdmin();
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
      if (!$('#inline-editor').open) syncPreview();
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
function renderRouletteAdmin() {
  const box = group('Premios de la ruleta');
  const prizes = element('textarea');
  prizes.rows = 5;
  prizes.setAttribute('aria-label','Casillas, una por línea');
  box.append(element('p','Escribe de 2 a 12 casillas, una por línea. Incluye «Sigue intentando» (80 %) y «S/ 1 de descuento (desde 1,000 diamantes)» (20 %). Puedes repetir las casillas.'),prizes);
  const codes = group('Códigos y cupones');
  const input = walletInput(codes,'Código VX de giro o cupón VP de premio',{maxLength:35});
  const output = walletInput(codes,'Código generado',{readOnly:true});
  const message = element('p');
  message.setAttribute('role','status');

  async function send(data) {
    const response = await fetch('/api/roulette?admin=1', {
      method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    message.textContent = result.message;
    if (data.action === 'create') {
      output.value = result.code;
      output.select();
    }
  }
  function button(label, data) {
    const control = action(label,async () => {
      control.disabled = true;
      try { await send(data()); }
      catch (error) { message.textContent = error.message; }
      finally { control.disabled = false; }
    });
    return control;
  }
  box.append(button('Guardar premios',() => ({
    action:'prizes',prizes:prizes.value.split('\n').map(label => label.trim()).filter(Boolean)
  })));
  codes.append(
    button('Consultar código',() => ({action:'inspect',code:input.value.trim().toUpperCase()})),
    button('Confirmar pago y activar código',() => ({action:'confirm',code:input.value.trim().toUpperCase()})),
    button('Generar código activo',() => ({action:'create'})),
    button('Marcar premio como canjeado',() => ({action:'redeem',code:input.value.trim().toUpperCase()})),
    message
  );
  fetch('/api/roulette').then(async response => {
    if (!response.ok) throw new Error('No se pudieron cargar los premios.');
    const data = await response.json();
    if (!prizes.value) prizes.value = data.prizes.join('\n');
  }).catch(error => { message.textContent = error.message; });
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
  if (section === 'fragments') {
    for (const [kind,label] of [['cajas','Cajas evolutivas'],['tokens','Tokens evolutivos']]) {
      const box = group(label);
      const options = settings.fragments[kind];
      options.forEach((option,index) => {
        const row = element('div');
        row.className = 'fragment-editor-row';
        field(row,'Cantidad',option,'quantity',{type:'number',integer:true});
        field(row,'Precio en soles',option,'cents',{type:'number'});
        row.append(action('Quitar opción',() => { options.splice(index,1); render(); }));
        box.append(row);
      });
      if (options.length < 60) box.append(action('Agregar opción',() => {
        let quantity = 1;
        while (options.some(option => option.quantity === quantity)) quantity++;
        options.push({quantity,cents:100});
        render();
      }));
    }
  }
  if (section === 'offers') {
    for(const [id,offer] of Object.entries(settings.offers)) {
      const box=group(categoryLabels[id]);
      field(box,'Título',offer,'title',{max:70});
      field(box,'Descripción',offer,'description');
      field(box,'Precio en soles',offer,'cents',{type:'number'});
      field(box,'Visible',offer,'visible',{type:'checkbox'});
      imageField(box,id === 'pase' ? 'Subir foto de referencia del pase del mes' : 'Reemplazar imagen de la oferta',offer,'image');
      if (id === 'pase' && offer.image) {
        box.append(action('Quitar foto del mes',() => { offer.image=''; render(); }));
      }
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
    field(box,'Número de Yape para pagar',settings.payment,'yapeNumber',{max:9});
    imageField(box,'Subir QR de Yape',settings.payment,'qr',{qr:true});
    box.append(action('Quitar QR',()=>{ settings.payment.qr=''; render(); }));
    box.append(element('p','El número abre WhatsApp desde el pago normal y la solicitud de recarga de saldo.'));
  }
  if (section === 'users') renderWalletAdmin();
  if (section === 'roulette') renderRouletteAdmin();
  syncPreview();
}

$('#login').addEventListener('submit',async event => {
  event.preventDefault();
  const button=$('#login button');
  button.disabled=true;
  key=$('#key').value;
  $('#key').value='';
  try {
    ({revision,settings}=await request('GET'));
    settings.copy ||= {};
    settings.layout ||= Object.keys(sectionNames).map(id => ({id,visible:true}));
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
  if (busy || $('#inline-editor').open) return;
  busy=true;
  $('#publish').disabled=true;
  try {
    for (const options of Object.values(settings.fragments)) {
      if (new Set(options.map(option => option.quantity)).size !== options.length) {
        throw new Error('En Fragmentos, usa una cantidad distinta para cada opción de Cajas o Tokens.');
      }
    }
    ({revision}=await request('PUT',{revision,settings}));
    status.textContent='Cambios publicados en la tienda de pruebas.';
  } catch(error) { status.textContent=error.message || 'No se pudo publicar.'; }
  finally { busy=false; $('#publish').disabled=false; }
});
const originalCopy = {
  "verifyTitle": "Verifica tu ID de Free Fire",
  "catalogHeading": "Ruleta VortexPeru",
  "catalogDescription": "Prueba Tu Suerte",
  "midTitle": "¿YA ELEGISTE TUS DIAMANTES?",
  "midLabel": "VORTEX // NEXT LEVEL",
  "midBody": "Elige tu UID, verifica el jugador y pulsa Pagar para abrir la ventana con Yape o Binance Pay.",
  "walletLabel": "CONOCER MI BILLETERA",
  "footer": "Un nuevo universo para tus recargas digitales.",
  "faqTitle": "PREGUNTAS RÁPIDAS",
  "diamantesTitle": "Diamantes",
  "diamantesDesc": "Paquetes de diamantes con bono",
  "fragmentosTitle": "Fragmentos",
  "fragmentosDesc": "Fragmentos para evolutivas",
  "paseTitle": "Pase",
  "paseDesc": "Pase Booyah",
  "tarjetasTitle": "Tarjetas",
  "tarjetasDesc": "Tarjetas de Free Fire",
  "nivelTitle": "Paquete de nivel de aumento",
  "nivelDesc": "Paquetes para subir de nivel"
};
const inlineEditor = $('#inline-editor');
const inlineFields = $('#inline-fields');

function syncPreview() {
  const frame=$('#store-preview');
  const message=$('#preview-message');
  if (!frame || !settings) return;
  try {
    const applyDraft=frame.contentWindow.vortexApplyAdminDraft;
    if (typeof applyDraft !== 'function') {
      message.textContent='El editor todavía no está conectado. Pulsa Recargar vista previa.';
      return;
    }
    const {payment,...draft}=settings;
    applyDraft(structuredClone(draft));
    message.textContent='Edición activa. Haz clic en un elemento o abre Estructura de la página.';
  } catch (error) {
    console.error('VortexGamer: vista previa',error);
    message.textContent='No se pudo mostrar el borrador. Pulsa Recargar vista previa.';
  }
}

function editHere(title,setup) {
  $('#inline-title').textContent=title;
  inlineFields.replaceChildren();
  setup(inlineFields);
  inlineEditor.showModal();
}

function editBanner(banner) {
  editHere('Editar banner',box => {
    field(box,'Título',banner,'title',{max:70});
    field(box,'Abrir categoría',banner,'category',{options:categoryLabels});
    field(box,'Visible',banner,'visible',{type:'checkbox'});
    imageField(box,'Subir o reemplazar imagen',banner,'image');
  });
}

const sectionNames = {inicio:'Portada y banners',beneficios:'Beneficios y actividad',recargas:'Verificador y catálogo',
  promocion:'Promoción de billetera',seguimiento:'Seguimiento de pedidos',ayuda:'Preguntas frecuentes'};
const blockNames = {texto:'Texto',imagen:'Imagen',promocion:'Promoción',boton:'Botón'};

function editBlock(block) {
  editHere('Editar bloque',box => {
    field(box,'Título',block,'title',{max:90});
    const wrapper=element('label','Descripción');
    const body=element('textarea');
    body.value=block.body;
    body.rows=4;
    body.maxLength=800;
    body.addEventListener('input',()=>{block.body=body.value;});
    wrapper.append(body);
    box.append(wrapper);
    imageField(box,'Subir o reemplazar imagen',block,'image');
    if (block.image) box.append(action('Quitar imagen',()=>{block.image='';inlineEditor.close();}));
    field(box,'Texto del botón',block,'button',{max:50});
    field(box,'Enlace HTTPS o ancla de la tienda',block,'link',{max:300});
    block.imageSize ||= 'full';
    field(box,'Tamaño de la imagen',block,'imageSize',{options:{small:'Pequeña',medium:'Mediana',full:'Ancho disponible'}});
    field(box,'Alineación',block,'align',{options:{left:'Izquierda',center:'Centro',right:'Derecha'}});
    field(box,'Ancho',block,'width',{options:{normal:'Normal',wide:'Ancho',full:'Pantalla completa'}});
    field(box,'Color de fondo',block,'background',{type:'color'});
    field(box,'Color del texto',block,'color',{type:'color'});
  });
}

function makeBlock(type) {
  return {id:'bloque-'+crypto.randomUUID(),type,visible:true,
    title:type==='imagen'||type==='boton'?'':type==='promocion'?'Nueva promoción':'Nuevo texto',
    body:'',image:'',button:type==='boton'?'Ver recargas':'',link:type==='boton'?'#tienda':'',
    align:'center',width:'wide',background:'#190e30',color:'#ffffff'};
}

function renderLayoutControls() {
  const list=$('#builder-items');
  if (!list) return;
  const layout=settings.layout;
  list.replaceChildren(...layout.map((block,index) => {
    const item=element('li');
    const core=Object.hasOwn(sectionNames,block.id);
    item.append(element('strong',core ? sectionNames[block.id] : block.title || blockNames[block.type]));
    const update=()=>{renderLayoutControls();syncPreview();};
    const move=step=>{
      [layout[index],layout[index+step]]=[layout[index+step],layout[index]];
      update();
    };
    const up=action('↑ Subir',()=>move(-1));
    const down=action('↓ Bajar',()=>move(1));
    up.disabled=index===0;
    down.disabled=index===layout.length-1;
    item.append(up,down,action(block.visible?'Ocultar':'Mostrar',()=>{block.visible=!block.visible;update();}));
    if (!core) {
      const duplicate=action('Duplicar',()=>{
        layout.splice(index+1,0,{...block,id:makeBlock(block.type).id});
        update();
      });
      duplicate.disabled=layout.length>=26;
      item.append(action('Editar',()=>editBlock(block)),duplicate,
        action('Quitar del borrador',()=>{layout.splice(index,1);update();}));
    }
    return item;
  }));
  const position=$('#builder-position');
  const previous=position.value;
  position.replaceChildren(new Option('Al final',''));
  for (const block of layout) position.add(new Option('Antes de '+(sectionNames[block.id] || block.title || blockNames[block.type]),block.id));
  if (layout.some(block=>block.id===previous)) position.value=previous;
}

function editPreviewElement(event) {
  const target=event.target.closest?.('[data-inline-copy], [data-inline-banner], [data-inline-product], [data-offer], [data-builder-block]');
  if (!target || inlineEditor.open || busy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (target.dataset.builderBlock) {
    const block=settings.layout.find(item=>item.id===target.dataset.builderBlock);
    if (block) editBlock(block);
  } else if (target.dataset.inlineCopy) {
    const id=target.dataset.inlineCopy;
    const key=id==='catalogHeading' ? 'heading' : id==='catalogDescription' ? 'description' : id;
    const item=key===id ? settings.copy : settings;
    if (!Object.hasOwn(item,key)) item[key]=originalCopy[id];
    editHere('Editar texto',box=>field(box,'Texto',item,key,{max:key==='heading' ? 80 : 180}));
  } else if (target.dataset.inlineBanner !== undefined) {
    editBanner(settings.banners[Number(target.dataset.inlineBanner)]);
  } else if (target.dataset.inlineProduct) {
    const product=settings.products[target.dataset.inlineProduct];
    editHere('Editar paquete de diamantes',box => {
      field(box,'Precio en soles',product,'cents',{type:'number'});
      field(box,'Visible',product,'visible',{type:'checkbox'});
      imageField(box,'Reemplazar imagen',product,'image');
    });
  } else {
    const offer=settings.offers[target.dataset.offer];
    editHere('Editar oferta',box => {
      field(box,'Título',offer,'title',{max:70});
      field(box,'Descripción',offer,'description');
      field(box,'Precio en soles',offer,'cents',{type:'number'});
      field(box,'Visible',offer,'visible',{type:'checkbox'});
      imageField(box,'Reemplazar imagen',offer,'image');
    });
  }
}

$('#inline-close').addEventListener('click',() => { if (!busy) inlineEditor.close(); });
inlineEditor.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
inlineEditor.addEventListener('close',() => { render(); renderLayoutControls(); });
$('#editor').addEventListener('input',event => {
  if (event.target.type !== 'file') syncPreview();
});

$('#preview').addEventListener('click',() => {
  if(busy) return;
  let frame=$('#store-preview');
  if(!frame) {
    frame=element('iframe');
    frame.id='store-preview';
    frame.title='Editor visual de la tienda';
    frame.width='100%';
    frame.height='650';
    const toolbar=element('div');
    toolbar.id='preview-tools';
    const message=element('p','Cargando editor…');
    message.id='preview-message';
    message.setAttribute('role','status');
    const reloadPreview=() => {
      message.textContent='Cargando editor…';
      frame.src='/?draft=1&editor=constructor';
    };
    toolbar.append(message,action('Recargar vista previa',reloadPreview),action('Agregar banner',() => {
      if (settings.banners.length >= 8) { status.textContent='Ya tienes ocho banners. Quita uno antes de agregar otro.'; return; }
      const banner={title:'Nuevo banner',category:'diamantes',visible:true,image:'/images/vortex-banner.webp?v=6a62bac'};
      settings.banners.push(banner);
      editBanner(banner);
    }));
    const structure=element('details');
    structure.id='builder-layout';
    structure.append(element('summary','Estructura de la página'));
    const type=element('select');
    type.setAttribute('aria-label','Tipo de bloque');
    for (const [value,label] of Object.entries(blockNames)) type.add(new Option(label,value));
    const position=element('select');
    position.id='builder-position';
    position.setAttribute('aria-label','Posición del bloque');
    const list=element('ol');
    list.id='builder-items';
    const add=action('Agregar bloque',()=>{
      if (settings.layout.length>=26) {message.textContent='Llegaste al máximo de 20 bloques personalizados.';return;}
      const block=makeBlock(type.value);
      const index=settings.layout.findIndex(item=>item.id===position.value);
      settings.layout.splice(index<0 ? settings.layout.length : index,0,block);
      renderLayoutControls();
      editBlock(block);
    });
    const size=element('select');
    size.setAttribute('aria-label','Tamaño de pantalla');
    size.add(new Option('Computadora','100%'));
    size.add(new Option('Celular','390px'));
    size.addEventListener('change',()=>{frame.style.width=size.value;});
    toolbar.append(size);
    structure.append(type,position,add,list);
    const draftKey='vortex-visual-layout-draft';
    toolbar.append(action('Guardar borrador',()=>{
      try {
        const {payment,...draft}=settings;
        localStorage.setItem(draftKey,JSON.stringify({revision,draft}));
        message.textContent='Borrador guardado en este navegador.';
      } catch {message.textContent='No se pudo guardar el borrador en este navegador.';}
    }),action('Recuperar borrador',()=>{
      try {
        const saved=JSON.parse(localStorage.getItem(draftKey));
        if (!saved || saved.revision!==revision) {message.textContent='No hay borrador para la versión publicada actual.';return;}
        settings={...saved.draft,payment:settings.payment};
        render();
        renderLayoutControls();
      } catch {message.textContent='No se pudo leer el borrador.';}
    }));
    $('#panel').append(toolbar,structure,frame);
    renderLayoutControls();
    frame.onload=() => {
      const doc=frame.contentDocument;
      if (!doc || new URL(doc.URL).searchParams.get('draft') !== '1') return;
      const style=doc.createElement('style');
      style.textContent='[data-inline-copy],[data-inline-banner],[data-inline-product],[data-offer],[data-builder-block]{cursor:pointer} [data-inline-copy]:hover,[data-inline-banner]:hover,[data-inline-product]:hover,[data-offer]:hover,[data-builder-block]:hover{outline:2px dashed #e4bcff;outline-offset:-2px}';
      doc.head.append(style);
      doc.addEventListener('click',editPreviewElement,true);
      syncPreview();
    };
    reloadPreview();
  } else syncPreview();
  $('#preview-tools').scrollIntoView({block:'start'});
});
$('#logout').addEventListener('click',() => location.reload());
