/* Nexus language switcher: native English, Spanish and French dictionaries.
 * No third-party Google widget is needed; NexusI18n persists selections.
 */(function () {
  'use strict';

  var LANGS = [
    { code: 'en', short: 'EN', name: 'English', aria: 'English' },
    { code: 'es', short: 'ES', name: 'Español', aria: 'Español (Spanish)' },
    { code: 'fr', short: 'FR', name: 'Français', aria: 'Français (French)' }
  ];

  function getSelectedLanguage() {
    var selected = '';
    try {
      selected = window.NexusI18n && typeof window.NexusI18n.getLocale === 'function'
        ? window.NexusI18n.getLocale() : localStorage.getItem('nexusLocale');
    } catch (e) { /* Storage can be unavailable in private mode. */ }
    return selected === 'es' || selected === 'fr' ? selected : 'en';
  }
  var current = getSelectedLanguage();

  function langByCode(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  /* --- Hide legacy dictionary selectors (header, footer, anywhere) ---
     CSS in language-switcher.css does the persistent work; this adds
     inline hiding as a second layer for instances the bundle or
     platform.js re-create after load. The elements stay in the DOM:
     platform.js and the homepage bundle look for them. */
  function hideLegacyIn(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.nexusLanguageControl, .headerLanguage, .headerLanguageGlobal')
      .forEach(function (el) {
        if (el.closest && el.closest('.nexusLangSwitch')) return;
        if (!el.querySelector || !el.querySelector('[data-nexus-language]')) return;
        if (!el.classList.contains('nexusLangLegacyHidden')) {
          el.classList.add('nexusLangLegacyHidden');
        }
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
      });
  }

  /* --- Custom control: desktop pill + mobile toggle/menu --- */
  function buildControl() {
    var wrap = document.createElement('div');
    wrap.className = 'nexusLangSwitch notranslate';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language');
    wrap.setAttribute('translate', 'no');

    var caption = document.createElement('span');
    caption.className = 'nexusLangSwitchCaption';
    caption.textContent = 'Language';
    wrap.appendChild(caption);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nexusLangToggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    var toggleCode = document.createElement('span');
    toggleCode.className = 'nexusLangToggleCode';
    toggleCode.textContent = langByCode(current).short;
    toggle.appendChild(toggleCode);
    var caret = document.createElement('span');
    caret.className = 'nexusLangToggleCaret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    toggle.appendChild(caret);
    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenuOpen(wrap, !wrap.classList.contains('open'));
    });
    wrap.appendChild(toggle);

    var menu = document.createElement('div');
    menu.className = 'nexusLangMenu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', 'Choose language');
    LANGS.forEach(function (lang) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nexusLangBtn';
      btn.dataset.lang = lang.code;
      btn.setAttribute('aria-label', lang.aria);
      btn.setAttribute('aria-pressed', lang.code === current ? 'true' : 'false');
      var code = document.createElement('span');
      code.className = 'nexusLangBtnCode';
      code.textContent = lang.short;
      btn.appendChild(code);
      var name = document.createElement('span');
      name.className = 'nexusLangBtnName';
      name.textContent = lang.name;
      btn.appendChild(name);
      btn.addEventListener('click', function () { setLanguage(lang.code); });
      menu.appendChild(btn);
    });
    wrap.appendChild(menu);
    updateToggle(wrap);
    return wrap;
  }

  function updateToggle(wrap) {
    var lang = langByCode(current);
    var code = wrap.querySelector('.nexusLangToggleCode');
    if (code) code.textContent = lang.short;
    var toggle = wrap.querySelector('.nexusLangToggle');
    if (toggle) toggle.setAttribute('aria-label', 'Language: ' + lang.name + '. Choose language');
  }

  function setMenuOpen(wrap, open) {
    wrap.classList.toggle('open', open);
    var toggle = wrap.querySelector('.nexusLangToggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeMenus() {
    document.querySelectorAll('.nexusLangSwitch.open').forEach(function (wrap) {
      setMenuOpen(wrap, false);
    });
  }

  function refreshState() {
    document.querySelectorAll('.nexusLangSwitch').forEach(function (wrap) {
      updateToggle(wrap);
      wrap.querySelectorAll('.nexusLangBtn').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.dataset.lang === current ? 'true' : 'false');
      });
    });
  }

  function placeControl() {
    var header = document.querySelector('header');
    if (!header) return false;
    if (header.querySelector('.nexusLangSwitch')) { refreshState(); return true; }
    var control = buildControl();
    var legacy = header.querySelector('[data-nexus-language]');
    var label = legacy && (legacy.closest('.nexusLanguageControl, .headerLanguage, .headerLanguageGlobal') || legacy.parentElement);
    if (label && label.parentNode) {
      label.parentNode.insertBefore(control, label.nextSibling);
    } else {
      var host = header.querySelector('.globalActions, .navRight, .nexusSharedActions') ||
                 header.querySelector('.globalNav, .nav, .shell') || header;
      host.appendChild(control);
    }
    refreshState();
    return true;
  }

  function showTranslationError() {
    var error = document.querySelector('.nexusLangError');
    if (!error) {
      error = document.createElement('span');
      error.className = 'nexusLangError';
      error.setAttribute('role', 'alert');
      var switcher = document.querySelector('.nexusLangSwitch');
      if (switcher) switcher.appendChild(error);
    }
    if (error) error.textContent = 'Translation unavailable. Please refresh this page.';
  }

  function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'es' && lang !== 'fr') return;
    var next = lang === 'en' ? 'en-US' : lang;
    var translator = window.NexusI18n;
    if (!translator || typeof translator.setLocale !== 'function') {
      showTranslationError();
      return;
    }
    try {
      translator.setLocale(next);
      if (typeof translator.getLocale === 'function' && translator.getLocale() !== next) {
        showTranslationError();
        return;
      }
    } catch (e) {
      showTranslationError();
      return;
    }
    current = lang;
    document.querySelectorAll('.nexusLangError').forEach(function (el) { el.textContent = ''; });
    refreshState();
    closeMenus();
  }

  /* --- Sweep: keep the legacy control hidden and ours in place, even
     when the header/footer are re-rendered after load. --- */
  var sweepQueued = false;
  function sweep() {
    sweepQueued = false;
    var header = document.querySelector('header');
    if (header) {
      hideLegacyIn(header);
      if (!header.querySelector('.nexusLangSwitch')) placeControl();
    }
    var footer = document.querySelector('footer');
    if (footer) hideLegacyIn(footer);
  }
  function queueSweep() {
    if (sweepQueued) return;
    sweepQueued = true;
    if (window.requestAnimationFrame) requestAnimationFrame(sweep);
    else setTimeout(sweep, 50);
  }

  /* --- Boot --- */
  function boot() {
    sweep();
    window.addEventListener('nexus:localechange', function () {
      current = getSelectedLanguage();
      refreshState();
    });
    document.addEventListener('click', function (event) {
      if (!event.target.closest || !event.target.closest('.nexusLangSwitch')) closeMenus();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenus();
    });
    var observer = new MutationObserver(queueSweep);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
