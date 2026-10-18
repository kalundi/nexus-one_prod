/* Registers the last-resort cached page for later navigation failures. */
(() => {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/nexus-service-worker.js', { scope: '/' }).catch(() => {});
  }, { once: true });
})();
