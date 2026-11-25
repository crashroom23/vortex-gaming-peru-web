(() => {
  const content = document.querySelector('#accounts-content');
  const status = document.querySelector('#accounts-status');
  const heading = document.querySelector('#accounts-heading');
  const back = document.querySelector('#accounts-back');
  const accountId = new URLSearchParams(location.search).get('id');
  const currency = new Intl.NumberFormat('es-PE', {style: 'currency', currency: 'PEN'});

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function readJson(path) {
    const response = await fetch(path, {cache: 'no-cache'});
    if (!response.ok) throw new Error('No se pudo cargar ' + path);
    return response.json();
  }

  // Each listing has an id, title, description, priceCents and local images under /images/.
  function validListing(listing) {
    return listing && typeof listing.id === 'string' && /^[A-Za-z0-9-]+$/.test(listing.id) &&
      typeof listing.title === 'string' && listing.title.trim() &&
      typeof listing.description === 'string' && listing.description.trim() &&
      Number.isSafeInteger(listing.priceCents) && listing.priceCents > 0 &&
      Array.isArray(listing.images) && listing.images.length > 0 &&
      listing.images.every(path => typeof path === 'string' &&
        /^\/images\/(?:[\w-]+\/)*[\w.-]+\.(?:jpe?g|png|webp|avif)$/i.test(path));
  }

  function image(path, alt) {
    const photo = element('img');
    photo.src = path;
    photo.alt = alt;
    photo.loading = 'lazy';
    return photo;
  }

  function renderCatalog(listings) {
    if (!listings.length) {
      status.textContent = 'Por el momento no hay cuentas publicadas.';
      return;
    }

    const grid = element('div', 'accounts-grid');
    for (const listing of listings) {
      const card = element('a', 'accounts-card');
      card.href = '/cuentas?id=' + encodeURIComponent(listing.id);
      const info = element('div', 'accounts-card-info');
      info.append(
        element('h2', '', listing.title),
        element('p', '', listing.description),
        element('span', 'accounts-card-link', 'Ver detalles →')
      );
      card.append(image(listing.images[0], 'Vista previa de ' + listing.title), info);
      grid.append(card);
    }
    content.append(grid);
  }

  async function renderDetail(listing) {
    heading.textContent = listing.title;
    document.title = listing.title + ' | VortexGamer';
    const gallery = element('div', 'accounts-gallery');
    listing.images.forEach((path, index) => {
      const caption = 'Imagen ' + (index + 1) + ' de ' + listing.title;
      const preview = element('a');
      preview.href = path;
      preview.target = '_blank';
      preview.rel = 'noopener';
      preview.setAttribute('aria-label', caption + ' en tamaño completo (pestaña nueva)');
      preview.append(image(path, caption));
      gallery.append(preview);
    });

    const details = element('div', 'accounts-details');
    const price = currency.format(listing.priceCents / 100);
    const actions = element('div', 'accounts-actions');
    const contact = element('p', 'accounts-contact', 'Cargando contacto de WhatsApp…');
    contact.setAttribute('role', 'status');
    details.append(
      element('p', 'accounts-reference', 'Código ' + listing.id),
      element('p', 'accounts-description', listing.description),
      element('p', 'accounts-price', price),
      actions, contact
    );
    content.append(gallery, details);

    try {
      const {settings} = await readJson('/api/site-settings');
      const whatsapp = settings?.payment?.whatsapp;
      if (typeof whatsapp !== 'string' || !/^[1-9]\d{7,14}$/.test(whatsapp)) {
        throw new Error('WhatsApp no configurado');
      }

      const reference = listing.title + ' (' + listing.id + ') por ' + price;
      const requests = [
        ['Pagar por WhatsApp', 'accounts-action-primary', 'Hola, quiero pagar la cuenta ' + reference + '. ¿Me envías los datos de pago?'],
        ['Solicitar información', '', 'Hola, quisiera más información sobre la cuenta ' + reference + '.']
      ];
      for (const [label, className, message] of requests) {
        const link = element('a', className, label);
        link.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(message);
        link.target = '_blank';
        link.rel = 'noopener';
        actions.append(link);
      }
      contact.hidden = true;
    } catch {
      contact.textContent = 'El contacto por WhatsApp no está disponible en este momento.';
    }
  }

  back.hidden = accountId === null;
  readJson('/cuentas.json').then(listings => {
    if (!Array.isArray(listings)) throw new Error('Catálogo inválido');
    const published = listings.filter(validListing);
    status.textContent = '';
    if (accountId === null) {
      renderCatalog(published);
      return;
    }

    const listing = published.find(item => item.id === accountId);
    if (listing) return renderDetail(listing);
    status.textContent = 'Esta cuenta ya no está disponible en el catálogo.';
  }).catch(() => {
    status.textContent = 'No pudimos cargar el catálogo. Vuelve a intentarlo en unos minutos.';
  });
})();
