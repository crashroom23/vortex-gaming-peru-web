(() => {
  'use strict';

  const PRODUCTS = [
    { id: 100, imageNumber: 1, amount: '100', bonus: '10', price: 3.50, category: 'starter', tag: 'BONUS +10', type: 'PACK INICIAL' },
    { id: 310, imageNumber: 2, amount: '310', bonus: '31', price: 9.80, category: 'starter', tag: 'BONUS +31', type: 'PACK POPULAR' },
    { id: 520, imageNumber: 3, amount: '520', bonus: '52', price: 15.00, category: 'starter', tag: 'BONUS +52', type: 'PACK AVANZADO' },
    { id: 1060, imageNumber: 4, amount: '1,060', bonus: '106', price: 27.00, category: 'premium', tag: 'PACK PRO', type: 'PACK ÉLITE' },
    { id: 2180, imageNumber: 5, amount: '2,180', bonus: '218', price: 52.00, category: 'premium', tag: 'PACK PRO', type: 'PACK LEGENDARIO' },
    { id: 5600, imageNumber: 6, amount: '5,600', bonus: '560', price: 130.00, category: 'premium', tag: 'MAX PACK', type: 'PACK MÁXIMO' }
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
      const result = $('#verify-result');
      if (uidValidationConfig?.validationReady && result) {
        result.hidden = false;
        result.className = 'verify-result error';
        result.textContent = 'El control de seguridad no cargó. Comprueba tu conexión.';
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
      '<img class="card-gem pack-photo" src="', product.image || '/images/pack-' + product.imageNumber + '.png?v=6a62bac', '" alt="" loading="lazy" decoding="async">',
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
    $('#cart-whatsapp').disabled = count === 0;
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
    notify(product.amount + ' diamantes añadidos al carrito');
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

  let storeWhatsApp = '';
  let storeYapeQr = '';
  let storeYapeNumber = '';
  const walletPurchasesEnabled = false;
  let walletSelection;
  const walletButton = $('#checkout-wallet');
  const walletMessage = $('#checkout-wallet-message');

  function whatsAppLink(message) {
    return /^[1-9]\d{7,14}$/.test(storeWhatsApp)
      ? 'https://wa.me/' + storeWhatsApp + '?text=' + encodeURIComponent(message)
      : '';
  }

  function setWhatsAppLink(link, message) {
    const href = whatsAppLink(message);
    link.hidden = !href;
    if (href) link.href = href;
    else link.removeAttribute('href');
    return Boolean(href);
  }

  async function walletRequest(method, productId, data) {
    const response = await fetch('/api/wallet' + (productId ? '?product=' + productId : ''), {
      method, cache:'no-store',
      headers:data ? {'Content-Type':'application/json'} : undefined,
      body:data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (response.status === 401 && method === 'GET') return null;
    if (!response.ok) throw Object.assign(new Error(result.message), {
      code:result.code,
      username:result.username
    });
    return result;
  }

  const topupButton = $('#checkout-topup');
  const topupAmount = $('#topup-amount');
  const topupQr = $('#topup-qr');
  const topupYape = $('#topup-yape');
  const topupStatus = $('#topup-status');
  const topupSend = $('#topup-send');
  let topupUsername;
  let topupReturnLayer = 'checkout-modal';

  function showWalletTopUp(username) {
    topupUsername = username;
    topupButton.hidden = false;
  }

  function openTopUp(username, returnLayer) {
    if (!username) return;
    topupUsername = username;
    topupReturnLayer = returnLayer;
    $('#topup-back').textContent = returnLayer === 'account-modal' ? 'Volver a Mi cuenta' : 'Volver al pedido';
    $('#topup-user').textContent = 'Usuario: ' + topupUsername;
    topupAmount.value = '10';
    topupSend.disabled = true;
    topupYape.hidden = true;
    const configured = Boolean(storeYapeQr && whatsAppLink(''));
    topupStatus.textContent = configured ? 'Cargando QR de Yape…' : 'La recarga por Yape no está disponible.';
    if (configured) {
      $('#topup-number').textContent = /^9\d{8}$/.test(storeYapeNumber)
        ? 'Yape: ' + storeYapeNumber.replace(/(\d{3})(?=\d)/g, '$1 ') : '';
      topupQr.onload = () => {
        topupYape.hidden = false;
        topupSend.disabled = false;
        topupStatus.textContent = '';
      };
      topupQr.onerror = () => {
        topupYape.hidden = true;
        topupSend.disabled = true;
        topupStatus.textContent = 'No se pudo cargar el QR de Yape.';
      };
      topupQr.src = storeYapeQr;
      if (topupQr.complete && topupQr.naturalWidth) topupQr.onload();
    } else {
      topupQr.onload = topupQr.onerror = null;
      topupQr.removeAttribute('src');
    }
    openLayer('topup-modal');
  }

  topupButton.addEventListener('click', () => openTopUp(topupUsername, 'checkout-modal'));

  $('#topup-form').addEventListener('submit', event => {
    event.preventDefault();
    if (topupSend.disabled || !topupUsername || !topupAmount.reportValidity()) return;
    const href = whatsAppLink('Hola, ya pagué por Yape y quiero recargar saldo en VortexGamer.' +
      '\nUsuario: ' + topupUsername + '\nMonto: ' + price(topupAmount.valueAsNumber) +
      '\nAdjunto mi captura de pago.');
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  });

  $('#topup-back').addEventListener('click', () => {
    openLayer(topupReturnLayer);
    (topupReturnLayer === 'account-modal' ? $('#account-topup') : topupButton).focus();
  });

  async function showCheckoutOptions(product, uid, verified) {
    const previous = walletSelection;
    const selection = previous?.uid === uid && previous.productId === product.id && !previous.complete
      ? previous : {uid, productId:product.id, code:crypto.randomUUID()};
    walletSelection = selection;
    walletButton.hidden = $('#checkout-topup').hidden = $('#checkout-wallet-receipt').hidden = true;
    const yape = $('#checkout-yape');
    const qr = $('#checkout-yape-qr');
    const whatsapp = $('#checkout-whatsapp');
    const qrStatus = $('#checkout-yape-status');
    setWhatsAppLink($('#checkout-contact'), 'Hola, quiero hacer un pedido en VortexGamer.' +
      '\nPaquete: ' + $('#checkout-package').textContent + '\nUID: ' + uid + '\nMonto: ' + price(product.price));
    const hasYape = Boolean(storeYapeQr && setWhatsAppLink(whatsapp,
      'Hola, ya pagué por Yape en VortexGamer.\nPaquete: ' + $('#checkout-package').textContent +
      '\nUID: ' + uid + '\nMonto: ' + price(product.price) + '\nAdjunto mi captura de pago.'));
    yape.hidden = !hasYape;
    const yapeNumber = $('#checkout-yape-number');
    yapeNumber.hidden = !/^9\d{8}$/.test(storeYapeNumber);
    yapeNumber.textContent = 'Número de Yape: ' + storeYapeNumber.replace(/(\d{3})(?=\d)/g, '$1 ');
    $('#checkout-yape-unavailable').hidden = hasYape;
    whatsapp.hidden = true;
    qr.hidden = true;
    qr.onload = () => {
      qr.hidden = false;
      whatsapp.hidden = false;
      qrStatus.textContent = '';
    };
    qr.onerror = () => {
      qr.hidden = whatsapp.hidden = true;
      qrStatus.textContent = 'No pudimos cargar el QR. Vuelve a abrir el pedido.';
    };
    if (hasYape) {
      qrStatus.textContent = 'Cargando QR…';
      qr.src = storeYapeQr;
      if (qr.complete && qr.naturalWidth) qr.onload();
    } else {
      qr.removeAttribute('src');
    }
    if (!walletPurchasesEnabled) {
      walletMessage.textContent = 'Confirma tu pedido por WhatsApp. La entrega se realiza después de verificar el pago.';
      return;
    }
    if (!verified) {
      walletMessage.textContent = 'Verifica tu UID para pagar con saldo.';
      return;
    }
    walletMessage.textContent = 'Consultando saldo…';
    try {
      const info = await walletRequest('GET', product.id);
      if (selection !== walletSelection || selection.complete) return;
      if (!info) {
        walletMessage.textContent = 'Inicia sesión en Mi cuenta para pagar con saldo.';
        return;
      }
      selection.cents = info.cents;
      const enough = info.balance_cents >= info.cents;
      walletButton.textContent = 'Pagar ' + price(info.cents / 100) + ' con saldo';
      walletButton.hidden = !enough;
      walletMessage.textContent = 'Saldo disponible: ' + price(info.balance_cents / 100) +
        '. Precio con saldo: ' + price(info.cents / 100) + '.' + (enough ? '' : ' Saldo insuficiente.');
      if (!enough) showWalletTopUp(info.username);
    } catch {
      if (selection === walletSelection) walletMessage.textContent = 'Pago con saldo temporalmente no disponible.';
    }
  }

  function showWalletReceipt(order, packageName) {
    const paid = price(order.cents / 100);
    const timestamp = new Date(order.createdAt.replace(' ', 'T') + 'Z');
    const date = new Intl.DateTimeFormat('es-PE', {
      dateStyle:'short', timeStyle:'short', timeZone:'America/Lima'
    }).format(timestamp);
    const image = document.createElement('img');
    image.width = 900;
    image.height = 920;
    image.alt = 'Comprobante de pago con saldo. Entrega pendiente. ' + packageName +
      '. Importe: ' + paid + '. ID: ' + order.uid + '. Pedido: ' + order.code + '. Fecha: ' + date;
    const escapeXml = value => String(value).replace(/[&<>]/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;'
    })[character]);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="920" viewBox="0 0 900 920">
      <defs>
        <linearGradient id="background" x2="1" y2="1">
          <stop stop-color="#251048"/><stop offset="1" stop-color="#080615"/>
        </linearGradient>
        <linearGradient id="accent">
          <stop stop-color="#5de9ff"/><stop offset="1" stop-color="#df65ff"/>
        </linearGradient>
      </defs>
      <rect width="900" height="920" fill="url(#background)"/>
      <path d="M0 160V0h160z M900 752v168H732z" fill="#922fff" opacity=".48"/>
      <path d="M0 225v-34L191 0h34z M900 687v34L701 920h-34z" fill="#df65ff" opacity=".65"/>
      <rect x="36" y="36" width="828" height="848" rx="34" fill="#100b25" stroke="#a94af9" stroke-width="3"/>
      <g font-family="Arial, sans-serif" fill="#f8f4ff">
        <text x="76" y="112" font-size="44" font-weight="900" font-style="italic">VORTEX<tspan fill="#df65ff">GAMER</tspan></text>
        <text x="76" y="156" fill="#6de9ff" font-size="23" font-weight="bold">FREE FIRE</text>
        <text x="76" y="226" font-size="47" font-weight="900">PAGO REGISTRADO</text>
        <text x="76" y="268" fill="#ffc978" font-size="24">Entrega pendiente</text>
        <rect x="76" y="306" width="748" height="128" rx="18" fill="#211137" stroke="#bb54ff" stroke-width="2"/>
        <path d="M102 354l21-24h55l21 24-48 49z" fill="url(#accent)"/>
        <text x="225" y="350" fill="#df8dff" font-size="23" font-weight="bold">PAQUETE</text>
        <text x="225" y="400" font-size="40" font-weight="bold">${escapeXml(packageName)}</text>
        <rect x="76" y="452" width="748" height="122" rx="18" fill="#211137" stroke="#bb54ff" stroke-width="2"/>
        <text x="103" y="495" fill="#df8dff" font-size="23" font-weight="bold">TOTAL PAGADO CON SALDO</text>
        <text x="103" y="548" font-size="49" font-weight="bold">${escapeXml(paid)}</text>
        <text x="76" y="628" fill="#df8dff" font-size="22" font-weight="bold">ID DEL JUGADOR</text>
        <text x="76" y="667" font-size="32" font-weight="bold">${escapeXml(order.uid)}</text>
        <text x="76" y="723" fill="#df8dff" font-size="22" font-weight="bold">CÓDIGO DE PEDIDO</text>
        <text x="76" y="764" font-family="monospace" font-size="27">${escapeXml(order.code)}</text>
        <path d="M76 797h748" stroke="#674296"/>
        <text x="76" y="842" font-size="22" fill="#dbcaef">${escapeXml(date)} · Hora de Perú</text>
      </g>
    </svg>`;
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'btn btn-accent btn-wide';
    download.textContent = 'Descargar comprobante PNG';
    download.addEventListener('click', async () => {
      download.disabled = true;
      try {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        const link = document.createElement('a');
        link.download = 'VortexGamer-' + order.code + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch {
        notify('No se pudo descargar el comprobante. Inténtalo de nuevo.');
      } finally {
        download.disabled = false;
      }
    });
    const receipt = $('#checkout-wallet-receipt');
    receipt.replaceChildren(image, download);
    receipt.hidden = false;
  }

  walletButton.addEventListener('click', async () => {
    const selection = walletSelection;
    if (!walletPurchasesEnabled || !selection || selection.complete || walletButton.disabled) return;
    if (selection.uid !== $('#uid').value.trim()) {
      walletMessage.textContent = 'Vuelve a verificar tu UID.';
      return;
    }
    walletButton.disabled = true;
    const packageName = $('#checkout-package').textContent;
    try {
      const {order} = await walletRequest('POST', null, selection);
      selection.complete = true;
      if (walletSelection !== selection) return;
      walletButton.hidden = true;
      $('#checkout-yape').hidden = true;
      $('#checkout-yape-unavailable').hidden = true;
      walletMessage.textContent = 'Pago con saldo registrado. Entrega pendiente.';
      showWalletReceipt(order, packageName);
    } catch (error) {
      if (walletSelection === selection) {
        walletMessage.textContent = error.message || 'No se pudo confirmar el pago.';
        if (error.code === 'INSUFFICIENT_BALANCE') {
          walletButton.hidden = true;
          showWalletTopUp(error.username);
        }
      }
    } finally {
      walletButton.disabled = false;
    }
  });

  function requestCheckout(product) {
    if (!product || product.visible === false || document.documentElement.dataset.draft === 'true') return;
    const currentUID = $('#uid').value.trim();
    if (!/^\d{8,12}$/.test(currentUID)) {
      notify('Escribe tu UID de Free Fire para continuar.');
      $('#verificador').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#uid').focus({ preventScroll: true });
      return;
    }
    const currentPlayer = playerSession?.uid === currentUID ? playerSession : null;
    $('#checkout-player').textContent = (currentPlayer ? currentPlayer.nickname + ' · ' : 'UID · ') + currentUID;
    $('#checkout-package').textContent = product.title ?? (product.amount + ' + ' + product.bonus + ' diamantes');
    $('#checkout-price').textContent = price(product.price);
    openLayer('checkout-modal');
    void showCheckoutOptions(product, currentUID, Boolean(currentPlayer));
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
            'Incluye ' + product.amount + ' diamantes y ' + product.bonus + ' adicionales de bono por ' + price(product.price) + '. Haz tu pedido por WhatsApp.');
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
  ['uid'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    playerSession = null;
    $('#verified-status').hidden = true;
  }));
  $('#favorites-trigger').addEventListener('click', () => openLayer('favorites-panel'));
  const accountForm = $('#account-form');
  const accountMessage = $('#account-message');
  const accountPassword = $('#account-password');
  const accountSubmit = $('#account-submit');
  const accountMode = $('#account-mode');
  const accountLogout = $('#account-logout');
  let accountAction = 'login';

  function setAccountMode(action) {
    accountAction = action;
    accountPassword.value = '';
    accountPassword.autocomplete = action === 'register' ? 'new-password' : 'current-password';
    accountSubmit.textContent = action === 'register' ? 'Registrarme' : 'Iniciar sesión';
    accountMode.textContent = action === 'register' ? 'Ya tengo cuenta' : 'Crear una cuenta';
    accountMessage.textContent = action === 'register' ? 'Elige un usuario y una contraseña de al menos 6 caracteres.' : '';
  }

  async function accountRequest(method, data) {
    const options = {method, credentials: 'same-origin', cache: 'no-store'};
    if (data) {
      options.headers = {'Content-Type': 'application/json'};
      options.body = JSON.stringify(data);
    }
    const response = await fetch('/api/account', options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result;
  }

  const accountDashboard = $('#account-dashboard');
  const accountOrders = $('#account-orders');
  const accountMore = $('#account-more');
  const accountHistoryStatus = $('#account-history-status');
  let accountVersion = 0;
  let historyCursor;
  let accountUsername;

  function showAccountView(view) {
    accountDashboard.dataset.view = view;
    accountDashboard.querySelectorAll('[data-account-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.accountView === view));
    });
    $('#account-purchases').hidden = view === 'profile';
    $('#account-details').hidden = view !== 'profile';
    $('#account-view-history').hidden = view !== 'summary';
    $('#account-purchases-title').textContent = view === 'summary' ? 'Compras recientes' : 'Compras con saldo';
  }

  accountDashboard.querySelectorAll('[data-account-view]').forEach(button => {
    button.addEventListener('click', () => showAccountView(button.dataset.accountView));
  });
  $('#account-view-history').addEventListener('click', () => {
    showAccountView('orders');
    $('[data-account-view="orders"]').focus();
  });
  $('#account-topup').addEventListener('click', () => openTopUp(accountUsername, 'account-modal'));

  function historyProduct(id) {
    const diamond = byId.get(id);
    if (diamond) return diamond.amount + ' + ' + diamond.bonus + ' diamantes';
    const card = individualCards.get(id);
    if (card) return card.title;
    const offerName = {30003:'Oferta de 3 tarjetas', 30005:'Aumento de nivel', 30006:'Pase Booyah'}[id];
    if (offerName) return offerName;
    const group = Math.floor(id / 1000000);
    const quantity = id % 1000000;
    if (group === 1 || group === 2) return quantity + (group === 1 ? ' cajas EVO' : ' tokens EVO');
    return 'Paquete ' + id;
  }

  async function loadAccountHistory(username, version, before) {
    accountMore.disabled = true;
    accountHistoryStatus.textContent = 'Cargando compras…';
    try {
      const response = await fetch('/api/wallet?history=1' + (before ? '&before=' + before : ''), {cache:'no-store'});
      const data = await response.json();
      if (version !== accountVersion) return;
      if (!response.ok || data.username !== username) throw new Error(data.message);
      $('#account-balance').textContent = price(data.balance_cents / 100);
      if (!before) {
        const uid = data.orders[0]?.uid;
        $('#account-last-uid').textContent = uid ? 'Último ID de Free Fire: ' + uid : 'Último ID de Free Fire: —';
      }
      for (const order of data.orders) {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = historyProduct(order.productId) + ' · ' + price(order.cents / 100);
        const detail = document.createElement('p');
        detail.textContent = 'ID: ' + order.uid + ' · Entrega pendiente';
        const date = new Date(order.createdAt.replace(' ', 'T') + 'Z').toLocaleString('es-PE', {timeZone:'America/Lima'});
        const reference = document.createElement('small');
        reference.textContent = date + ' · Pedido ' + order.code;
        item.append(title, detail, reference);
        accountOrders.append(item);
      }
      historyCursor = data.next;
      accountMore.hidden = !historyCursor;
      accountHistoryStatus.textContent = accountOrders.children.length ? '' : 'Aún no tienes compras con saldo.';
    } catch {
      if (version === accountVersion) accountHistoryStatus.textContent = 'No se pudieron cargar tus compras. Vuelve a abrir Mi cuenta.';
    } finally {
      if (version === accountVersion) accountMore.disabled = false;
    }
  }

  function renderAccount(username) {
    const version = ++accountVersion;
    accountForm.hidden = Boolean(username);
    accountLogout.hidden = !username;
    accountDashboard.hidden = !username;
    $('#account-modal').classList.toggle('has-account', Boolean(username));
    accountUsername = username;
    accountMessage.textContent = '';
    accountOrders.replaceChildren();
    accountMore.hidden = true;
    historyCursor = null;
    if (username) {
      $('#account-profile').textContent = 'Usuario: ' + username;
      $('#account-display-name').textContent = username;
      $('#account-initial').textContent = username[0].toUpperCase();
      $('#account-greeting').textContent = 'Hola, ' + username;
      showAccountView('summary');
      $('#account-balance').textContent = '—';
      $('#account-last-uid').textContent = '';
      void loadAccountHistory(username, version);
    }
  }

  accountMore.addEventListener('click', () => {
    if (historyCursor) void loadAccountHistory(accountUsername, accountVersion, historyCursor);
  });

  let accountBusy = false;
  async function updateAccount(method, data) {
    if (accountBusy) return;
    accountBusy = true;
    accountSubmit.disabled = accountMode.disabled = accountLogout.disabled = true;
    accountMessage.textContent = 'Cargando…';
    try {
      const {username} = await accountRequest(method, data);
      renderAccount(username);
    } catch (error) {
      accountMessage.textContent = error instanceof SyntaxError ?
        'El acceso a cuentas no está disponible en este momento.' : error.message;
    } finally {
      accountPassword.value = '';
      accountBusy = false;
      accountSubmit.disabled = accountMode.disabled = accountLogout.disabled = false;
    }
  }

  $('#account-trigger').addEventListener('click', () => {
    openLayer('account-modal');
    if (accountBusy) return;
    setAccountMode('login');
    accountForm.hidden = accountLogout.hidden = accountDashboard.hidden = true;
    void updateAccount('GET');
  });
  accountMode.addEventListener('click', () => {
    setAccountMode(accountAction === 'login' ? 'register' : 'login');
    $('#account-username').focus();
  });
  accountForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void updateAccount('POST', {
      action: accountAction,
      username: $('#account-username').value,
      password: accountPassword.value
    });
  });
  accountLogout.addEventListener('click', () => {
    accountForm.reset();
    setAccountMode('login');
    void updateAccount('DELETE');
  });
  $('#overlay').addEventListener('click', () => closeLayer());
  $('#cart-whatsapp').addEventListener('click', () => {
    const uidInput = $('#uid');
    const uid = uidInput.value.trim();
    if (!/^\d{8,12}$/.test(uid)) {
      closeLayer();
      notify('Escribe el UID de tu cuenta de Free Fire para enviar el pedido.');
      uidInput.focus();
      return;
    }
    const items = Object.entries(cart)
      .map(([id, quantity]) => ({product:byId.get(Number(id)), quantity}))
      .filter(({product, quantity}) => product && product.visible !== false && quantity > 0);
    if (!items.length) return;
    const packages = items.map(({product, quantity}) =>
      quantity + ' × ' + product.amount + ' + ' + product.bonus + ' diamantes');
    const total = items.reduce((sum, {product, quantity}) => sum + product.price * quantity, 0);
    const href = whatsAppLink('Hola, quiero hacer un pedido en VortexGamer.\nUID: ' + uid +
      '\n' + packages.join('\n') + '\nTotal: ' + price(total));
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    else notify('WhatsApp no está disponible en este momento.');
  });
  $('#clear-cart').addEventListener('click', () => { cart = {}; refresh(); notify('Carrito vaciado'); });
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
      // Si aún no está configurado, se conserva el verificador independiente anterior.
      let response = await fetch('/api/recargas/validate', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, turnstileToken: uidTurnstileToken })
      });
      let data = await response.json();
      if (response.status === 503 && data.code === 'NOT_READY') {
        response = await fetch('/api/freefire/verify?' + new URLSearchParams({ uid, region }).toString(), { headers: { Accept: 'application/json' } });
        data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible verificar el UID.');
      } else {
        if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible validar el UID.');
        if (data.supported !== true || data.verified !== true) {
          throw new Error(data.message || 'Este UID no pudo verificarse.');
        }
      }
      result.className = 'verify-result ok';
      result.replaceChildren();
      const name = document.createElement('strong');
      name.textContent = data.player.nickname ? 'Jugador: ' + data.player.nickname : 'Nombre del jugador no disponible';
      const details = document.createElement('div');
      details.textContent = 'UID: ' + data.player.uid;
      result.append(name, details);
      playerSession = {
        uid,
        nickname: data.player.nickname || 'Cuenta validada',
        region
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

  const editableCopy = {
  "verifyTitle": ".verify-card-head h2",
  "catalogHeading": "#catalog-heading",
  "catalogDescription": "#catalog-description",
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
    ['inicio', $('#inicio')], ['beneficios', $('.features-bar')], ['recargas', $('.recharge-area')]
  ]);

  function renderLayout(layout) {
    for (const old of mainContent.querySelectorAll('[data-builder-block]')) old.remove();
    for (const block of layout) {
      const core = coreSections.get(block.id);
      if (core) {
        core.hidden = !block.visible;
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
      .then(data => {
        storeWhatsApp = data?.settings?.payment?.whatsapp || '';
        storeYapeQr = data?.settings?.payment?.qr || '';
        storeYapeNumber = data?.settings?.payment?.yapeNumber || '';
        if (data?.revision > 0) applyStoreSettings(data.settings);
      }).catch(() => {});
  }
  setupUidTurnstile();
})();