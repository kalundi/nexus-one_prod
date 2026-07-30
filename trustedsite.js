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
})();
