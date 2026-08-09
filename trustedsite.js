(function () {
  'use strict';
  var SRC = 'https://cdn.ywxi.net/js/1.js';
  if (document.querySelector('script[src="' + SRC + '"]')) return;
  var script = document.createElement('script');
  script.src = SRC;
  script.async = true;
  script.defer = true;
  script.crossOrigin = 'anonymous';
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  script.dataset.nexusTrustedsite = 'true';
  script.addEventListener('load', function () {
    document.documentElement.dataset.trustedsite = 'loaded';
  });
  script.addEventListener('error', function () {
    document.documentElement.dataset.trustedsite = 'unavailable';
    console.warn('TrustedSite trustmark could not load. It may require the verified production domain or may be blocked by a privacy extension.');
  });
  document.head.appendChild(script);

  function enforceAccessibilityWidgetPresentation() {
    if (!document.head) return;
    if (!document.getElementById('nexus-accessibility-worldclass-style')) {
      var style = document.createElement('style');
      style.id = 'nexus-accessibility-worldclass-style';
      style.textContent = ''
        + '.accessButton,#accessToggle{position:fixed!important;right:18px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;z-index:152!important;}'
        + '.accessPanel,#accessPanel,#accessibility-options{position:fixed!important;right:82px!important;top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;z-index:151!important;}'
        + '.accessPanel button,#accessPanel button,#accessibility-options button{font:800 13px/1.2 Manrope,"Source Sans 3","Segoe UI",sans-serif!important;letter-spacing:.02em!important;text-transform:uppercase!important;border-radius:11px!important;}';
      document.head.appendChild(style);
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceAccessibilityWidgetPresentation, { once: true });
  } else {
    enforceAccessibilityWidgetPresentation();
  }
})();
