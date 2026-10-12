// Runs on locked sites before the page paints. The network rule in background.js
// stops normal visits; this catches pages the browser shows without a new request,
// like pressing Back or switching to a tab that was left open.
(() => {
  const veil = document.createElement('style');
  veil.textContent = 'html{visibility:hidden!important}';

  async function check({ hide }) {
    if (hide) (document.documentElement || document).appendChild(veil);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'guardCheck' });
      if (res?.locked) {
        location.replace(res.lockUrl);
        return; // stay hidden while the lock screen loads
      }
    } catch {
      // The extension was reloaded or removed; nothing left to enforce.
    }
    veil.remove();
  }

  check({ hide: true });

  // Restored from the back/forward cache: the old page is back without a request.
  addEventListener('pageshow', (e) => { if (e.persisted) check({ hide: true }); });

  // Coming back to a tab that was left open after the site re-locked.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check({ hide: false });
  });
})();
