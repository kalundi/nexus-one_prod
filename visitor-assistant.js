/* Nexus Medical Transit — visitor assistant widget (visitor-qa-bot).
 *
 * Public-page chat widget. Answers come from the visitor-assistant
 * Netlify function, which answers only from the website knowledge base.
 * The widget stores nothing: conversation lives in page memory only.
 * Loaded on public pages by the delimited loader block at the end of
 * platform.js; never on staff/back-office surfaces.
 */
(function () {
  'use strict';
  if (window.__nexusVisitorAssistant) return;
  window.__nexusVisitorAssistant = true;

  var ENDPOINT = '/.netlify/functions/visitor-assistant';
  var BOOKING_URL = 'https://mynexusride.com';
  var MAIN_PHONE = '(888) 639-5766';
  var MAIN_PHONE_HREF = 'tel:+18886395766';

  var CSS = [
    '.nvaBtn{position:fixed;right:20px;bottom:20px;z-index:140;display:inline-flex;align-items:center;gap:9px;min-height:54px;padding:12px 20px;border:0;border-radius:999px;background:#082f49;color:#fff;font:800 16px Manrope,"Source Sans 3",sans-serif;cursor:pointer;box-shadow:0 14px 34px rgba(8,47,73,.35)}',
    '.nvaBtn:hover{background:#0d365b}',
    '.nvaBtn svg{flex:none}',
    '.nvaPanel{position:fixed;right:20px;bottom:86px;z-index:140;width:min(384px,calc(100vw - 32px));height:min(580px,calc(100dvh - 116px));display:none;flex-direction:column;background:#fff;border:1px solid #d7e2e9;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(8,47,73,.30);font:16px/1.5 "Source Sans 3","Segoe UI",sans-serif;color:#12212e}',
    '.nvaPanel.open{display:flex}',
    '.nvaHead{position:relative;background:linear-gradient(126deg,#071f37 0%,#0d365b 56%,#0e5c8c 100%);color:#fff;padding:16px 54px 13px 18px}',
    '.nvaHead h2{margin:0;font:800 18px/1.25 Manrope,sans-serif}',
    '.nvaHead p{margin:4px 0 0;color:#cfe3ee;font-size:13.5px}',
    '.nvaHead p strong{color:#fff}',
    '.nvaClose{position:absolute;top:10px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:19px;cursor:pointer}',
    '.nvaLog{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6fafc}',
    '.nvaMsg{max-width:88%;padding:11px 13px;border-radius:15px;white-space:pre-wrap;word-wrap:break-word}',
    '.nvaMsg.bot{align-self:flex-start;background:#eef6fb;border:1px solid #d7e6f0;border-bottom-left-radius:5px}',
    '.nvaMsg.user{align-self:flex-end;background:#082f49;color:#fff;border-bottom-right-radius:5px}',
    '.nvaMsg a{color:#0e5c8c;font-weight:700}',
    '.nvaMsg.user a{color:#9de7ec}',
    '.nvaChips{display:flex;flex-wrap:wrap;gap:7px;padding:10px 14px 2px;background:#f6fafc}',
    '.nvaChip{border:1px solid #b9cfdd;background:#fff;color:#082f49;border-radius:999px;padding:7px 12px;font:700 13.5px Manrope,sans-serif;cursor:pointer}',
    '.nvaChip:hover{border-color:#082f49}',
    '.nvaCtas{display:flex;gap:8px;padding:10px 14px;background:#fff;border-top:1px solid #e3edf3}',
    '.nvaBook{flex:1;text-align:center;text-decoration:none;min-height:46px;padding:11px 10px;border-radius:12px;background:linear-gradient(135deg,#db2839,#b91c2c);color:#fff!important;font:800 15.5px Manrope,sans-serif;box-shadow:0 10px 24px rgba(219,40,57,.22)}',
    '.nvaCall{flex:1;text-align:center;text-decoration:none;min-height:46px;padding:11px 10px;border-radius:12px;background:#fff;color:#082f49!important;border:1px solid #b9cfdd;font:800 15.5px Manrope,sans-serif}',
    '.nvaForm{display:flex;gap:8px;padding:10px 14px 14px;background:#fff}',
    '.nvaInput{flex:1;min-height:46px;border:1px solid #aebfcb;border-radius:11px;padding:11px 13px;font:inherit}',
    '.nvaSend{min-height:46px;border:0;border-radius:11px;padding:11px 17px;background:#082f49;color:#fff;font:800 15.5px Manrope,sans-serif;cursor:pointer}',
    '.nvaSend:disabled{opacity:.55;cursor:wait}',
    '.nvaNote{padding:0 14px 10px;background:#fff;color:#52677a;font-size:12.5px}',
    '@media (max-width:640px){.nvaBtn{right:14px;bottom:14px}.nvaPanel{right:8px;left:8px;width:auto;bottom:80px;height:min(72dvh,580px)}}',
    '@media (prefers-reduced-motion:reduce){.nvaPanel,.nvaBtn{transition:none!important}}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'nvaStyles';
  style.textContent = CSS;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nvaBtn';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'nvaPanel');
  btn.setAttribute('aria-label', 'Open the Nexus visitor assistant chat');
  btn.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" fill="currentColor" opacity=".28"/><path d="M8 11h8M8 14.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Ask Nexus</span>';

  var panel = document.createElement('section');
  panel.className = 'nvaPanel';
  panel.id = 'nvaPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Nexus Medical Transit Virtual Assistant');
  panel.innerHTML =
    '<div class="nvaHead"><h2>Nexus Medical Transit Virtual Assistant</h2>' +
    '<p>Answers from our website. Emergencies: <strong>call 911</strong>.</p>' +
    '<button type="button" class="nvaClose" aria-label="Close chat">&times;</button></div>' +
    '<div class="nvaLog" id="nvaLog" aria-live="polite"></div>' +
    '<div class="nvaChips" id="nvaChips">' +
    ['What services do you offer?', 'What areas do you serve?', 'What are your hours?', 'How does booking work?']
      .map(function (q) { return '<button type="button" class="nvaChip">' + q + '</button>'; }).join('') +
    '</div>' +
    '<div class="nvaCtas"><a class="nvaBook" href="' + BOOKING_URL + '">Book a Ride</a>' +
    '<a class="nvaCall" href="' + MAIN_PHONE_HREF + '">Call ' + MAIN_PHONE + '</a></div>' +
    '<form class="nvaForm" id="nvaForm"><label class="sr" for="nvaInput" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Type your question</label>' +
    '<input class="nvaInput" id="nvaInput" type="text" autocomplete="off" maxlength="500" placeholder="Ask about services, areas, hours\u2026">' +
    '<button class="nvaSend" id="nvaSend" type="submit">Send</button></form>' +
    '<div class="nvaNote">I answer from the Nexus website only and don\u2019t collect personal or medical details. For trip details, please book online or call.</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var log = panel.querySelector('#nvaLog');
  var form = panel.querySelector('#nvaForm');
  var input = panel.querySelector('#nvaInput');
  var send = panel.querySelector('#nvaSend');
  var greeted = false;
  var busy = false;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderText(text) {
    var safe = escapeHtml(text);
    safe = safe.replace(/https:\/\/[^\s<]+/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url.replace('https://', '') + '</a>';
    });
    safe = safe.replace(/\(888\) 639-5766/g, '<a href="tel:+18886395766">(888) 639-5766</a>');
    safe = safe.replace(/\(888\) 760-4990/g, '<a href="tel:+18887604990">(888) 760-4990</a>');
    return safe;
  }

  function addMessage(text, who) {
    var div = document.createElement('div');
    div.className = 'nvaMsg ' + who;
    div.innerHTML = renderText(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!greeted) {
        greeted = true;
        addMessage(
          'Hello — I\u2019m the Nexus Medical Transit Virtual Assistant. I answer questions using the information on this website: our services, service areas, hours, booking, and LiveCare tracking. What would you like to know?',
          'bot'
        );
      }
      setTimeout(function () { input.focus(); }, 30);
    }
  }

  btn.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
  panel.querySelector('.nvaClose').addEventListener('click', function () { setOpen(false); btn.focus(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) { setOpen(false); btn.focus(); }
  });
  panel.querySelectorAll('.nvaChip').forEach(function (chip) {
    chip.addEventListener('click', function () { ask(chip.textContent.trim()); });
  });

  function ask(question) {
    var q = String(question || '').trim();
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    addMessage(q, 'user');
    input.value = '';
    var pending = addMessage('One moment\u2026', 'bot');
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: q })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.answer) {
          pending.innerHTML = renderText(out.data.answer);
        } else if (out.data && out.data.error) {
          pending.innerHTML = renderText(out.data.error);
        } else {
          throw new Error('bad response');
        }
      })
      .catch(function () {
        pending.innerHTML = renderText(
          'I can\u2019t reach the assistant right now. Please call us at ' + MAIN_PHONE + ' and the team will help, or book online at ' + BOOKING_URL + '.'
        );
      })
      .finally(function () {
        busy = false;
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });
})();
