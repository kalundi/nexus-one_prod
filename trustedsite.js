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

    if (document.documentElement.dataset.nexusAccessDelegated === '1') return;
    document.documentElement.dataset.nexusAccessDelegated = '1';

    var pinnedOpen = false;
    var internalToggle = false;

    function getToggle() {
      return document.querySelector('.accessButton, #accessToggle, [aria-controls="accessibility-options"], [aria-controls="accessPanel"]');
    }

    function getPanel(toggle) {
      var t = toggle || getToggle();
      if (!t) return null;
      var controls = String(t.getAttribute('aria-controls') || '').trim();
      if (controls) {
        var byId = document.getElementById(controls);
        if (byId) return byId;
      }
      return document.querySelector('#accessibility-options, #accessPanel, .accessPanel, [role="region"][aria-label*="Accessibility"]');
    }

    function isOpen(toggle, panel) {
      var t = toggle || getToggle();
      if (!t) return false;
      if (String(t.getAttribute('aria-expanded') || '').toLowerCase() === 'true') return true;
      var p = panel || getPanel(t);
      if (!p || p.hidden) return false;
      return window.getComputedStyle(p).display !== 'none';
    }

    function openPanel() {
      var t = getToggle();
      if (!t || isOpen(t)) return;
      internalToggle = true;
      t.click();
      internalToggle = false;
      var p = getPanel(t);
      if (p) {
        p.hidden = false;
        p.style.display = '';
      }
    }

    function closePanel() {
      var t = getToggle();
      if (!t) return;
      var p = getPanel(t);
      if (isOpen(t, p)) {
        internalToggle = true;
        t.click();
        internalToggle = false;
      }
      p = getPanel(t);
      if (p) {
        p.hidden = true;
        p.style.display = 'none';
      }
      t.setAttribute('aria-expanded', 'false');
    }

    function scheduleCloseIfNotHovered() {
      window.setTimeout(function () {
        if (pinnedOpen) return;
        var t = getToggle();
        if (!t) return;
        var p = getPanel(t);
        var hoveringToggle = t.matches(':hover');
        var hoveringPanel = p ? p.matches(':hover') : false;
        if (!hoveringToggle && !hoveringPanel) closePanel();
      }, 140);
    }

    document.addEventListener('mouseover', function (event) {
      var t = getToggle();
      if (!t) return;
      var p = getPanel(t);
      var overToggle = t.contains(event.target);
      var overPanel = p ? p.contains(event.target) : false;
      if (overToggle || overPanel) {
        if (!isOpen(t, p)) openPanel();
      }
    });

    document.addEventListener('mouseout', function (event) {
      var t = getToggle();
      if (!t) return;
      var p = getPanel(t);
      if (!p) return;
      var fromInside = t.contains(event.target) || p.contains(event.target);
      if (fromInside) scheduleCloseIfNotHovered();
    });

    document.addEventListener('focusin', function (event) {
      var t = getToggle();
      if (!t) return;
      var p = getPanel(t);
      if (t.contains(event.target) || (p && p.contains(event.target))) openPanel();
    });

    document.addEventListener('click', function (event) {
      var t = getToggle();
      if (!t) return;
      var p = getPanel(t);
      var onToggle = t.contains(event.target);
      var onPanel = p ? p.contains(event.target) : false;
      if (onToggle) {
        if (internalToggle) return;
        window.setTimeout(function () {
          var nowOpen = isOpen(t, getPanel(t));
          pinnedOpen = nowOpen;
          var panelNow = getPanel(t);
          if (panelNow && nowOpen) panelNow.style.display = '';
        }, 0);
        return;
      }
      if (onPanel) return;
      pinnedOpen = false;
      closePanel();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      pinnedOpen = false;
      closePanel();
    });

    window.setTimeout(closePanel, 0);
    window.setTimeout(closePanel, 500);

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceAccessibilityWidgetPresentation, { once: true });
  } else {
    enforceAccessibilityWidgetPresentation();
  }
})();
