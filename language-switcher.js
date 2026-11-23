/* Nexus language switcher (Google Translate, Option A) — v2.
 *
 * Public marketing pages only. Replaces the dictionary-based language
 * <select> (i18n.js) with custom EN / ES / FR controls that drive the
 * Google Translate element, so the whole page converts to the chosen
 * language. Selection persists across pages via Google's googtrans
 * cookie.
 *
 * v2 fixes (mobile):
 * - The legacy <select> is hidden persistently: a CSS rule in
 *   language-switcher.css hides any [data-nexus-language] control
 *   wherever it appears (header AND footer), and the sweep below
 *   re-hides any instance re-created later (the home page header is
 *   rendered by the site JS bundle, which can re-create its label).
 * - At mobile widths the control collapses to a single 44px toggle
 *   button showing the current language; tapping it opens a menu with
 *   all three languages. In the adaptive mobile header it takes the
 *   language grid slot (column 2) the legacy control used to occupy.
 * - The googtrans cookie is written deterministically for both the
 *   exact host and the parent domain, so www and bare-domain visits
 *   (and the alias domains) always agree on the selected language.
 *
 * The legacy i18n.js dictionary system stays loaded (apps and other
 * pages still use it), but on these pages it is pinned to en-US, where
 * its dictionary is empty and it makes no text changes, so the two
 * systems never fight over the same text nodes.
 */
(function () {
  'use strict';

  var LANGS = [
    { code: 'en', short: 'EN', name: 'English', aria: 'English' },
    { code: 'es', short: 'ES', name: 'Español', aria: 'Español (Spanish)' },
    { code: 'fr', short: 'FR', name: 'Français', aria: 'Français (French)' }
  ];

  /* --- Pin legacy dictionary i18n to en-US (inert) --- */
  try { localStorage.setItem('nexusLocale', 'en-US'); } catch (e) { /* private mode */ }
  if (window.NexusI18n && typeof window.NexusI18n.getLocale === 'function' &&
      window.NexusI18n.getLocale() !== 'en-US' &&
      typeof window.NexusI18n.setLocale === 'function') {
    try { window.NexusI18n.setLocale('en-US'); } catch (e) { /* keep page as-is */ }
  }

  /* --- Current language from the googtrans cookie --- */
  function cookieLanguage() {
    var match = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
    if (!match) return 'en';
    var parts = decodeURIComponent(match[1]).split('/');
    var target = parts[parts.length - 1];
    return (target === 'es' || target === 'fr') ? target : 'en';
  }
  var current = cookieLanguage();

  function langByCode(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  /* Write the same value for the exact host and (when applicable) the
     parent domain, so a stale domain-level cookie can never shadow the
     host-level one or vice versa. '/en/en' is Google's "no translation"
     value, so EN is written the same way rather than deleted. */
  function writeCookie(lang) {
    var value = '/en/' + lang;
    var attrs = ';path=/;max-age=31536000;SameSite=Lax';
    document.cookie = 'googtrans=' + value + attrs;
    var host = location.hostname;
    var dot = host.lastIndexOf('.', host.lastIndexOf('.') - 1);
    if (dot > 0) {
      document.cookie = 'googtrans=' + value + attrs + ';domain=.' + host.slice(dot + 1);
    }
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

  /* --- Google Translate element --- */
  function ensureHolder() {
    if (document.getElementById('google_translate_element')) return;
    var holder = document.createElement('div');
    holder.id = 'google_translate_element';
    holder.className = 'nexusGteHolder notranslate';
    holder.setAttribute('translate', 'no');
    holder.setAttribute('aria-hidden', 'true');
    document.body.appendChild(holder);
  }

  window.googleTranslateElementInit = function () {
    if (!window.google || !google.translate) return;
    new google.translate.TranslateElement({
      pageLanguage: 'en',
      includedLanguages: 'en,es,fr',
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
      autoDisplay: false
    }, 'google_translate_element');
  };

  function loadGoogleTranslate() {
    if (document.querySelector('script[src*="translate_a/element.js"]')) return;
    var script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.head.appendChild(script);
  }

  /* --- Switching --- */
  function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'es' && lang !== 'fr') return;
    current = lang;
    writeCookie(lang);
    document.documentElement.lang = lang;
    refreshState();
    closeMenus();
    var combo = document.querySelector('.goog-te-combo');
    if (combo) {
      combo.value = lang;
      combo.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      /* Google script not ready yet: the cookie alone is enough, but the
         current page only converts after a reload. */
      location.reload();
    }
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
    ensureHolder();
    sweep();
    loadGoogleTranslate();
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
