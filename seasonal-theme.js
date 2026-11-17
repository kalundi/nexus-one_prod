/* Nexus Medical Transit — Christmas theme.
   Active through December 31, 2026 (America/New_York). Self-disables after:
   outside the window this script does nothing at all. */
(function () {
  'use strict';

  var START = Date.parse('2026-11-01T00:00:00-04:00');
  var END = Date.parse('2027-01-01T00:00:00-05:00'); // midnight ET, Jan 1 2027
  var now = Date.now();
  if (now < START || now >= END) return;

  var path = window.location.pathname.toLowerCase();
  var page = path.split('/').pop();
  var APP_PAGES = ['booking-app.html', 'patient.html', 'driver-app.html', 'dispatch.html', 'driveflex-dispatch.html', 'livecare.html', 'livecare-demo.html', 'facility.html', 'facility-demo.html', 'admin.html', 'admin-maintenance.html', 'billing.html', 'qa.html', 'enterprise.html', 'operations.html', 'executive.html', 'ai-operations.html', 'keymark.html', 'fleet.html', 'training.html', 'caretaker.html', 'secure-documents.html', 'set-password.html', 'nex-insights.html', 'apps.html'];
  var isAppPage = APP_PAGES.indexOf(page) !== -1;
  var isPatientFacing = /booking-app|patient|caretaker/.test(page);
  var isStaffApp = isAppPage && !isPatientFacing;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    document.documentElement.classList.add('xmas-on');

    if (!document.querySelector('link[href*="seasonal-theme.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/seasonal-theme.css?v=6';
      document.head.appendChild(link);
    }

    var bannerDone = false;
    function addBanner() {
      if (bannerDone) return;

      // App pages get the slim Classic Garland greeting strip instead of
      // the marketing banner, and no footer note. The strip goes at the
      // very top of the body: several apps show a login view first and
      // their <header> only appears after sign-in, so anchoring to the
      // header would hide the strip exactly where patients land.
      if (isAppPage) {
        bannerDone = true;
        document.documentElement.classList.add('xmas-app');
        if (!document.querySelector('.xmas-app-strip')) {
          var strip = document.createElement('div');
          strip.className = 'xmas-app-strip';
          strip.setAttribute('role', 'note');
          strip.textContent = isPatientFacing
            ? '\uD83C\uDF84 Home for the Holidays \u2014 We\u2019ll Get You There'
            : '\uD83C\uDF84 Happy Holidays from Nexus Medical Transit';
          document.body.insertBefore(strip, document.body.firstChild);
        }
        return;
      }

      var header = document.querySelector('header');
      if (!header) return;
      bannerDone = true;

      var dismissed = false;
      try { dismissed = sessionStorage.getItem('xmasBannerOff') === '1'; } catch (e) {}
      if (!dismissed && !document.querySelector('.xmas-banner')) {
        var banner = document.createElement('div');
        banner.className = 'xmas-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Holiday message');
        banner.innerHTML =
          '<p class="xmas-banner-text">' +
          '<span class="xmas-banner-title">\uD83C\uDF84 Home for the Holidays \u2014 We\u2019ll Get You There</span>' +
          '<span class="xmas-banner-sub">Christmas-week dialysis, hospital discharges &amp; family visits fill fast \u2014 book early: ' +
          '<a href="tel:+18886395766">(888) 639-5766</a> \u00B7 <a href="https://mynexusride.com">mynexusride.com</a></span>' +
          '</p>' +
          '<button type="button" class="xmas-banner-close" aria-label="Dismiss holiday message">\u00D7</button>';
        header.parentNode.insertBefore(banner, header);
        banner.querySelector('.xmas-banner-close').addEventListener('click', function () {
          banner.remove();
          try { sessionStorage.setItem('xmasBannerOff', '1'); } catch (e) {}
        });
      }

      var footer = document.querySelector('footer');
      if (footer && !footer.querySelector('.xmas-footer-note')) {
        var note = document.createElement('p');
        note.className = 'xmas-footer-note';
        note.textContent = '\uD83C\uDF84 Merry Christmas & Happy Holidays from all of us at Nexus Medical Transit \u2014 thank you for trusting us with your care.';
        footer.appendChild(note);
      }
    }

    addBanner();
    if (!bannerDone) {
      // Some pages render their header after DOMContentLoaded; watch briefly.
      var observer = new MutationObserver(function () {
        addBanner();
        if (bannerDone) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); }, 6000);
    }

    // Gentle snowfall — skipped on staff working screens and for
    // reduced-motion users. Decorative only; never intercepts clicks.
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isStaffApp || reduceMotion) return;

    var canvas = document.createElement('canvas');
    canvas.id = 'xmas-snow';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var flakes = [];
    var W = 0;
    var H = 0;
    var raf = null;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      var count = Math.min(110, Math.floor(W / 14));
      flakes = [];
      for (var i = 0; i < count; i++) {
        flakes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.8 + Math.random() * 2.2,
          s: 0.35 + Math.random() * 0.9,
          drift: Math.random() * Math.PI * 2,
          driftSpeed: 0.004 + Math.random() * 0.012,
          o: 0.35 + Math.random() * 0.5
        });
      }
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#c9ddef';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.s;
        f.drift += f.driftSpeed;
        f.x += Math.sin(f.drift) * 0.5;
        if (f.y > H + 4) { f.y = -4; f.x = Math.random() * W; }
        if (f.x > W + 4) f.x = -4; else if (f.x < -4) f.x = W + 4;
        ctx.globalAlpha = f.o;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener('resize', resize);
    tick();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      } else if (!raf) {
        tick();
      }
    });
  });
})();
