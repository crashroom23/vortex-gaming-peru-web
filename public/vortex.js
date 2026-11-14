(() => {
  'use strict';

  const PRODUCTS = [
    { id: 100, amount: '100', bonus: '10', price: 3.50, category: 'starter', tag: 'BONUS +10', type: 'PACK INICIAL' },
    { id: 310, amount: '310', bonus: '31', price: 9.80, category: 'starter', tag: 'BONUS +31', type: 'PACK POPULAR' },
    { id: 520, amount: '520', bonus: '52', price: 15.00, category: 'starter', tag: 'BONUS +52', type: 'PACK AVANZADO' },
    { id: 1060, amount: '1,060', bonus: '106', price: 27.00, category: 'premium', tag: 'PACK PRO', type: 'PACK ÉLITE' },
    { id: 2180, amount: '2,180', bonus: '218', price: 52.00, category: 'premium', tag: 'PACK PRO', type: 'PACK LEGENDARIO' },
    { id: 5600, amount: '5,600', bonus: '560', price: 130.00, category: 'premium', tag: 'MAX PACK', type: 'PACK MÁXIMO' }
  ];
  const byId = new Map(PRODUCTS.map(product => [product.id, product]));
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
  let currentFilter = 'all';
  let query = '';
  let activeLayer = null;
  let lastFocus = null;
  let toastTimer;
  let playerSession = null;
  let checkoutProduct = null;
  let selectedPaymentMethod = 'yape';

  const gemSVG = '<svg class="card-gem" viewBox="0 0 240 185" aria-hidden="true"><use href="#diamond-graphic"></use></svg>';
  const miniGemSVG = '<svg viewBox="0 0 240 185" aria-hidden="true"><use href="#diamond-graphic"></use></svg>';
  const arrowSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-arrow"></use></svg>';
  const heartSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-heart"></use></svg>';

  function cardMarkup(product) {
    const saved = favorites.has(product.id);
    const isPro = product.category === 'premium';
    return [
      '<article class="product-card', isPro ? ' featured' : '', '">',
      '<div class="card-media">',
      '<span class="card-badge', isPro ? ' premium' : '', '">', product.tag, '</span>',
      '<button type="button" class="favorite-btn', saved ? ' saved' : '', '" data-action="favorite" data-id="', product.id, '" aria-label="', saved ? 'Quitar de' : 'Añadir a', ' favoritos: ', product.amount, ' diamantes" aria-pressed="', saved, '">', heartSVG, '</button>',
      gemSVG,
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

  function filteredProducts() {
    const text = query.trim().toLowerCase();
    return PRODUCTS.filter(product => {
      const categoryMatches = currentFilter === 'all'
        || (currentFilter === 'favorites' ? favorites.has(product.id) : product.category === currentFilter);
      const searchable = (product.amount + ' ' + product.id + ' ' + product.bonus + ' ' + product.type + ' ' + price(product.price)).toLowerCase();
      return categoryMatches && (!text || searchable.includes(text) || searchable.replaceAll(',', '').includes(text.replaceAll(',', '')));
    });
  }

  function renderProducts() {
    const filtered = filteredProducts();
    $('#products-grid').innerHTML = filtered.map(cardMarkup).join('');
    $('#empty-state').hidden = filtered.length > 0;
    $$('.tab').forEach(button => {
      const selected = button.dataset.filter === currentFilter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
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
    const entries = Object.entries(cart).map(([id, quantity]) => ({ product: byId.get(Number(id)), quantity })).filter(x => x.product && x.quantity > 0);
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
    const products = PRODUCTS.filter(product => favorites.has(product.id));
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
      $('#payment-name').textContent = 'Yape automático';
      $('#payment-description').textContent = 'Cuando conectemos una pasarela compatible, mostrará un QR dinámico o el formulario seguro de Yape. Un QR personal no puede confirmar el pago automáticamente.';
      $('#payment-notice').textContent = checkoutProduct && checkoutProduct.price < 6
        ? 'Nota: el QR de billeteras móviles de Culqi tiene mínimo S/ 6.00. Para este paquete se evaluará Yape con código de aprobación u otra integración compatible.'
        : 'El QR dinámico de Yape aparecerá solo después de habilitar y probar la pasarela. No envíes dinero desde esta pantalla.';
    } else {
      $('#payment-name').textContent = 'Binance Pay';
      $('#payment-description').textContent = 'Binance Pay genera un QR o enlace único desde la API Merchant. La conversión a criptomonedas y el importe definitivo se mostrarán únicamente cuando exista una orden real.';
      $('#payment-notice').textContent = 'Se necesita una cuenta Binance Pay Merchant habilitada, su API y confirmación verificada del pago.';
    }
  }

  function requestCheckout(id) {
    const product = byId.get(id);
    if (!product) return;
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
    $('#checkout-package').textContent = product.amount + ' + ' + product.bonus + ' diamantes';
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
        case 'pay': requestCheckout(id); break;
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

  $('#cart-trigger').addEventListener('click', () => openLayer('cart-panel'));
  $$('.payment-tab').forEach(button => button.addEventListener('click', () => setPaymentMethod(button.dataset.method)));
  $('#simulate-verify').addEventListener('click', () => {
    const uidInput = $('#uid');
    const uid = uidInput.value.trim() || '123456789';
    if (!/^\d{5,15}$/.test(uid)) {
      notify('Para probar, introduce un UID de 5 a 15 dígitos.');
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
  $$('.tab').forEach(button => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    renderProducts();
  }));
  $('#catalog-search').addEventListener('input', event => {
    query = event.target.value;
    renderProducts();
  });
  $('#reset-search').addEventListener('click', () => {
    currentFilter = 'all';
    query = '';
    $('#catalog-search').value = '';
    renderProducts();
  });
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
    if (event.key === '/' && !activeLayer && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      $('#catalog-search').focus();
    }
  });

  const verifyForm = $('#verify-form');
  verifyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const uid = $('#uid').value.trim();
    const region = 'br';
    const result = $('#verify-result');
    if (!/^\d{5,15}$/.test(uid)) {
      result.hidden = false;
      result.className = 'verify-result error';
      result.textContent = 'Escribe un UID válido de 5 a 15 dígitos.';
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
      const response = await fetch('/api/freefire/verify?' + new URLSearchParams({ uid, region }).toString(), { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'No fue posible verificar el UID.');
      result.className = 'verify-result ok';
      result.replaceChildren();
      const name = document.createElement('strong');
      name.textContent = data.player.nickname;
      const details = document.createElement('div');
      details.textContent = 'UID: ' + data.player.uid + ' · Región de tienda: Sur LATAM (consulta BR/LATAM)' + (data.player.level == null ? '' : ' · Nivel: ' + data.player.level);
      result.append(name, details);
      playerSession = {
        uid,
        nickname: String(data.player.nickname),
        region,
        demo: false
      };
      const status = $('#verified-status');
      status.hidden = false;
      status.className = 'verified-status is-verified';
      status.textContent = '✓ UID VERIFICADO · YA PUEDES ELEGIR TU PAQUETE';
      notify('Jugador verificado. Ahora elige tus diamantes y pulsa Pagar.');
      $('#tienda').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      playerSession = null;
      $('#verified-status').hidden = true;
      result.className = 'verify-result error';
      result.textContent = error.message || 'No fue posible contactar al proveedor.';
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });

  $('#year').textContent = new Date().getFullYear();
  refresh();
})();