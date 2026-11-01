/* Nexus Medical Transit — visitor assistant widget ("Nex").
 *
 * Public-page chat widget. Answers come from the visitor-assistant
 * Netlify function, which answers only from the website knowledge base.
 * The widget stores nothing: conversation lives in page memory only.
 * Loaded on public pages by the delimited loader block at the end of
 * platform.js; never on staff/back-office surfaces.
 *
 * Placement: a slim edge tab on the LEFT side of the screen (Nex's
 * waiting avatar). Clicking it slides the chat panel in from the left;
 * closing (X, Escape, or the tab again) slides it back out of the way.
 * The right side of the screen belongs to the site's accessibility
 * toggle and language control, so Nex stays clear of both.
 */
(function () {
  'use strict';
  if (window.__nexusVisitorAssistant) return;
  window.__nexusVisitorAssistant = true;

  var ENDPOINT = '/.netlify/functions/visitor-assistant';
  var BOOKING_URL = 'https://mynexusride.com';
  var MAIN_PHONE = '(888) 639-5766';
  var MAIN_PHONE_HREF = 'tel:+18886395766';
  var WAITING_GIF = '/assets/nex-waiting.gif';
  var TYPING_GIF = '/assets/nex-typing.gif';
  var COST_PROMPT = 'Do you want to know what your ride would cost?';

  var CSS = [
    '.nvaTab,.nvaPanel,.nvaPanel *{box-sizing:border-box}',
    '.nvaPanel,.nvaTab{--nvaW:min(380px,calc(100vw - 70px))}',
    /* Idle edge tab: slim, vertically centered on the left edge. */
    '.nvaTab{position:fixed;left:0;top:50%;z-index:141;display:flex;flex-direction:column;align-items:center;gap:6px;width:56px;padding:12px 4px 11px;border:0;border-radius:0 16px 16px 0;background:#082f49;color:#fff;font:800 11.5px/1.2 Manrope,"Source Sans 3",sans-serif;cursor:pointer;box-shadow:6px 12px 26px rgba(8,47,73,.32);transform:translateY(-50%);transition:transform .34s cubic-bezier(.32,.72,.28,1)}',
    '.nvaTab:hover{background:#0d365b}',
    '.nvaTab.open{transform:translate(var(--nvaW),-50%)}',
    '.nvaTabAvatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#fff;flex:none}',
    '.nvaTabLabel{text-align:center;letter-spacing:.02em}',
    /* Panel: slides in from the left; message list scrolls inside. */
    '.nvaPanel{position:fixed;left:0;top:50%;z-index:140;width:var(--nvaW);height:min(640px,calc(100dvh - 32px));display:flex;flex-direction:column;background:#fff;border:1px solid #d7e2e9;border-left:0;border-radius:0 22px 22px 0;overflow:hidden;box-shadow:24px 30px 80px rgba(8,47,73,.30);font:16px/1.5 "Source Sans 3","Segoe UI",sans-serif;color:#12212e;transform:translate(-112%,-50%);visibility:hidden;pointer-events:none;transition:transform .34s cubic-bezier(.32,.72,.28,1),visibility 0s linear .34s}',
    '.nvaPanel.open{transform:translate(0,-50%);visibility:visible;pointer-events:auto;transition:transform .34s cubic-bezier(.32,.72,.28,1)}',
    '.nvaHead{position:relative;display:flex;align-items:center;gap:11px;background:linear-gradient(126deg,#071f37 0%,#0d365b 56%,#0e5c8c 100%);color:#fff;padding:14px 56px 13px 16px}',
    '.nvaAvatar{width:46px;height:46px;border-radius:50%;object-fit:cover;background:#fff;border:2px solid rgba(255,255,255,.55);flex:none}',
    '.nvaHeadText{min-width:0}',
    '.nvaHead h2{margin:0;font:800 18px/1.25 Manrope,sans-serif}',
    '.nvaHead h2 .nvaRole{font-size:12.5px;font-weight:700;color:#cfe3ee}',
    '.nvaHead p{margin:3px 0 0;color:#cfe3ee;font-size:13.5px}',
    '.nvaHead p strong{color:#fff}',
    '.nvaClose{position:absolute;top:10px;right:12px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:19px;cursor:pointer}',
    '.nvaLog{flex:1;min-height:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6fafc}',
    '.nvaMsg{max-width:88%;padding:11px 13px;border-radius:15px;white-space:pre-wrap;word-wrap:break-word}',
    '.nvaMsg.bot{align-self:flex-start;background:#eef6fb;border:1px solid #d7e6f0;border-bottom-left-radius:5px}',
    '.nvaMsg.user{align-self:flex-end;background:#082f49;color:#fff;border-bottom-right-radius:5px}',
    '.nvaMsg a{color:#0e5c8c;font-weight:700}',
    '.nvaMsg.user a{color:#9de7ec}',
    '.nvaMsg.nvaTyping{display:flex;align-items:center;gap:9px;padding:8px 12px;color:#3d5a70;font-weight:600}',
    '.nvaTypingGif{width:40px;height:40px;border-radius:12px;object-fit:cover;flex:none}',
    '.nvaChips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 4px;background:#f6fafc;max-height:136px;overflow-y:auto}',
    '.nvaChip{display:inline-flex;align-items:center;min-height:44px;border:1px solid #b9cfdd;background:#fff;color:#082f49;border-radius:999px;padding:8px 12px;font:700 13px Manrope,sans-serif;cursor:pointer}',
    '.nvaChip:hover{border-color:#082f49}',
    '.nvaCtas{display:flex;gap:8px;padding:10px 14px;background:#fff;border-top:1px solid #e3edf3}',
    '.nvaBook,.nvaCall{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;min-height:48px;padding:11px 10px;border-radius:12px;font:800 15.5px Manrope,sans-serif}',
    '.nvaBook{background:linear-gradient(135deg,#db2839,#b91c2c);color:#fff!important;box-shadow:0 10px 24px rgba(219,40,57,.22)}',
    '.nvaCall{background:#fff;color:#082f49!important;border:1px solid #b9cfdd}',
    '.nvaForm{display:flex;gap:8px;padding:10px 14px 14px;background:#fff}',
    '.nvaInput{flex:1;min-width:0;min-height:48px;border:1px solid #aebfcb;border-radius:11px;padding:11px 13px;font:inherit}',
    '.nvaSend{flex:none;min-height:48px;min-width:76px;border:0;border-radius:11px;padding:11px 17px;background:#082f49;color:#fff;font:800 15.5px Manrope,sans-serif;cursor:pointer}',
    '.nvaSend:disabled{opacity:.55;cursor:wait}',
    '.nvaNote{padding:0 14px 12px;background:#fff;color:#52677a;font-size:12.5px}',
    '@media (max-width:640px){.nvaPanel{height:min(640px,calc(100dvh - 24px))}}',
    '@media (prefers-reduced-motion:reduce){.nvaPanel,.nvaTab{transition:none!important}}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'nvaStyles';
  style.textContent = CSS;
  document.head.appendChild(style);

  var tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'nvaTab';
  tab.id = 'nvaTab';
  tab.setAttribute('aria-haspopup', 'dialog');
  tab.setAttribute('aria-expanded', 'false');
  tab.setAttribute('aria-controls', 'nvaPanel');
  tab.setAttribute('aria-label', 'Open chat with Nex, the Nexus visitor assistant');
  tab.innerHTML = '<img class="nvaTabAvatar" src="' + WAITING_GIF + '" alt="" width="36" height="36"><span class="nvaTabLabel">Ask Nex</span>';

  var panel = document.createElement('section');
  panel.className = 'nvaPanel';
  panel.id = 'nvaPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with Nex, the Nexus Medical Transit Virtual Assistant');
  panel.innerHTML =
    '<div class="nvaHead"><img class="nvaAvatar" id="nvaAvatar" src="' + WAITING_GIF + '" alt="" width="46" height="46">' +
    '<div class="nvaHeadText"><h2>Nex <span class="nvaRole">&middot; Nexus Medical Transit Virtual Assistant</span></h2>' +
    '<p>Answers from our website. Emergencies: <strong>call 911</strong>.</p></div>' +
    '<button type="button" class="nvaClose" aria-label="Close chat">&times;</button></div>' +
    '<div class="nvaLog" id="nvaLog" aria-live="polite"></div>' +
    '<div class="nvaChips" id="nvaChips">' +
    [COST_PROMPT, 'What services do you offer?', 'What areas do you serve?', 'What are your hours?', 'How does booking work?']
      .map(function (q) { return '<button type="button" class="nvaChip">' + q + '</button>'; }).join('') +
    '</div>' +
    '<div class="nvaCtas"><a class="nvaBook" href="' + BOOKING_URL + '">Book a Ride</a>' +
    '<a class="nvaCall" href="' + MAIN_PHONE_HREF + '">Call ' + MAIN_PHONE + '</a></div>' +
    '<form class="nvaForm" id="nvaForm"><label class="sr" for="nvaInput" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Type your question</label>' +
    '<input class="nvaInput" id="nvaInput" type="text" autocomplete="off" maxlength="500" placeholder="Ask about services, areas, hours\u2026">' +
    '<button class="nvaSend" id="nvaSend" type="submit">Send</button></form>' +
    '<div class="nvaNote">Nex answers from the Nexus website only and doesn\u2019t collect personal or medical details. For trip details, please book online or call.</div>';

  document.body.appendChild(tab);
  document.body.appendChild(panel);

  var log = panel.querySelector('#nvaLog');
  var form = panel.querySelector('#nvaForm');
  var input = panel.querySelector('#nvaInput');
  var send = panel.querySelector('#nvaSend');
  var headAvatar = panel.querySelector('#nvaAvatar');
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
    tab.classList.toggle('open', open);
    tab.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!greeted) {
        greeted = true;
        addMessage(
          'Hi, I\u2019m Nex \u2014 the Nexus Medical Transit Virtual Assistant. I answer questions using the information on this website: our services, service areas, hours, booking, pricing estimates and availability, and LiveCare tracking. ' + COST_PROMPT,
          'bot'
        );
        log.scrollTop = 0; // greet from the top; later messages scroll down
      }
      setTimeout(function () { input.focus(); }, 60);
    }
  }

  tab.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
  panel.querySelector('.nvaClose').addEventListener('click', function () { setOpen(false); tab.focus(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) { setOpen(false); tab.focus(); }
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
    var pending = addMessage('', 'bot');
    pending.classList.add('nvaTyping');
    pending.innerHTML = '<img class="nvaTypingGif" src="' + TYPING_GIF + '" alt="" aria-hidden="true"><span>Nex is typing\u2026</span>';
    headAvatar.src = TYPING_GIF;
    log.scrollTop = log.scrollHeight;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: q })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (out) {
        pending.classList.remove('nvaTyping');
        if (out.res.ok && out.data && out.data.answer) {
          pending.innerHTML = renderText(out.data.answer);
        } else if (out.data && out.data.error) {
          pending.innerHTML = renderText(out.data.error);
        } else {
          throw new Error('bad response');
        }
      })
      .catch(function () {
        pending.classList.remove('nvaTyping');
        pending.innerHTML = renderText(
          'I can\u2019t reach the assistant right now. Please call us at ' + MAIN_PHONE + ' and the team will help, or book online at ' + BOOKING_URL + '.'
        );
      })
      .finally(function () {
        busy = false;
        send.disabled = false;
        headAvatar.src = WAITING_GIF;
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });
})();
