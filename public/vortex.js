(() => {
  'use strict';

  const PRODUCTS = [
    { id: 100, providerProductId: 5, providerSku: 'ADS005', amount: '100', bonus: '10', price: 3.50, category: 'starter', tag: 'BONUS +10', type: 'PACK INICIAL' },
    { id: 310, providerProductId: 6, providerSku: 'ADS006', amount: '310', bonus: '31', price: 9.80, category: 'starter', tag: 'BONUS +31', type: 'PACK POPULAR' },
    { id: 520, providerProductId: 7, providerSku: 'ADS007', amount: '520', bonus: '52', price: 15.00, category: 'starter', tag: 'BONUS +52', type: 'PACK AVANZADO' },
    { id: 1060, providerProductId: 8, providerSku: 'ADS008', amount: '1,060', bonus: '106', price: 27.00, category: 'premium', tag: 'PACK PRO', type: 'PACK ÉLITE' },
    { id: 2180, providerProductId: 9, providerSku: 'ADS009', amount: '2,180', bonus: '218', price: 52.00, category: 'premium', tag: 'PACK PRO', type: 'PACK LEGENDARIO' },
    { id: 5600, providerProductId: 10, providerSku: 'ADS010', amount: '5,600', bonus: '560', price: 130.00, category: 'premium', tag: 'MAX PACK', type: 'PACK MÁXIMO' }
  ];
  const byId = new Map(PRODUCTS.map(product => [product.id, product]));
  let offerSettings = null;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const price = amount => 'S/ ' + amount.toFixed(2);
  const storageKeyCart = 'vortex-preview-cart-v2';
  const storageKeyFav = 'vortex-preview-favorites-v2';

  function loadJSON(key, fallback) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return data === null ? fallback : data;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  let cart = {};
  const loadedCart = loadJSON(storageKeyCart, {});
  if (loadedCart && typeof loadedCart === 'object' && !Array.isArray(loadedCart)) {
    for (const [key, quantity] of Object.entries(loadedCart)) {
      const id = Number(key);
      if (byId.has(id) && Number.isInteger(quantity) && quantity > 0) {
        cart[id] = Math.min(quantity, 99);
      }
    }
  }
  const loadedFavs = loadJSON(storageKeyFav, []);
  const favorites = new Set(Array.isArray(loadedFavs) ? loadedFavs.map(Number).filter(id => byId.has(id)) : []);
  let currentCategory = 'diamantes';
  let activeLayer = null;
  let lastFocus = null;
  let toastTimer;
  let playerSession = null;
  let checkoutProduct = null;
  let selectedPaymentMethod = 'yape';

  // Turnstile valida que el formulario lo envió una persona antes de consultar al proveedor.
  // El sitekey es público; el secreto y la credencial RA permanecen en Cloudflare Pages.
  let uidValidationConfig = null;
  let uidTurnstileWidget = null;
  let uidTurnstileToken = '';

  async function setupUidTurnstile() {
    try {
      const response = await fetch('/api/recargas/health', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const config = await response.json();
      uidValidationConfig = config;
      if (!config.validationReady || !config.turnstileSiteKey) return;

      const container = $('#uid-turnstile');
      if (!container) return;
      container.hidden = false;
      await new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('No se pudo cargar el control de seguridad.'));
        document.head.appendChild(script);
      });
      if (!window.turnstile) throw new Error('No se cargó la comprobación de seguridad.');
      uidTurnstileWidget = window.turnstile.render(container, {
        sitekey: config.turnstileSiteKey,
        theme: 'dark',
        appearance: 'interaction-only',
        action: 'ff_uid',
        callback: token => { uidTurnstileToken = token; },
        'expired-callback': () => { uidTurnstileToken = ''; },
        'error-callback': () => { uidTurnstileToken = ''; }
      });
    } catch (_) {
      // El formulario sigue accesible para el modo de demostración.
      const result = $('#verify-result');
      if (uidValidationConfig?.validationReady && result) {
        result.hidden = false;
        result.className = 'verify-result error';
        result.textContent = 'El control de seguridad no cargó. Comprueba tu conexión o utiliza el modo demostración.';
      }
    }
  }

  function resetUidTurnstile() {
    uidTurnstileToken = '';
    if (uidTurnstileWidget !== null && window.turnstile) {
      try { window.turnstile.reset(uidTurnstileWidget); } catch (_) {}
    }
  }

  const miniGemSVG = '<svg viewBox="0 0 240 185" aria-hidden="true"><use href="#diamond-graphic"></use></svg>';
  const arrowSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-arrow"></use></svg>';
  const heartSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-heart"></use></svg>';

  function cardMarkup(product) {
    const saved = favorites.has(product.id);
    const isPro = product.category === 'premium';
    return [
      '<article class="product-card', isPro ? ' featured' : '', '" data-inline-product="', product.id, '">',
      '<div class="card-media">',
      '<span class="card-badge', isPro ? ' premium' : '', '">', product.tag, '</span>',
      '<button type="button" class="favorite-btn', saved ? ' saved' : '', '" data-action="favorite" data-id="', product.id, '" aria-label="', saved ? 'Quitar de' : 'Añadir a', ' favoritos: ', product.amount, ' diamantes" aria-pressed="', saved, '">', heartSVG, '</button>',
      '<img class="card-gem pack-photo" src="', product.image || '/images/pack-' + (product.providerProductId - 4) + '.png?v=6a62bac', '" alt="" loading="lazy" decoding="async">',
      '</div><div class="card-body">',
      '<span class="card-type">', product.type, ' / FREE FIRE</span>',
      '<h3 class="card-title">', product.amount, ' <span>DIAMANTES</span></h3>',
      '<p class="card-bonus">✦ + ', product.bonus, ' DIAMANTES DE BONO</p>',
      '<div class="card-bottom"><div><div class="card-price-label">PRECIO DEL PAQUETE</div><div class="card-price">', price(product.price), '</div></div></div>',
      '<div class="card-buttons"><button class="btn btn-accent" type="button" data-action="pay" data-id="', product.id, '">PAGAR ', arrowSVG, '</button>',
      '<button class="quick-view" type="button" data-action="detail" data-id="', product.id, '" aria-label="Ver detalles de ', product.amount, ' diamantes">＋</button></div>',
      '</div></article>'
    ].join('');
  }

  const fragmentIds = {cajas:1000000,tokens:2000000};
  let fragments = {
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
  let openFragment = null;

  function renderFragmentOptions() {
    const panel = $('#fragment-options');
    panel.hidden = !openFragment;
    const quantityGrid = $('.fragment-quantities');
    quantityGrid.replaceChildren();
    for (const button of $$('[data-fragment-kind]')) {
      const kind = button.dataset.fragmentKind;
      const options = [...fragments[kind]].sort((a,b) => a.quantity - b.quantity);
      const featured = (kind === 'tokens' && options.find(option => option.quantity === 200)) || options[0];
      button.disabled = !featured;
      button.setAttribute('aria-expanded', String(openFragment === kind));
      button.querySelector('.fragment-summary').textContent = featured
        ? (kind === 'cajas' ? 'Desde ' : featured.quantity + ' tokens · ') + price(featured.cents / 100)
        : 'Sin opciones disponibles';
      if (openFragment !== kind) continue;
      $('#fragment-question').textContent = kind === 'cajas' ? '¿Cuántas cajas?' : '¿Cuántos tokens?';
      for (const option of options) {
        const choice = document.createElement('button');
        choice.type = 'button';
        const amount = document.createElement('strong');
        amount.textContent = option.quantity;
        const cost = document.createElement('span');
        cost.textContent = price(option.cents / 100);
        choice.append(amount,cost);
        choice.addEventListener('click', () => requestCheckout({
          id: fragmentIds[kind] + option.quantity,
          title: option.quantity + ' ' + kind + (kind === 'cajas' ? ' evolutivas' : ' evolutivos'),
          price: option.cents / 100
        }));
        quantityGrid.append(choice);
      }
    }
  }

  $$('[data-fragment-kind]').forEach(button => button.addEventListener('click', () => {
    openFragment = openFragment === button.dataset.fragmentKind ? null : button.dataset.fragmentKind;
    renderFragmentOptions();
  }));
  $('#close-fragments').addEventListener('click', () => {
    const trigger = $('[data-fragment-kind="' + openFragment + '"]');
    openFragment = null;
    renderFragmentOptions();
    trigger?.focus();
  });

  function renderProducts() {
    const products = currentCategory === 'diamantes' ? PRODUCTS.filter(product => product.visible !== false) : [];
    const grid = $('#products-grid');
    grid.innerHTML = products.map(cardMarkup).join('');
    grid.hidden = products.length === 0;
    const offers = $$('[data-offer]');
    offers.forEach(offer => { offer.hidden = offer.dataset.offer !== currentCategory || offerSettings?.[offer.dataset.offer]?.visible === false; });
    const fragmentCatalog = $('#fragment-catalog');
    fragmentCatalog.hidden = currentCategory !== 'fragmentos';
    if (!fragmentCatalog.hidden) renderFragmentOptions();
    $('#empty-state').hidden = !fragmentCatalog.hidden || products.length > 0 || offers.some(offer => !offer.hidden);
    $$('.catalog-category').forEach(button => {
      const selected = button.dataset.category === currentCategory;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (selected) $('#category-status').textContent = button.querySelector('strong').textContent;
    });
  }

  function renderCounts() {
    const quantity = Object.values(cart).reduce((sum, amount) => sum + amount, 0);
    $('#cart-count').textContent = quantity;
    $('#cart-count').hidden = quantity === 0;
    $('#favorites-count').textContent = favorites.size;
    $('#favorites-count').hidden = favorites.size === 0;
  }

  function renderCart() {
    const entries = Object.entries(cart).map(([id, quantity]) => ({ product: byId.get(Number(id)), quantity })).filter(x => x.product && x.product.visible !== false && x.quantity > 0);
    const total = entries.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const count = entries.reduce((sum, item) => sum + item.quantity, 0);
    $('#drawer-count').textContent = count;
    $('#cart-total').textContent = price(total);
    $('#cart-items').innerHTML = entries.length ? entries.map(({ product, quantity }) =>
      '<div class="panel-item">' +
        '<div class="panel-item-img">' + miniGemSVG + '</div>' +
        '<div class="panel-item-details"><strong>' + product.amount + ' DIAMANTES</strong>' +
        '<small>+ ' + product.bonus + ' DIAMANTES DE BONO</small>' +
        '<span>' + price(product.price * quantity) + '</span>' +
        '<div class="qty-control"><button type="button" data-action="decrease" data-id="' + product.id + '" aria-label="Reducir cantidad">−</button><span>' + quantity + '</span><button type="button" data-action="increase" data-id="' + product.id + '" aria-label="Aumentar cantidad">+</button></div></div>' +
        '<button type="button" class="remove-item" data-action="remove" data-id="' + product.id + '" aria-label="Eliminar paquete">×</button>' +
      '</div>').join('') :
      '<div class="panel-empty"><span class="big-icon">◇</span><strong>TU CARRITO ESTÁ VACÍO</strong><p>Explora los paquetes y añade tus favoritos para probar la nueva experiencia.</p></div>';
    $('#clear-cart').hidden = count === 0;
    $('#demo-checkout').disabled = count === 0;
  }

  function renderFavorites() {
    const products = PRODUCTS.filter(product => product.visible !== false && favorites.has(product.id));
    $('#favorites-items').innerHTML = products.length ? products.map(product =>
      '<div class="panel-item">' +
      '<div class="panel-item-img">' + miniGemSVG + '</div>' +
      '<div class="panel-item-details"><strong>' + product.amount + ' DIAMANTES</strong><small>+ ' + product.bonus + ' DE BONO</small><span>' + price(product.price) + '</span>' +
      '<div class="card-buttons"><button class="btn btn-accent" data-action="pay" data-id="' + product.id + '">PAGAR</button></div></div>' +
      '<button type="button" class="remove-item" data-action="favorite" data-id="' + product.id + '" aria-label="Quitar de favoritos">×</button></div>'
    ).join('') :
      '<div class="panel-empty"><span class="big-icon">♡</span><strong>NO HAY FAVORITOS</strong><p>Marca el corazón en los productos que quieras guardar.</p></div>';
  }

  function refresh() {
    saveJSON(storageKeyCart, cart);
    saveJSON(storageKeyFav, [...favorites]);
    renderProducts();
    renderCounts();
    renderCart();
    renderFavorites();
  }

  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function openLayer(id) {
    closeLayer(false);
    activeLayer = document.getElementById(id);
    lastFocus = document.activeElement;
    $('#overlay').hidden = false;
    activeLayer.inert = false;
    activeLayer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overlay-open');
    const close = activeLayer.querySelector('[data-close]');
    if (close) close.focus();
  }

  function closeLayer(restoreFocus = true) {
    if (!activeLayer) return;
    activeLayer.setAttribute('aria-hidden', 'true');
    activeLayer.inert = true;
    activeLayer = null;
    $('#overlay').hidden = true;
    document.body.classList.remove('overlay-open');
    if (restoreFocus && lastFocus && lastFocus.isConnected) lastFocus.focus();
  }

  function showInfo(title, message) {
    $('#modal-title').textContent = title;
    $('#modal-description').textContent = message;
    openLayer('info-modal');
  }

  function addToCart(id) {
    const product = byId.get(id);
    if (!product) return;
    cart[id] = Math.min(99, (cart[id] || 0) + 1);
    refresh();
    notify(product.amount + ' diamantes añadidos al carrito de prueba');
  }

  function toggleFavorite(id) {
    const product = byId.get(id);
    if (!product) return;
    if (favorites.has(id)) {
      favorites.delete(id);
      notify('Paquete eliminado de favoritos');
    } else {
      favorites.add(id);
      notify('Paquete añadido a favoritos');
    }
    refresh();
  }

  function setPaymentMethod(method) {
    selectedPaymentMethod = method === 'binance' ? 'binance' : 'yape';
    $$('.payment-tab').forEach(button => {
      const active = button.dataset.method === selectedPaymentMethod;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (selectedPaymentMethod === 'yape') {
      $('#payment-name').textContent = 'Yape manual';
      $('#payment-notice').textContent = '';
    } else {
      $('#payment-name').textContent = 'Binance Pay';
      $('#payment-description').textContent = 'Binance Pay genera un QR o enlace único desde la API Merchant. La conversión a criptomonedas y el importe definitivo se mostrarán únicamente cuando exista una orden real.';
      $('#payment-notice').textContent = 'Se necesita una cuenta Binance Pay Merchant habilitada, su API y confirmación verificada del pago.';
    }
    renderManualPayment();
  }

  // Orders here exercise the Preview checkout without contacting a payment provider.
  const demoOrderStorage = 'vortex-demo-order:';
  const demoOrderStates = ['Pendiente de pago', 'Pago confirmado · simulación', 'Recarga entregada · simulación'];
  const orderSection = document.createElement('section');
  orderSection.id = 'seguimiento';
  orderSection.className = 'faq-section shell';
  orderSection.innerHTML = `
    <div class="section-intro"><div><h2>ESTADO DE <span>TU PEDIDO</span></h2>
      <p>Consulta tu pedido de prueba desde cualquier dispositivo.</p></div></div>
    <form id="demo-order-search">
      <label for="demo-order-code">Código de pedido</label>
      <label class="catalog-search"><input id="demo-order-code" type="text" placeholder="VG-…" autocomplete="off" maxlength="39" required></label>
      <button type="submit" class="btn btn-outline">BUSCAR PEDIDO</button>
    </form>
    <div class="verify-result" id="demo-order-result" role="status" hidden></div>
    <ol id="demo-order-steps" hidden>
      <li>Pedido creado</li><li>Pago confirmado</li><li>Recarga entregada</li>
    </ol>
    <button type="button" class="btn btn-accent" id="demo-order-advance" hidden></button>
    <button type="button" class="btn btn-outline" id="demo-order-receipt" hidden>VER / DESCARGAR COMPROBANTE</button>
    <div id="demo-order-receipt-preview" class="verify-result" hidden></div>`;
  $('#ayuda').before(orderSection);
  const orderLink = document.createElement('a');
  orderLink.href = '#seguimiento';
  orderLink.textContent = 'Seguir pedido';
  $('.footer a[href="#ayuda"]').before(orderLink);

  const confirmDemoOrder = $('#payment-demo-confirm');
  confirmDemoOrder.disabled = false;
  confirmDemoOrder.textContent = 'CREAR PEDIDO DE PRUEBA';
  let displayedDemoOrder = null;

  function renderDemoOrder(order, message = '') {
    displayedDemoOrder = order;
    const result = $('#demo-order-result');
    const steps = $('#demo-order-steps');
    const advance = $('#demo-order-advance');
    result.hidden = false;
    result.textContent = message;
    steps.hidden = !order;
    advance.hidden = !order || order.stage >= demoOrderStates.length - 1;
    $('#demo-order-receipt').hidden = !order || order.stage < 1;
    $('#demo-order-receipt-preview').hidden = true;
    if (!order) return;

    const title = document.createElement('strong');
    title.textContent = order.code + ' · ' + demoOrderStates[order.stage];
    const details = document.createElement('div');
    details.textContent = order.player + ' · UID ' + order.uid + ' · ' + order.package + ' · ' +
      price(order.total) + ' · ' + order.method;
    result.replaceChildren(title, details);
    Array.from(steps.children).forEach((step, index) => {
      const current = index === order.stage;
      if (current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      step.style.fontWeight = current ? 'bold' : '';
    });
    advance.textContent = order.stage === 0 ? 'SIMULAR PAGO' : 'SIMULAR ENTREGA';
  }

  async function requestDemoOrder(method, data) {
    const url = '/api/preview-orders' + (method === 'GET' ? '?code=' + encodeURIComponent(data.code) : '');
    const response = await fetch(url, method === 'GET' ? undefined : {
      method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result.order;
  }

  let draftOrder = null;
  let updatingOrder = false;
  const manualPayment = $('#yape-manual');
  const manualConfirm = $('#manual-payment-confirm');
  const yapeQr = $('#yape-qr');
  const whatsappNumber = manualPayment.dataset.whatsapp;
  const yapeQrPath = manualPayment.dataset.qr;
  let qrReady = false;

  function draftForCheckout() {
    const selection = checkoutProduct.id + ':' + playerSession.uid + ':' + selectedPaymentMethod;
    if (draftOrder?.selection !== selection) {
      draftOrder = {selection, code:'VG-' + crypto.randomUUID().replaceAll('-', '').toUpperCase()};
    }
    return draftOrder;
  }

  function renderManualPayment() {
    const isYape = selectedPaymentMethod === 'yape';
    const ready = isYape && qrReady && /^[1-9]\d{7,14}$/.test(whatsappNumber) && playerSession && !playerSession.demo;
    manualPayment.hidden = !isYape;
    $('#payment-preview').hidden = isYape;
    $('#checkout-warning').hidden = ready;
    confirmDemoOrder.hidden = ready;
    yapeQr.hidden = !ready;
    manualConfirm.disabled = !ready;
    $('#manual-payment-help').textContent = ready
      ? 'Escanea el QR y paga el monto exacto. Luego abre WhatsApp y adjunta tu comprobante.'
      : 'QR y envío por WhatsApp no disponibles en esta prueba.';
    if (!isYape || !checkoutProduct || !playerSession) return;

    $('#manual-order-code').textContent = draftForCheckout().code;
    $('#manual-order-uid').textContent = playerSession.uid;
    manualConfirm.textContent = 'Ya pagué ' + price(checkoutProduct.price) + ' · Enviar por WhatsApp';
  }

  if (yapeQrPath) {
    yapeQr.addEventListener('load', () => { qrReady = true; renderManualPayment(); });
    yapeQr.addEventListener('error', () => { qrReady = false; renderManualPayment(); });
    yapeQr.src = yapeQrPath;
  }

  manualConfirm.addEventListener('click', () => {
    if (manualConfirm.disabled || !checkoutProduct || playerSession?.uid !== $('#uid').value.trim()) return;
    const {code} = draftForCheckout();
    const message = [
      'Hola, reporto un pago por Yape para una recarga de VortexGamer.',
      'ID de Free Fire: ' + playerSession.uid,
      'Monto pagado: ' + price(checkoutProduct.price),
      'Número de orden: ' + code,
      'Paquete: ' + $('#checkout-package').textContent,
      'Adjunto mi comprobante para que verifiquen el pago.'
    ].join('\n');
    window.open('https://wa.me/' + whatsappNumber + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
  });
  confirmDemoOrder.addEventListener('click', async () => {
    if (updatingOrder) return;
    if (!checkoutProduct || !playerSession || playerSession.uid !== $('#uid').value.trim()) {
      notify('Vuelve a verificar el UID antes de crear el pedido.');
      return;
    }
    const draft = draftForCheckout();
    updatingOrder = true;
    confirmDemoOrder.disabled = true;
    try {
      const order = await requestDemoOrder('POST', {
        code:draft.code, uid:playerSession.uid, productId:checkoutProduct.id,
        player:playerSession.demo ? 'Jugador de prueba' : playerSession.nickname,
        paymentMethod:selectedPaymentMethod, cents:Math.round(checkoutProduct.price * 100)
      });
      draftOrder = null;
      $('#demo-order-code').value = order.code;
      renderDemoOrder(order);
      closeLayer();
      orderSection.scrollIntoView({behavior:'smooth',block:'start'});
      $('#demo-order-code').focus({preventScroll:true});
    } catch (error) {
      notify(error.message || 'No se pudo guardar el pedido de prueba.');
    } finally {
      updatingOrder = false;
      confirmDemoOrder.disabled = false;
    }
  });

  $('#demo-order-search').addEventListener('submit', async event => {
    event.preventDefault();
    if (updatingOrder) return;
    const code = $('#demo-order-code').value.trim().toUpperCase();
    updatingOrder = true;
    try {
      renderDemoOrder(await requestDemoOrder('GET', {code}));
    } catch (error) {
      try {
        const legacy = JSON.parse(localStorage.getItem(demoOrderStorage + code));
        if (legacy?.code === code && Number.isInteger(legacy.stage) && demoOrderStates[legacy.stage]) {
          renderDemoOrder({...legacy, legacy:true});
          return;
        }
      } catch (_) {}
      renderDemoOrder(null, error.message || 'No se pudo consultar el pedido.');
    } finally {
      updatingOrder = false;
    }
  });

  $('#demo-order-advance').addEventListener('click', async event => {
    const order = displayedDemoOrder;
    if (updatingOrder || !order || order.stage >= demoOrderStates.length - 1) return;
    updatingOrder = true;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (order.legacy) {
        const key = demoOrderStorage + order.code;
        const saved = JSON.parse(localStorage.getItem(key));
        if (!saved) throw new Error('No encontramos ese pedido de prueba.');
        const next = {...saved, stage:saved.stage === order.stage ? saved.stage + 1 : saved.stage};
        localStorage.setItem(key, JSON.stringify(next));
        renderDemoOrder({...next, legacy:true});
      } else {
        renderDemoOrder(await requestDemoOrder('PATCH', {code:order.code, stage:order.stage}));
      }
    } catch (error) {
      notify(error.message || 'No se pudo guardar el estado del pedido.');
    } finally {
      updatingOrder = false;
      button.disabled = false;
    }
  });

  $('#demo-order-receipt').addEventListener('click', () => {
    const order = displayedDemoOrder;
    if (!order || order.stage < 1) return;
    const date = order.createdAt ? new Intl.DateTimeFormat('es-PE', {
      dateStyle:'medium', timeStyle:'short', timeZone:'America/Lima'
    }).format(new Date(order.createdAt)) : 'No disponible';
    const lines = [
      'VORTEXGAMER · COMPROBANTE DE PRUEBA', 'Operación simulada',
      'Pedido: ' + order.code, 'Jugador: ' + order.player, 'UID: ' + order.uid,
      'Paquete: ' + order.package, 'Importe: ' + price(order.total), 'Fecha del pedido: ' + date,
      'Método simulado: ' + order.method, 'Estado: ' + demoOrderStates[order.stage]
    ];
    const preview = $('#demo-order-receipt-preview');
    preview.replaceChildren();
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      preview.append(row);
    }
    const download = document.createElement('a');
    download.className = 'btn btn-outline';
    download.textContent = 'Descargar comprobante (.txt)';
    download.download = order.code + '.txt';
    download.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    preview.append(download);
    preview.hidden = false;
  });

  function requestCheckout(product) {
    if (!product || product.visible === false || document.documentElement.dataset.draft === 'true') return;
    const currentUID = $('#uid').value.trim();
    const region = 'br';
    if (!playerSession || playerSession.uid !== currentUID || playerSession.region !== region) {
      notify('Primero escribe y verifica tu UID. Para explorar la pantalla de pagos, usa el botón de prueba.');
      $('#verificador').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#uid').focus({ preventScroll: true });
      return;
    }
    checkoutProduct = product;
    $('#checkout-player').textContent = (playerSession.demo ? 'DEMO (sin verificar) · ' : playerSession.nickname + ' · ') + playerSession.uid;
    $('#checkout-package').textContent = product.title ?? (product.amount + ' + ' + product.bonus + ' diamantes');
    $('#checkout-price').textContent = price(product.price);
    setPaymentMethod('yape');
    openLayer('checkout-modal');
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (control) {
      const id = Number(control.dataset.id);
      const product = byId.get(id);
      if (!product) return;
      switch (control.dataset.action) {
        case 'add': addToCart(id); break;
        case 'pay': requestCheckout(product); break;
        case 'favorite': toggleFavorite(id); break;
        case 'increase': cart[id] = Math.min(99, (cart[id] || 0) + 1); refresh(); break;
        case 'decrease': if (cart[id] <= 1) delete cart[id]; else cart[id] -= 1; refresh(); break;
        case 'remove': delete cart[id]; refresh(); notify('Paquete eliminado del carrito'); break;
        case 'detail':
          showInfo(product.amount + ' DIAMANTES',
            'Incluye ' + product.amount + ' diamantes y ' + product.bonus + ' adicionales de bono por ' + price(product.price) + '. Esta es una ficha de producto de demostración; todavía no se aceptan pagos.');
          break;
      }
      return;
    }
    if (event.target.closest('[data-close]')) closeLayer();
  });

  const individualCards = new Map([
    [30001, {id: 30001, title: 'Tarjeta básica', price: 2}],
    [30002, {id: 30002, title: 'Tarjeta semanal', price: 6.5}],
    [30004, {id: 30004, title: 'Tarjeta mensual', price: 28}]
  ]);
  $$('[data-card-purchase]').forEach(button => {
    button.addEventListener('click', () => {
      if (offerSettings?.tarjetas?.visible === false) return;
      requestCheckout(individualCards.get(Number(button.dataset.cardPurchase)));
    });
  });

  $('#buy-booyah-pass').addEventListener('click', () => {
    const offer = offerSettings?.pase;
    requestCheckout({
      id: 30006,
      title: offer?.title ?? 'Pase Booyah',
      price: (offer?.cents ?? 500) / 100,
      visible: offer?.visible ?? true
    });
  });

  const levelConfirmation = $('#confirm-level-offer');
  const buyLevelOffer = $('#buy-level-offer');
  levelConfirmation.addEventListener('change', () => {
    buyLevelOffer.disabled = !levelConfirmation.checked;
  });
  $('#uid').addEventListener('input', () => {
    levelConfirmation.checked = false;
    buyLevelOffer.disabled = true;
  });
  buyLevelOffer.addEventListener('click', () => {
    if (!levelConfirmation.checked) return;
    const offer = offerSettings?.nivel;
    requestCheckout({
      id: 30005,
      title: offer?.title ?? 'Aumento de nivel',
      price: (offer?.cents ?? 1400) / 100,
      visible: offer?.visible ?? true
    });
  });

  $('#buy-card-offer').addEventListener('click', () => {
    const offer = offerSettings?.tarjetas;
    requestCheckout({
      id: 30003,
      title: offer?.title ?? 'Oferta de 3 tarjetas',
      price: (offer?.cents ?? 4000) / 100,
      visible: offer?.visible ?? true
    });
  });
  $('#cart-trigger').addEventListener('click', () => openLayer('cart-panel'));
  $$('.payment-tab').forEach(button => button.addEventListener('click', () => setPaymentMethod(button.dataset.method)));
  $('#simulate-verify').addEventListener('click', () => {
    const uidInput = $('#uid');
    const uid = uidInput.value.trim() || '123456789';
    if (!/^\d{8,12}$/.test(uid)) {
      notify('Para probar, introduce un UID de 8 a 12 dígitos.');
      uidInput.focus();
      return;
    }
    if (!uidInput.value.trim()) uidInput.value = uid;
    playerSession = { uid, region: 'br', nickname: 'JUGADOR DEMO', demo: true };
    const result = $('#verify-result');
    result.hidden = false;
    result.className = 'verify-result';
    result.textContent = 'MODO DEMO: UID ' + uid + ' NO verificado con Free Fire. Solo podrás visualizar el diseño de pago.';
    const status = $('#verified-status');
    status.hidden = false;
    status.textContent = '✓ MODO DE PRUEBA · SIN VERIFICACIÓN REAL';
    status.className = 'verified-status is-demo';
    notify('Vista de demostración activada. Selecciona un paquete y pulsa Pagar.');
    $('#tienda').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ['uid'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    playerSession = null;
    $('#verified-status').hidden = true;
  }));
  $('#favorites-trigger').addEventListener('click', () => openLayer('favorites-panel'));
  $('#account-trigger').addEventListener('click', () => showInfo('MI CUENTA', 'Estamos preparando el registro seguro, inicio de sesión, perfil, saldo e historial. No ingreses ninguna contraseña en esta demostración.'));
  $('#wallet-trigger').addEventListener('click', () => showInfo('BILLETERA VORTEX', 'El plan es permitir recargas de saldo desde S/ 5 por Yape, con comprobante y aprobación administrativa. El saldo y los pagos aún no están habilitados.'));
  $('#overlay').addEventListener('click', () => closeLayer());
  $('#demo-checkout').addEventListener('click', () => showInfo('COMPRAS EN PREPARACIÓN', 'Tu selección es una simulación. No se generó ningún pedido ni se cobró dinero. El proceso se habilitará cuando integremos y probemos el sistema de pagos, saldo y recargas.'));
  $('#clear-cart').addEventListener('click', () => { cart = {}; refresh(); notify('Carrito de prueba vaciado'); });
  function openCategoryFromHash(hash = location.hash) {
    const id = hash.slice(1);
    const category = document.getElementById(id)?.dataset.category;
    if (!category) return;
    currentCategory = category;
    renderProducts();
  }
  window.addEventListener('hashchange', () => openCategoryFromHash());
  $('.storefront-promos').addEventListener('click', event => {
    const link = event.target.closest('a[href^="#paquetes-"]');
    if (link) openCategoryFromHash(link.hash);
  });
  openCategoryFromHash();

  $$('.catalog-category').forEach(button => button.addEventListener('click', () => {
    currentCategory = button.dataset.category;
    renderProducts();
  }));
  $('#menu-trigger').addEventListener('click', () => {
    const menu = $('#mobile-nav');
    menu.hidden = !menu.hidden;
    $('#menu-trigger').setAttribute('aria-expanded', String(!menu.hidden));
  });
  $$('#mobile-nav a').forEach(link => link.addEventListener('click', () => {
    $('#mobile-nav').hidden = true;
    $('#menu-trigger').setAttribute('aria-expanded', 'false');
  }));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (activeLayer) closeLayer();
      else if (!$('#mobile-nav').hidden) {
        $('#mobile-nav').hidden = true;
        $('#menu-trigger').setAttribute('aria-expanded', 'false');
      }
    }
  });

  const verifyForm = $('#verify-form');
  verifyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const uid = $('#uid').value.trim();
    const region = 'br';
    const result = $('#verify-result');
    if (!/^\d{8,12}$/.test(uid)) {
      result.hidden = false;
      result.className = 'verify-result error';
      result.textContent = 'Escribe un UID válido de 8 a 12 dígitos.';
      return;
    }
    if (uidValidationConfig?.validationReady && !uidTurnstileToken) {
      result.hidden = false;
      result.className = 'verify-result error';
      result.textContent = 'Completa el control de seguridad antes de verificar el UID.';
      return;
    }
    const button = $('#verify-btn');
    button.disabled = true;
    const originalLabel = button.innerHTML;
    button.textContent = 'CONSULTANDO JUGADOR…';
    result.hidden = false;
    result.className = 'verify-result';
    result.textContent = 'Consultando el servidor de verificación…';
    try {
      // Recargas América es el verificador preferido cuando el dueño lo habilite.
      // Si aún no está configurado, se conserva el verificador independiente anterior.
      let response = await fetch('/api/recargas/validate', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, turnstileToken: uidTurnstileToken })
      });
      let data = await response.json();
      let verificationSource = 'Recargas América';
      if (response.status === 503 && data.code === 'NOT_READY') {
        verificationSource = 'Verificador alternativo';
        response = await fetch('/api/freefire/verify?' + new URLSearchParams({ uid, region }).toString(), { headers: { Accept: 'application/json' } });
        data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible verificar el UID.');
        verificationSource = data.source || verificationSource;
      } else {
        if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible validar el UID.');
        if (data.supported !== true || data.verified !== true) {
          throw new Error(data.message || 'Este UID no pudo verificarse. Utiliza el modo demostración para explorar la web.');
        }
      }
      result.className = 'verify-result ok';
      result.replaceChildren();
      const name = document.createElement('strong');
      name.textContent = data.player.nickname ? 'Jugador: ' + data.player.nickname : 'Nombre del jugador no disponible';
      const details = document.createElement('div');
      details.textContent = 'UID: ' + data.player.uid + ' · Región de tienda: Sur LATAM · ' + verificationSource + (data.player.level == null ? '' : ' · Nivel: ' + data.player.level);
      result.append(name, details);
      playerSession = {
        uid,
        nickname: data.player.nickname || 'Cuenta validada',
        region,
        demo: false
      };
      const status = $('#verified-status');
      status.hidden = false;
      status.className = 'verified-status is-verified';
      status.textContent = '✓ UID VERIFICADO · YA PUEDES ELEGIR TU PAQUETE';
      notify('Jugador verificado. Ahora elige tus diamantes y pulsa Pagar.');
    } catch (error) {
      playerSession = null;
      $('#verified-status').hidden = true;
      result.className = 'verify-result error';
      result.textContent = error.message || 'No fue posible contactar al proveedor.';
    } finally {
      resetUidTurnstile();
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });

  const sampleNames = [
    'KIRAツ', 'NOVA亗', 'RAYO⚡', 'LUNA彡', 'AKIRA✦', 'ZETAシ',
    'NEON亗', 'YUKIツ', 'KAZE✧', 'DRACO彡', 'RYU⚡', 'NIX✦'
  ];
  const nicknameRoots = [
    'Ghost', 'Sombra', 'Fénix', 'Demon', 'Lobo', 'Kenshi', 'Ninja', 'Ragnar', 'Venom', 'Zafiro',
    'Raven', 'Kitsune', 'Tigre', 'Skull', 'Blade', 'Onyx', 'Zero', 'Kronos', 'Lynx', 'Chaos'
  ];
  const nicknameStyles = [
    name => '亗' + name, name => name + 'ツ', name => '꧁' + name + '꧂', name => name + '〆',
    name => 'x' + name + 'x', name => name + '彡', name => 'ᴳᵀ' + name, name => name + '⚡',
    name => 'SR・' + name, name => name + '⁹⁹', name => '『' + name + '』', name => name + 'ᴳᵒᵈ',
    name => 'FF・' + name, name => name + '✦', name => '么' + name, name => name + 'ᵖʳᵒ',
    name => 'RZ_' + name, name => name + '᭄', name => 'ᴮᴼˢˢ' + name, name => name + '×7'
  ];
  const activity = document.createElement('section');
  activity.className = 'activity-ticker';
  activity.setAttribute('aria-label', 'Ejemplos de actividad de recargas');
  activity.innerHTML = `
    <div class="activity-ticker-controls">
      <span>ACTIVIDAD DE EJEMPLO</span>
      <button type="button" class="activity-toggle">Pausar</button>
    </div>
    <div class="activity-window"><div class="activity-track"></div></div>`;

  const samples = document.createElement('ul');
  samples.className = 'activity-items';
  const formatter = new Intl.NumberFormat('es-PE');
  const selectedNames = [
    ...sampleNames,
    ...nicknameRoots.flatMap(name => nicknameStyles.map(style => style(name)))
  ];
  const sampleAmounts = PRODUCTS.flatMap(product => [1, 2, 3].map(quantity => ({
    base: product.id * quantity,
    bonus: Number(product.bonus) * quantity
  })));
  const cardsPerVisit = 24;
  let previousAmount;
  for (let i = 0; i < cardsPerVisit; i += 1) {
    const [nickname] = selectedNames.splice(Math.floor(Math.random() * selectedNames.length), 1);
    const choices = sampleAmounts.filter(amount => amount !== previousAmount);
    const amount = choices[Math.floor(Math.random() * choices.length)];
    previousAmount = amount;
    const item = document.createElement('li');
    item.className = 'activity-pill';
    item.innerHTML = '<span class="activity-dot" aria-hidden="true"></span><span class="activity-game">FREE FIRE</span>';
    const player = document.createElement('strong');
    player.className = 'activity-player';
    player.textContent = nickname;
    const diamonds = document.createElement('strong');
    diamonds.textContent = formatter.format(amount.base) + ' + ' + formatter.format(amount.bonus) +
      ' diamantes (' + formatter.format(amount.base + amount.bonus) + ' 💎)';
    item.append(player, ' · ', diamonds);
    samples.append(item);
  }

  const duplicate = samples.cloneNode(true);
  duplicate.setAttribute('aria-hidden', 'true');
  const activityTrack = activity.querySelector('.activity-track');
  activityTrack.style.animationDuration = cardsPerVisit * 7.75 + 's';
  activityTrack.append(samples, duplicate);
  const activityToggle = activity.querySelector('.activity-toggle');
  activityToggle.addEventListener('click', () => {
    const paused = activity.classList.toggle('is-paused');
    activityToggle.textContent = paused ? 'Reanudar' : 'Pausar';
  });
  $('.features-bar').before(activity);

  $('#year').textContent = new Date().getFullYear();
  const editableCopy = {
  "verifyTitle": ".verify-card-head h2",
  "catalogHeading": "#catalog-heading",
  "catalogDescription": "#catalog-description",
  "midTitle": ".mid-banner h3",
  "midLabel": ".mid-banner-title small",
  "midBody": ".mid-banner > p",
  "walletLabel": "#wallet-trigger",
  "footer": ".footer-top > div:first-child > p",
  "faqTitle": ".faq-section#ayuda h2",
  "diamantesTitle": "[data-category=\"diamantes\"] strong",
  "diamantesDesc": "[data-category=\"diamantes\"] small",
  "fragmentosTitle": "[data-category=\"fragmentos\"] strong",
  "fragmentosDesc": "[data-category=\"fragmentos\"] small",
  "paseTitle": "[data-category=\"pase\"] strong",
  "paseDesc": "[data-category=\"pase\"] small",
  "tarjetasTitle": "[data-category=\"tarjetas\"] strong",
  "tarjetasDesc": "[data-category=\"tarjetas\"] small",
  "nivelTitle": "[data-category=\"nivel\"] strong",
  "nivelDesc": "[data-category=\"nivel\"] small"
};

  const mainContent = $('main');
  const coreSections = new Map([
    ['inicio', $('#inicio')], ['beneficios', $('.features-bar')], ['recargas', $('.recharge-area')],
    ['promocion', $('.mid-banner')], ['seguimiento', orderSection], ['ayuda', $('#ayuda')]
  ]);

  function renderLayout(layout) {
    for (const old of mainContent.querySelectorAll('[data-builder-block]')) old.remove();
    for (const block of layout) {
      const core = coreSections.get(block.id);
      if (core) {
        core.hidden = !block.visible;
        if (block.id === 'beneficios') {
          activity.hidden = !block.visible || activity.dataset.settingHidden === 'true';
          mainContent.append(activity);
        }
        mainContent.append(core);
        continue;
      }
      if (!block.visible) continue;
      const section = document.createElement('section');
      section.id = block.id;
      section.dataset.builderBlock = block.id;
      section.className = 'builder-block builder-' + block.width;
      section.style.textAlign = block.align;
      section.style.backgroundColor = block.background;
      section.style.color = block.color;
      const linkAllowed = /^(?:#[a-z0-9-]+|https:\/\/[^\s\\]+)$/i.test(block.link);
      if (block.image) {
        const image = document.createElement('img');
        image.src = block.image;
        image.alt = block.title || '';
        image.loading = 'lazy';
        image.className = 'builder-image-' + (block.imageSize || 'full');
        if (!block.button && linkAllowed) {
          const link = document.createElement('a');
          link.href = block.link;
          link.setAttribute('aria-label', block.title || 'Ver promoción');
          link.append(image);
          section.append(link);
        } else section.append(image);
      }
      if (block.title) {
        const title = document.createElement('h2');
        title.textContent = block.title;
        section.append(title);
      }
      if (block.body) {
        const body = document.createElement('p');
        body.textContent = block.body;
        section.append(body);
      }
      if (block.button && linkAllowed) {
        const button = document.createElement('a');
        button.className = 'btn btn-accent';
        button.href = block.link;
        button.textContent = block.button;
        section.append(button);
      }
      mainContent.append(section);
    }
  }

  function applyStoreSettings(settings) {
    $('#catalog-heading').textContent = settings.heading;
    $('#catalog-description').textContent = settings.description;
    document.documentElement.style.setProperty('--store-accent', settings.accent);
    activity.hidden = !settings.activity;
    activity.dataset.settingHidden = String(!settings.activity);
    offerSettings = settings.offers;
    if (settings.fragments) fragments = settings.fragments;
    for (const [key,selector] of Object.entries(editableCopy)) {
      const node = $(selector);
      if (!node) continue;
      if (settings.copy?.[key] && key !== 'catalogHeading' && key !== 'catalogDescription') {
        const icon = node.querySelector('svg');
        node.textContent = settings.copy[key];
        if (icon) node.append(icon);
      }
      node.dataset.inlineCopy = key;
    }
    for (const product of PRODUCTS) {
      const options = settings.products[product.id];
      product.price = options.cents / 100;
      product.visible = options.visible;
      product.image = /^(?:\/images\/[\w.-]+(?:\?v=[\w-]+)?|data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2})$/.test(options.image) ? options.image : '';
    }
    for (const [id,offer] of Object.entries(offerSettings)) {
      const article = document.querySelector('.catalog-offer[data-offer="' + id + '"]');
      if (!article) continue;
      article.querySelector('h3').textContent = offer.title;
      article.querySelector('p').textContent = offer.description;
      article.querySelector('strong').textContent = price(offer.cents / 100);
      if (id === 'pase') {
        const reference = article.querySelector('.pass-reference');
        reference.hidden = !offer.image;
        const image = reference.querySelector('img');
        if (offer.image) image.src = offer.image;
        else image.removeAttribute('src');
      } else {
        article.querySelector('img').src = offer.image || '/images/oferta-' + id + '.webp';
      }
    }
    const art = settings.banners.map((banner,index) => ({banner,index}))
      .filter(({banner}) => banner.visible).map(({banner,index},position) => {
      const link = document.createElement('a');
      link.dataset.inlineBanner = index;
      link.className = position === 0 ? 'storefront-promo managed-main-banner' : 'storefront-promo';
      link.href = '#paquetes-' + banner.category;
      const image = document.createElement('img');
      image.src = banner.image;
      image.alt = '';
      const caption = document.createElement('span');
      caption.textContent = banner.title + ' · Ver paquetes →';
      link.append(image, caption);
      return link;
    });
    $('.storefront-promos').replaceChildren(...art);
    $('.storefront-promos').hidden = !art.length;
    if (settings.layout) renderLayout(settings.layout);
    refresh();
  }

  refresh();
  if (new URLSearchParams(location.search).get('draft') === '1' && window.parent !== window) {
    document.documentElement.dataset.draft = 'true';
    window.vortexApplyAdminDraft = applyStoreSettings;
  } else {
    fetch('/api/site-settings').then(response => response.ok ? response.json() : null)
      .then(data => { if (data?.revision > 0) applyStoreSettings(data.settings); }).catch(() => {});
  }
  setupUidTurnstile();
})();