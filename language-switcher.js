/* Nexus language switcher (Google Translate, Option A).
 *
 * Public marketing pages only. Replaces the header's dictionary-based
 * language <select> with custom EN / ES / FR buttons that drive the
 * Google Translate element, so the whole page converts to the chosen
 * language. Selection persists across pages via Google's googtrans
 * cookie.
 *
 * The legacy i18n.js dictionary system stays loaded (apps and other
 * pages still use it), but on these pages it is pinned to en-US, where
 * its dictionary is empty and it makes no text changes, so the two
 * systems never fight over the same text nodes.
 */
(function () {
  'use strict';

  var LANGS = [
    { code: 'en', short: 'EN', aria: 'English' },
    { code: 'es', short: 'ES', aria: 'Español (Spanish)' },
    { code: 'fr', short: 'FR', aria: 'Français (French)' }
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

  function writeCookie(lang) {
    var value = (lang === 'en') ? '/en/en' : '/en/' + lang;
    document.cookie = 'googtrans=' + value + ';path=/';
    var host = location.hostname;
    var dot = host.lastIndexOf('.', host.lastIndexOf('.') - 1);
    if (dot > 0) {
      document.cookie = 'googtrans=' + value + ';path=/;domain=.' + host.slice(dot + 1);
    }
    if (lang === 'en') {
      var past = ';expires=Thu, 01 Jan 1970 00:00:00 GMT';
      document.cookie = 'googtrans=;path=/' + past;
      if (dot > 0) {
        document.cookie = 'googtrans=;path=/;domain=.' + host.slice(dot + 1) + past;
      }
      document.cookie = 'googtrans=/en/en;path=/';
    }
  }

  /* --- Custom control --- */
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

    LANGS.forEach(function (lang) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nexusLangBtn';
      btn.dataset.lang = lang.code;
      btn.textContent = lang.short;
      btn.setAttribute('aria-label', lang.aria);
      btn.setAttribute('aria-pressed', lang.code === current ? 'true' : 'false');
      btn.addEventListener('click', function () { setLanguage(lang.code); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function refreshPressed() {
    document.querySelectorAll('.nexusLangBtn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.lang === current ? 'true' : 'false');
    });
  }

  function hideLegacy(header) {
    header.querySelectorAll('.nexusLanguageControl, .headerLanguage').forEach(function (el) {
      if (el.querySelector && el.querySelector('[data-nexus-language]')) {
        el.classList.add('nexusLangLegacyHidden');
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function placeControl() {
    var header = document.querySelector('header');
    if (!header) return false;
    hideLegacy(header);
    if (header.querySelector('.nexusLangSwitch')) { refreshPressed(); return true; }
    var control = buildControl();
    var legacy = header.querySelector('[data-nexus-language]');
    var label = legacy && (legacy.closest('.nexusLanguageControl, .headerLanguage') || legacy.parentElement);
    if (label && label.parentNode) {
      label.parentNode.insertBefore(control, label.nextSibling);
    } else {
      var host = header.querySelector('.globalActions, .navRight, .nexusSharedActions') ||
                 header.querySelector('.globalNav, .nav, .shell') || header;
      host.appendChild(control);
    }
    refreshPressed();
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
    refreshPressed();
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

  /* --- Boot --- */
  var placing = false;
  function boot() {
    ensureHolder();
    placeControl();
    loadGoogleTranslate();
    /* Bundle-rendered headers (home page) and shared-header injection can
       add or re-render the header after load; keep the control in place. */
    var observer = new MutationObserver(function () {
      if (placing) return;
      var header = document.querySelector('header');
      if (header && !header.querySelector('.nexusLangSwitch')) {
        placing = true;
        placeControl();
        placing = false;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
