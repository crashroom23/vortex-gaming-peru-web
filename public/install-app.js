(() => {
  const button = document.getElementById('install-app');
  const guide = document.getElementById('install-guide');
  let installPrompt;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.hidden = true;
  });

  button.addEventListener('click', async () => {
    if (!installPrompt) {
      guide.showModal();
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
    } catch {
      guide.showModal();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/app-worker.js').catch(() => {
      // The storefront and the browser's installation instructions remain available.
    });
  }
})();
