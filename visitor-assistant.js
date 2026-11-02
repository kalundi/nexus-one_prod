/* Nexus Medical Transit — visitor assistant widget ("Nex").
 *
 * Public-page chat widget. Answers come from the visitor-assistant
 * Netlify function, which answers only from the website knowledge base.
 * The widget keeps nothing: conversation lives in page memory only,
 * and addresses typed for a rough estimate are sent to the
 * visitor-estimate function for that calculation alone — never stored.
 * Loaded on public pages by the delimited loader block at the end of
 * platform.js; never on staff/back-office surfaces.
 *
 * Placement: a slim edge tab on the LEFT side of the screen (Nex's
 * waiting avatar). Clicking it slides the chat panel in from the left;
 * closing (X, Escape, or the tab again) slides it back out of the way.
 * The right side of the screen belongs to the site's accessibility
 * toggle and language control, so Nex stays clear of both.
 *
 * Rough estimates: a price question (or the cost chip) starts a short
 * guided flow — pickup, drop-off, ride type, one way / round trip,
 * pickup date and time. Road distance is measured in the browser with
 * the Google Maps Directions service, the same way the booking app
 * measures it (browser key from /api/integrations/config); pricing is
 * computed server-side by the visitor-estimate function with the
 * platform's own fare engine and Pricing Manager rates.
 *
 * Place names: pickup and drop-off entries that are not street
 * addresses ("the monument", "Costco in Germantown") are resolved
 * with the Google Places library (same browser key, biased to the
 * MD/DC/VA region) before measuring: one confident match is
 * confirmed back to the visitor ("the Washington Monument,
 * Washington, DC"), several plausible matches are offered as
 * tap-to-pick chips, and if Places finds real places but none
 * matches every word of the query — a store locals name for the
 * neighboring town, like the "Germantown" Costco that is actually
 * in Gaithersburg — those results are offered as chips under a
 * line saying the exact name was not found, never accepted
 * silently. Only a Places search with no results at all re-asks
 * for a street address or a more specific name. Street addresses
 * skip Places entirely and
 * behave exactly as before. Once an estimate lands, the panel also
 * shows the route on a small map with the live traffic layer and
 * the drive time in current traffic; if Maps or traffic data is
 * unavailable, the estimate simply stays text-only.
 *
 * Panel shape: the drawer is full height — it spans the whole
 * viewable height of the page (top:0, height:100dvh) with no
 * floating-card margins above or below. The header stays at the
 * top, the message list scrolls in the middle, and the CTA row and
 * input sit at the bottom edge.
 *
 * Conversation focus: the quick-action suggestion chips show when the
 * panel opens, but as soon as the visitor asks something they hide, so
 * the answer owns the panel; a slim "What else can I ask?" button
 * brings them back. The estimate flow's step chips (ride type,
 * one-way/round-trip, cancel) are inputs, not suggestions, and always
 * show during the flow.
 *
 * Conversation memory (smart Nex): the widget remembers the last
 * completed estimate — its inputs (addresses as entered and as
 * resolved, measured miles, ride type, trip type, date/time) and its
 * result — plus recent turns, all in page memory only, and sends
 * them with each question. Follow-ups about the same trip ("for the
 * same, what would be the price for stretcher", "and round trip?",
 * "what if it's Saturday") are answered by the assistant function,
 * which re-prices the stored trip server-side; an address change
 * re-enters this flow's own resolution path with every other detail
 * kept, so only the changed end is asked for again. A re-price on
 * the same route re-renders the same route map under the new answer.
 *
 * Thinking state: before an answer renders, Nex shows a "Nex is
 * thinking…" state with the typing avatar for a realistic beat
 * (900ms, scaling slightly with answer length, capped at 1600ms) —
 * long enough to read as thought, short enough to stay snappy. The
 * beat is skipped entirely when the visitor prefers reduced motion.
 *
 * CTA sizing inside the panel: platform.js adds the page-level
 * .bookRideSign style to any booking-bound link it sees, including
 * links rendered inside this panel. The styles below deliberately
 * neutralize that treatment within the panel only — in-bubble booking
 * links render as compact inline links, and every booking BUTTON in
 * the panel (bottom CTA, estimate answer action, any future one)
 * shares ONE class (.nvaBookBtn) styled as the compact scale of the
 * sign look, so all booking buttons in the panel always match each
 * other. Page-level sign styling outside the widget is untouched.
 *
 * Estimate block + accessibility (Section 508 / WCAG 2.1 AA): every
 * priced answer opens with a structured estimate block built from
 * the response's structured fields — a labeled "Your rough
 * estimate" line with the total large and bold, then service, trip
 * type, miles and pickup date/time — before the narrative answer, so
 * the figure a visitor came for is found at a glance and is never
 * carried by color alone (weight, size and a text label do the
 * work). The chat log is a polite live region (role="log"), every
 * control is a real button/input with an accessible name, focus is
 * visible on every control, interactive borders meet the 3:1
 * non-text contrast minimum, touch targets are at least 44px, and
 * reduced-motion visitors get a static thinking state.
 */
(function () {
  'use strict';
  if (window.__nexusVisitorAssistant) return;
  window.__nexusVisitorAssistant = true;

  var ENDPOINT = '/.netlify/functions/visitor-assistant';
  var ESTIMATE_ENDPOINT = '/.netlify/functions/visitor-estimate';
  var BOOKING_URL = 'https://mynexusride.com';
  var MAIN_PHONE = '(888) 639-5766';
  var MAIN_PHONE_HREF = 'tel:+18886395766';
  var WAITING_GIF = '/assets/nex-waiting.gif';
  var TYPING_GIF = '/assets/nex-typing.gif';
  var COST_PROMPT = 'Do you want to know what your ride would cost?';
  var DEFAULT_PLACEHOLDER = 'Ask about services, areas, hours\u2026';

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
    '.nvaPanel{position:fixed;left:0;top:0;z-index:140;width:var(--nvaW);height:100dvh;display:flex;flex-direction:column;background:#fff;border:1px solid #d7e2e9;border-left:0;border-top:0;border-bottom:0;border-radius:0 22px 22px 0;overflow:hidden;box-shadow:24px 30px 80px rgba(8,47,73,.30);font:16px/1.5 "Source Sans 3","Segoe UI",sans-serif;color:#12212e;transform:translate(-112%,0);visibility:hidden;pointer-events:none;transition:transform .34s cubic-bezier(.32,.72,.28,1),visibility 0s linear .34s}',
    '.nvaPanel.open{transform:translate(0,0);visibility:visible;pointer-events:auto;transition:transform .34s cubic-bezier(.32,.72,.28,1)}',
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
    '.nvaChip{display:inline-flex;align-items:center;min-height:44px;border:1px solid #6e8ca3;background:#fff;color:#082f49;border-radius:999px;padding:8px 12px;font:700 13px Manrope,sans-serif;cursor:pointer}',
    '.nvaChip:hover{border-color:#082f49}',
    /* Slim affordance that replaces the hidden suggestion chips once a
       question has been asked; tapping it brings the suggestions back. */
    '.nvaAskMore{min-height:44px;border-style:dashed;background:transparent;color:#3d5a70;font-weight:600}',
    /* Bottom CTA row: compact, sized for the panel. The Call label
       never wraps; the Book button stays narrower than the Call one. */
    '.nvaCtas{display:flex;gap:8px;padding:8px 14px;background:#fff;border-top:1px solid #e3edf3}',
    '.nvaCall{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;min-height:44px;padding:8px 8px;border-radius:11px;font:800 14px Manrope,sans-serif}',
    '.nvaBook{flex:1}',
    '.nvaCall{flex:1.3;background:#fff;color:#082f49!important;border:1px solid #6e8ca3;white-space:nowrap}',
    /* Estimate result action row (holds the shared booking button). */
    '.nvaEstActions{align-self:flex-start;display:flex;gap:8px}',
    /* Route map block under an estimate: map + drive-time line.
       flex:none is load-bearing: the log is a column flexbox and an
       overflow:hidden flex item may be shrunk to zero height. */
    '.nvaMapWrap{flex:none;align-self:stretch;background:#fff;border:1px solid #d7e6f0;border-radius:15px;overflow:hidden}',
    '.nvaMap{width:100%;height:210px;background:#e8eef2}',
    '.nvaMapMeta{padding:8px 12px;font:600 13.5px/1.4 "Source Sans 3",sans-serif;color:#12212e}',
    /* ONE shared style for every booking-app button inside the panel:
       the compact scale of the platform .bookRideSign look (dark red
       radial sign, 2px #cf1f1f border, Manrope 900 uppercase, 20px
       radius, ~44px tall). The bottom CTA (.nvaBook) and the estimate
       answer button (.nvaEstBook) both carry .nvaBookBtn, and any
       future booking button in the panel must use the same class so
       they can never drift apart again. */
    '.nvaPanel .nvaBookBtn{position:relative;isolation:isolate;display:inline-flex;align-items:center;justify-content:center;gap:0;min-height:44px;padding:8px 18px;border:2px solid #cf1f1f;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,0) 33%),radial-gradient(130% 95% at 50% 0,#9f0f0f 0,#7f0707 52%,#690505 100%);color:#fff!important;text-align:center;text-decoration:none;text-transform:uppercase;letter-spacing:.02em;font-family:Manrope,sans-serif;font-size:14px;font-weight:900;line-height:1.05;box-shadow:0 20px 38px rgba(70,0,0,.32),inset 0 1px 0 rgba(255,255,255,.25),inset 0 -7px 14px rgba(18,0,0,.34);overflow:hidden;white-space:nowrap}',
    '.nvaPanel .nvaBookBtn:before{content:"";position:absolute;inset:4px;border-radius:16px;border:1px solid rgba(255,74,74,.48);pointer-events:none}',
    /* The page-level .bookRideSign treatment (added by platform.js to
       booking-bound links anywhere in the DOM) must not balloon links
       inside the chat panel: reset it to a plain inline link here. */
    '.nvaPanel a.bookRideSign{display:inline!important;position:static!important;min-height:0!important;height:auto!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important;color:#0e5c8c!important;text-decoration:underline!important;text-transform:none!important;letter-spacing:normal!important;font-family:inherit!important;font-size:inherit!important;font-weight:700!important;line-height:inherit!important;white-space:normal!important;overflow:visible!important}',
    '.nvaPanel a.bookRideSign:before{content:none!important;display:none!important}',
    '.nvaPanel a.bookRideSign:hover,.nvaPanel a.bookRideSign:focus-visible{transform:none!important;filter:none!important}',
    '.nvaPanel .nvaMsg.user a.bookRideSign{color:#9de7ec!important}',
    /* …while the panel's booking buttons keep the ONE shared sign
       style above even when platform.js tags them with the sign
       class: the same declarations, restated with !important so the
       platform stylesheet cannot pull them back to full size or a
       different look. One rule covers every .nvaBookBtn, present
       and future, in any part of the panel. */
    '.nvaPanel a.nvaBookBtn.bookRideSign{display:inline-flex!important;position:relative!important;isolation:isolate!important;align-items:center!important;justify-content:center!important;gap:0!important;min-height:44px!important;height:auto!important;padding:8px 18px!important;border:2px solid #cf1f1f!important;border-radius:20px!important;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,0) 33%),radial-gradient(130% 95% at 50% 0,#9f0f0f 0,#7f0707 52%,#690505 100%)!important;box-shadow:0 20px 38px rgba(70,0,0,.32),inset 0 1px 0 rgba(255,255,255,.25),inset 0 -7px 14px rgba(18,0,0,.34)!important;color:#fff!important;text-align:center!important;text-decoration:none!important;text-transform:uppercase!important;letter-spacing:.02em!important;font-family:Manrope,sans-serif!important;font-size:14px!important;font-weight:900!important;line-height:1.05!important;white-space:nowrap!important;overflow:hidden!important}',
    '.nvaPanel a.nvaBookBtn.bookRideSign:before{content:""!important;display:block!important;position:absolute!important;inset:4px!important;border-radius:16px!important;border:1px solid rgba(255,74,74,.48)!important;pointer-events:none!important}',
    '.nvaForm{display:flex;gap:8px;padding:10px 14px 14px;background:#fff}',
    '.nvaInput{flex:1;min-width:0;min-height:48px;border:1px solid #6e8ca3;border-radius:11px;padding:11px 13px;font:inherit}',
    '.nvaInput:focus{border-color:#0e5c8c}',
    '.nvaSend{flex:none;min-height:48px;min-width:76px;border:0;border-radius:11px;padding:11px 17px;background:#082f49;color:#fff;font:800 15.5px Manrope,sans-serif;cursor:pointer}',
    '.nvaSend:disabled{opacity:.55;cursor:wait}',
    '.nvaNote{padding:0 14px 12px;background:#fff;color:#52677a;font-size:12.5px}',
    /* Structured estimate block: the priced answer's key values,
       built from the response's structured fields (never scraped
       from the prose). The total is the hero — large, heavy, and
       labeled — so emphasis is weight + size + label, not color. */
    '.nvaEstBlock{display:block;background:#fff;border:1px solid #6e8ca3;border-left:5px solid #0e5c8c;border-radius:10px;padding:10px 12px;margin:0 0 9px}',
    '.nvaEstLabel{display:block;font:800 12px/1.3 Manrope,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#3d5a70}',
    '.nvaEstTotal{display:block;font:800 27px/1.15 Manrope,sans-serif;color:#082f49;margin:2px 0}',
    '.nvaEstMeta{display:block;font:600 13.5px/1.45 "Source Sans 3",sans-serif;color:#12212e}',
    /* Visible keyboard focus on every control (WCAG 2.4.7): a solid
       ring in the brand mid-blue on light surfaces; on the dark
       controls a white ring backed by a blue halo, so the indicator
       keeps 3:1 against both the control and what surrounds it. */
    '.nvaChip:focus-visible,.nvaCall:focus-visible,.nvaInput:focus-visible,.nvaMsg a:focus-visible,.nvaEstActions a:focus-visible,.nvaPanel .nvaBookBtn:focus-visible{outline:3px solid #0e5c8c;outline-offset:2px}',
    '.nvaTab:focus-visible,.nvaClose:focus-visible,.nvaSend:focus-visible{outline:3px solid #ffffff;outline-offset:2px;box-shadow:0 0 0 6px #0e5c8c}',
    '/* Full height at every width: the drawer always spans 100dvh. */',
    '@media (prefers-reduced-motion:reduce){.nvaPanel,.nvaTab{transition:none!important}.nvaTypingGif{display:none}}'
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
    '<div class="nvaLog" id="nvaLog" role="log" aria-live="polite" aria-label="Conversation with Nex"></div>' +
    '<div class="nvaChips" id="nvaChips"></div>' +
    '<div class="nvaCtas"><a class="nvaBook nvaBookBtn" href="' + BOOKING_URL + '">Book a Ride</a>' +
    '<a class="nvaCall" href="' + MAIN_PHONE_HREF + '">Call ' + MAIN_PHONE + '</a></div>' +
    '<form class="nvaForm" id="nvaForm"><label class="sr" id="nvaInputLabel" for="nvaInput" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Type your question</label>' +
    '<input class="nvaInput" id="nvaInput" type="text" autocomplete="off" maxlength="500" placeholder="' + DEFAULT_PLACEHOLDER + '">' +
    '<button class="nvaSend" id="nvaSend" type="submit">Send</button></form>' +
    '<div class="nvaNote">Nex answers from the Nexus website. Addresses you enter for a rough estimate are used only to work out the distance and are not stored. When you book, the booking form collects the full trip details.</div>';

  document.body.appendChild(tab);
  document.body.appendChild(panel);

  var log = panel.querySelector('#nvaLog');
  var chipsBox = panel.querySelector('#nvaChips');
  var form = panel.querySelector('#nvaForm');
  var input = panel.querySelector('#nvaInput');
  var send = panel.querySelector('#nvaSend');
  var headAvatar = panel.querySelector('#nvaAvatar');
  var inputLabel = panel.querySelector('#nvaInputLabel');
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

  var REDUCED_MOTION = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function showTyping() {
    var pending = addMessage('', 'bot');
    pending.classList.add('nvaTyping');
    pending.innerHTML = '<img class="nvaTypingGif" src="' + TYPING_GIF + '" alt="" aria-hidden="true"><span>Nex is thinking\u2026</span>';
    headAvatar.src = TYPING_GIF;
    log.scrollTop = log.scrollHeight;
    return pending;
  }

  // How long the thinking state should stay up for an answer of this
  // length: a 900ms floor, growing gently with length, capped at
  // 1600ms. Time already spent waiting on the server counts toward it,
  // so a slow response never gets a second artificial delay stacked on
  // top — and reduced-motion visitors skip the beat entirely.
  function thinkingMs(answerText) {
    if (REDUCED_MOTION) return 0;
    return Math.min(1600, 900 + Math.round(String(answerText || '').length * 0.7));
  }

  function afterThinking(startedAt, answerText) {
    var remaining = thinkingMs(answerText) - (Date.now() - startedAt);
    if (remaining <= 0) return Promise.resolve();
    return new Promise(function (resolve) { setTimeout(resolve, remaining); });
  }

  function fillPending(pending, text) {
    pending.classList.remove('nvaTyping');
    pending.innerHTML = renderText(text);
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------------------------ estimate block
  // A priced answer is rendered as a structured block FIRST (built
  // only from the response's structured estimate fields and the
  // trip inputs — never scraped from the prose), then the narrative
  // answer with its "How I got there" explanation. Inside the
  // narrative, the figures the structured payload itself carries —
  // the tool-returned total, and the billed deadhead miles in the
  // allowance phrasing — are bolded by exact match against those
  // values; anything the payload does not vouch for stays unbolded.
  var SERVICE_SHORT = { ambulatory: 'Ambulatory', wheelchair: 'Wheelchair', stretcher: 'Stretcher', bariatric: 'Bariatric', bls: 'Ambulance (BLS)' };

  // Mirror of the estimate service's fmtMiles: one decimal always.
  function fmtMiles1(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function fmtDateShort(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (Number.isNaN(d.getTime())) return '';
    return days[d.getUTCDay()] + ', ' + months[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }

  function fmtTimeShort(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return '';
    var h = Number(m[1]);
    if (h > 23) return '';
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + m[2] + ' ' + suffix;
  }

  function estimateMetaLine(est, inputs) {
    var parts = [];
    var svc = (est && est.serviceLabel) || (est && SERVICE_SHORT[est.service]) || (inputs && SERVICE_SHORT[inputs.service]) || '';
    if (svc) parts.push(svc);
    var tt = (est && est.tripType) || (inputs && inputs.tripType) || '';
    if (tt) parts.push(tt === 'ROUND_TRIP' ? 'Round trip' : 'One way');
    if (inputs && Number(inputs.loadedMiles) > 0) {
      parts.push(fmtMiles1(inputs.loadedMiles) + (tt === 'ROUND_TRIP' ? ' mi each way' : ' mi'));
    } else if (est && Number(est.loadedMiles) > 0) {
      parts.push(fmtMiles1(est.loadedMiles) + ' mi' + (tt === 'ROUND_TRIP' ? ' total' : ''));
    }
    var when = [];
    var d = fmtDateShort(inputs && inputs.date);
    if (d) when.push(d);
    var t = fmtTimeShort(inputs && inputs.time);
    if (t) when.push('at ' + t);
    if (when.length) parts.push(when.join(' '));
    return parts.join(' \u00b7 ');
  }

  function estimateBlockHtml(est, inputs) {
    if (!est || !Number.isFinite(Number(est.displayTotal))) return '';
    var meta = estimateMetaLine(est, inputs);
    return '<span class="nvaEstBlock"><span class="nvaEstLabel">Your rough estimate</span>' +
      '<span class="nvaEstTotal">$' + escapeHtml(String(est.displayTotal)) + '</span>' +
      (meta ? '<span class="nvaEstMeta">' + escapeHtml(meta) + '</span>' : '') + '</span>';
  }

  function boldFigure(html, fig) {
    if (!fig) return html;
    var esc = fig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(esc + '(?![0-9])', 'g'), '<strong>' + fig + '</strong>');
  }

  function renderEstimateText(text, est) {
    var html = renderText(text);
    if (est && Number.isFinite(Number(est.displayTotal))) {
      html = boldFigure(html, '$' + est.displayTotal);
    }
    if (est && Number(est.deadheadMiles) > 0) {
      html = boldFigure(html, fmtMiles1(est.deadheadMiles) + ' miles over 25');
    }
    return html;
  }

  function fillPendingEstimate(pending, text, est, inputs) {
    pending.classList.remove('nvaTyping');
    pending.innerHTML = estimateBlockHtml(est, inputs) + renderEstimateText(text, est);
    log.scrollTop = log.scrollHeight;
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

  // ------------------------------------------------------------- Q&A path
  // Conversation memory: the last completed estimate and the recent
  // turns, in page memory only (see the header note). lastRoute keeps
  // the measured route so a same-route re-price can redraw its map.
  var lastEstimate = null;
  var lastRoute = null;
  var chatHistory = [];
  var pendingAddressClarify = false;
  var pendingFollowupAddress = null;

  function recordTurn(role, text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!t) return;
    chatHistory.push({ role: role, text: t });
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
  }

  // Snapshot the trip the flow just priced (payload = what was sent
  // to the estimate function; flow carries the entered/resolved
  // address forms) so follow-ups can re-price it unchanged.
  function rememberEstimate(estimate) {
    if (!flow || !flow.lastPayload) return;
    var p = flow.lastPayload;
    var inputs = {
      pickup: flow.pickupEntered || p.pickup,
      dropoff: flow.dropoffEntered || p.dropoff,
      pickupResolved: p.pickup,
      dropoffResolved: p.dropoff,
      service: p.service,
      tripType: p.tripType,
      date: p.date,
      time: p.time,
      loadedMiles: p.loadedMiles,
      durationMinutes: p.durationMinutes || 0
    };
    if (p.returnMiles) inputs.returnMiles = p.returnMiles;
    ['pickupState', 'dropoffState', 'pickupLat', 'pickupLng', 'dropoffLat', 'dropoffLng'].forEach(function (k) {
      if (p[k] != null && p[k] !== '') inputs[k] = p[k];
    });
    lastEstimate = { inputs: inputs, result: estimate || null };
    if (flow.route) lastRoute = flow.route;
  }

  function addEstimateActions() {
    var actions = document.createElement('div');
    actions.className = 'nvaEstActions';
    actions.innerHTML = '<a class="nvaEstBook nvaBookBtn" href="' + BOOKING_URL + '" target="_blank" rel="noopener">Book a Ride \u2014 exact quote</a>';
    log.appendChild(actions);
  }

  // Act on the conversation fields of an assistant reply: adopt the
  // (sanitized) state it echoes, redraw the map under a same-route
  // re-price, re-enter the address path for an address change, or
  // start fresh when the visitor asked to.
  function handleAssistantData(data) {
    if (data.answer) recordTurn('assistant', data.answer);
    if (data.state && 'lastEstimate' in data.state) {
      lastEstimate = data.state.lastEstimate;
      if (!lastEstimate) lastRoute = null;
    }
    if ((data.mode === 'followup-estimate' || data.mode === 'model-estimate') && data.estimate) {
      addEstimateActions();
      if (lastRoute) renderRouteMap(lastRoute);
      log.scrollTop = log.scrollHeight;
    } else if (data.mode === 'followup-reset') {
      lastEstimate = null;
      lastRoute = null;
      startEstimateFlow();
    } else if (data.mode === 'followup-address' && data.followup) {
      // Deferred to ask()'s finally: seeding the flow can start an
      // async resolution/estimate whose busy flag ask() must not clear.
      if (data.followup.which) pendingFollowupAddress = data.followup;
      else pendingAddressClarify = true;
    }
  }

  function ask(question) {
    var q = String(question || '').trim();
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    addMessage(q, 'user');
    recordTurn('user', q);
    input.value = '';
    var pending = showTyping();
    var startedAt = Date.now();
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: q,
        state: lastEstimate ? { lastEstimate: lastEstimate } : null,
        history: chatHistory.slice(0, -1)
      })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.answer) {
          // Hold the thinking state for its beat before the answer lands.
          return afterThinking(startedAt, out.data.answer).then(function () {
            var d = out.data;
            var est = (d.mode === 'followup-estimate' || d.mode === 'model-estimate') ? d.estimate : null;
            if (est) {
              var estInputs = (d.state && d.state.lastEstimate && d.state.lastEstimate.inputs) ||
                (lastEstimate && lastEstimate.inputs) || null;
              fillPendingEstimate(pending, d.answer, est, estInputs);
            } else {
              fillPending(pending, d.answer);
            }
            handleAssistantData(d);
          });
        }
        if (out.data && out.data.error) {
          fillPending(pending, out.data.error);
          return null;
        }
        throw new Error('bad response');
      })
      .catch(function () {
        fillPending(pending,
          'I can\u2019t reach the assistant right now. Please call us at ' + MAIN_PHONE + ' and the team will help, or book online at ' + BOOKING_URL + '.'
        );
      })
      .finally(function () {
        busy = false;
        send.disabled = false;
        headAvatar.src = WAITING_GIF;
        log.scrollTop = log.scrollHeight;
        if (pendingFollowupAddress) {
          var pf = pendingFollowupAddress;
          pendingFollowupAddress = null;
          startAddressChange(pf.which, pf.address);
        }
        input.focus();
      });
  }

  // ------------------------------------------------- estimate flow (chat)
  var flow = null;
  // Suggestion chips show on open; once the visitor asks anything they
  // hide so the answer owns the panel (see renderChips).
  var suggestionsHidden = false;

  var SERVICE_CHIPS = [
    { label: 'Ambulatory', key: 'ambulatory' },
    { label: 'Wheelchair', key: 'wheelchair' },
    { label: 'Stretcher', key: 'stretcher' },
    { label: 'Bariatric', key: 'bariatric' },
    { label: 'Ambulance', key: 'bls' }
  ];

  var STEP_PROMPTS = {
    pickup: 'Where should we pick you up? A street address with city and state works, or a place name \u2014 like \u201cthe Washington Monument\u201d or \u201cCostco in Germantown\u201d.',
    dropoff: 'Got it. And where are you headed? The drop-off address, or a place name the same way.',
    service: 'What type of ride is it? Tap one below, or type it.',
    tripType: 'One way, or round trip?',
    datetime: 'Last detail: what date and time should we pick you up? For example, \u201cFriday at 10:30 AM\u201d, \u201ctomorrow at 9 AM\u201d, or \u201cNov 8 at 2 PM\u201d.',
    timeOnly: 'And what time should we pick you up?'
  };

  function renderChips() {
    chipsBox.innerHTML = '';
    var defs = [];
    if (!flow && suggestionsHidden) {
      // Asked-and-answered state: one slim way back to the suggestions.
      defs = [{
        label: 'What else can I ask?',
        className: 'nvaChip nvaAskMore',
        action: function () { suggestionsHidden = false; renderChips(); }
      }];
    } else if (!flow) {
      defs = [COST_PROMPT, 'What services do you offer?', 'What areas do you serve?', 'What are your hours?', 'How does booking work?']
        .map(function (q) { return { label: q, action: function () { handleUserText(q); } }; });
    } else if (flow.step === 'placePickup' || flow.step === 'placeDropoff') {
      var placeWhich = flow.step === 'placePickup' ? 'pickup' : 'dropoff';
      defs = (flow.placeOptions || []).map(function (p) {
        return {
          label: placeDisplay(p),
          action: function () { if (!busy) { addMessage(placeDisplay(p), 'user'); acceptPlace(placeWhich, p, null); } }
        };
      });
      defs.push({ label: 'Cancel estimate', action: cancelFlow });
    } else if (flow.step === 'service') {
      defs = SERVICE_CHIPS.map(function (s) {
        return { label: s.label, action: function () { if (!busy) { addMessage(s.label, 'user'); setService(s.key); } } };
      });
      defs.push({ label: 'Cancel estimate', action: cancelFlow });
    } else if (flow.step === 'tripType') {
      defs = [
        { label: 'One way', action: function () { if (!busy) { addMessage('One way', 'user'); setTripType('ONE_WAY'); } } },
        { label: 'Round trip', action: function () { if (!busy) { addMessage('Round trip', 'user'); setTripType('ROUND_TRIP'); } } },
        { label: 'Cancel estimate', action: cancelFlow }
      ];
    } else {
      defs = [{ label: 'Cancel estimate', action: cancelFlow }];
    }
    defs.forEach(function (def) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = def.className || 'nvaChip';
      chip.textContent = def.label;
      chip.addEventListener('click', def.action);
      chipsBox.appendChild(chip);
    });
  }

  // Each flow step's placeholder has a matching accessible label, so
  // the single chat input is announced as what Nex is actually
  // asking for right now (pickup, drop-off, date/time…), not just
  // "type your question" throughout the estimate flow.
  var PLACEHOLDER_LABELS = {};
  PLACEHOLDER_LABELS[DEFAULT_PLACEHOLDER] = 'Type your question';
  PLACEHOLDER_LABELS['Pickup address\u2026'] = 'Pickup address or place name';
  PLACEHOLDER_LABELS['Drop-off address\u2026'] = 'Drop-off address or place name';
  PLACEHOLDER_LABELS['New pickup address\u2026'] = 'New pickup address or place name';
  PLACEHOLDER_LABELS['New drop-off address\u2026'] = 'New drop-off address or place name';
  PLACEHOLDER_LABELS['Or type the ride type\u2026'] = 'Ride type';
  PLACEHOLDER_LABELS['One way or round trip\u2026'] = 'One way or round trip';
  PLACEHOLDER_LABELS['Date and time, e.g. Nov 8 at 2 PM\u2026'] = 'Pickup date and time';
  PLACEHOLDER_LABELS['Pickup time, e.g. 10:30 AM\u2026'] = 'Pickup time';
  PLACEHOLDER_LABELS['Tap a place above, or type again\u2026'] = 'Choose a place above, or type an address';

  function setPlaceholder(text) {
    input.setAttribute('placeholder', text);
    var label = PLACEHOLDER_LABELS[text];
    if (label && inputLabel) inputLabel.textContent = label;
  }

  function endFlow() {
    flow = null;
    renderChips();
    setPlaceholder(DEFAULT_PLACEHOLDER);
  }

  function cancelFlow() {
    if (busy) return;
    endFlow();
    addMessage('No problem \u2014 the estimate is cancelled. Ask me anything else, or book online at ' + BOOKING_URL + ' when you\u2019re ready.', 'bot');
  }

  function startEstimateFlow() {
    flow = { step: 'pickup', pickup: '', dropoff: '', service: '', tripType: '', date: '', time: '', pendingDate: '', geoFails: { pickup: 0, dropoff: 0 }, pickupPlace: null, dropoffPlace: null, placeOptions: null, route: null };
    renderChips();
    addMessage('I can work out a rough estimate right here \u2014 no need to open the booking app first. I just need a few details. (Availability itself is confirmed when you book.)\n\n' + STEP_PROMPTS.pickup, 'bot');
    setPlaceholder('Pickup address\u2026');
  }

  // Address change on the remembered trip: seed the flow with every
  // detail of the stored estimate and clear only the changed end, so
  // the visitor answers one question instead of starting over. An
  // address given inline ("pickup from X instead") goes straight
  // through the usual resolution path.
  function startAddressChange(which, addressText) {
    if (!lastEstimate) return;
    var inp = lastEstimate.inputs;
    flow = {
      step: which,
      pickup: inp.pickupResolved || inp.pickup, dropoff: inp.dropoffResolved || inp.dropoff,
      service: inp.service, tripType: inp.tripType, date: inp.date, time: inp.time,
      pendingDate: '', geoFails: { pickup: 0, dropoff: 0 },
      pickupPlace: null, dropoffPlace: null, placeOptions: null, route: lastRoute,
      pickupEntered: inp.pickup, dropoffEntered: inp.dropoff, addressChange: which
    };
    flow[which] = '';
    renderChips();
    setPlaceholder(which === 'pickup' ? 'New pickup address\u2026' : 'New drop-off address\u2026');
    if (addressText) {
      if (looksLikeStreetAddress(addressText)) acceptRawAddress(which, addressText);
      else resolvePlace(which, addressText);
    }
  }

  function setService(key) {
    flow.service = key;
    flow.step = 'tripType';
    renderChips();
    addMessage(STEP_PROMPTS.tripType, 'bot');
    setPlaceholder('One way or round trip\u2026');
  }

  function setTripType(type) {
    flow.tripType = type;
    flow.step = 'datetime';
    renderChips();
    addMessage(STEP_PROMPTS.datetime, 'bot');
    setPlaceholder('Date and time, e.g. Nov 8 at 2 PM\u2026');
  }

  function parseService(text) {
    var t = text.toLowerCase();
    if (t.includes('wheelchair')) return 'wheelchair';
    if (t.includes('stretcher')) return 'stretcher';
    if (t.includes('bariatric')) return 'bariatric';
    if (t.includes('ambulance') || /\b(bls|als)\b/.test(t)) return 'bls';
    if (t.includes('ambulatory') || t.includes('car') || t.includes('sedan') || t.includes('walk')) return 'ambulatory';
    return null;
  }

  function parseTripType(text) {
    var t = text.toLowerCase();
    if (/round|return|\brt\b/.test(t)) return 'ROUND_TRIP';
    if (/one ?way|single|just there|only there/.test(t)) return 'ONE_WAY';
    return null;
  }

  // -------- pickup date/time parsing (visitor-friendly, America/New_York)
  function etToday() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(new Date());
    var get = function (type) { return parts.find(function (p) { return p.type === type; }).value; };
    var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    return { date: get('year') + '-' + get('month') + '-' + get('day'), dow: dow };
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }
  function addDays(dateStr, days) {
    var p = dateStr.split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }
  function extractTime(t) {
    var m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m) { var h = Number(m[1]) % 12; if (m[3] === 'pm') h += 12; return pad2(h) + ':' + pad2(Number(m[2] || 0)); }
    m = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return pad2(Number(m[1])) + ':' + pad2(Number(m[2]));
    if (/\bnoon\b/.test(t)) return '12:00';
    if (/\bmidnight\b/.test(t)) return '00:00';
    return null;
  }
  var MONTH_NAMES = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var WEEKDAY_NAMES = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

  function parseDateTime(text) {
    var t = ' ' + String(text || '').toLowerCase().replace(/[\u2019]/g, "'") + ' ';
    var today = etToday();
    var time = extractTime(t);
    var date = null;
    var m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) date = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (!date) {
      m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (m) {
        var year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.date.slice(0, 4));
        date = ymd(year, Number(m[1]), Number(m[2]));
        if (date && !m[3] && date < today.date) date = ymd(year + 1, Number(m[1]), Number(m[2]));
      }
    }
    if (!date) {
      m = t.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
      if (m) {
        var month = MONTH_NAMES[m[1]];
        var yr = m[3] ? Number(m[3]) : Number(today.date.slice(0, 4));
        date = ymd(yr, month, Number(m[2]));
        if (date && !m[3] && date < today.date) date = ymd(yr + 1, month, Number(m[2]));
      }
    }
    if (!date) {
      if (/\btoday\b/.test(t)) date = today.date;
      else if (/\btomorrow\b/.test(t)) date = addDays(today.date, 1);
      else {
        var wd = t.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
        if (wd) {
          var target = WEEKDAY_NAMES[wd[1]];
          var diff = (target - today.dow + 7) % 7;
          if (diff === 0 && /\bnext\b/.test(t)) diff = 7;
          date = addDays(today.date, diff);
        }
      }
    }
    if (!date && !time) return null;
    if (!date) return { timeOnly: true, time: time };
    var past = date < today.date;
    if (!time) return { dateOnly: true, date: date, past: past };
    return { date: date, time: time, past: past };
  }

  // -------- measuring the trip (Google Maps in the browser, like booking)
  var mapsPromise = null;
  function loadMaps() {
    if (window.google && window.google.maps && window.google.maps.DirectionsService) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;
    mapsPromise = fetch('/api/integrations/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (!cfg || !cfg.googleMapsEnabled || !cfg.googleMapsBrowserKey) throw { code: 'maps-unavailable' };
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(function () { reject({ code: 'maps-unavailable' }); }, 15000);
          var script = document.createElement('script');
          script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cfg.googleMapsBrowserKey) + '&v=weekly&libraries=places';
          script.onload = function () { clearTimeout(timer); resolve(window.google.maps); };
          script.onerror = function () { clearTimeout(timer); reject({ code: 'maps-unavailable' }); };
          document.head.appendChild(script);
        });
      })
      .catch(function (err) { mapsPromise = null; throw err && err.code ? err : { code: 'maps-unavailable' }; });
    return mapsPromise;
  }

  function geocode(maps, address, which) {
    return new Promise(function (resolve, reject) {
      new maps.Geocoder().geocode({ address: address }, function (results, status) {
        if (status !== 'OK' || !results || !results[0]) { reject({ code: 'geocode', which: which }); return; }
        var r = results[0];
        var state = '';
        (r.address_components || []).forEach(function (c) {
          if (c.types && c.types.includes('administrative_area_level_1')) state = c.short_name;
        });
        resolve({
          formatted: r.formatted_address,
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
          state: state
        });
      });
    });
  }

  function directionsMiles(maps, origin, destination) {
    return new Promise(function (resolve, reject) {
      // "Leave now" with traffic, so the result carries the drive
      // time in current traffic (duration_in_traffic) alongside the
      // plain duration, plus the raw result for the route map.
      var request = {
        origin: origin, destination: destination, travelMode: maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' }
      };
      new maps.DirectionsService().route(request, function (result, status) {
        var legs = result && result.routes && result.routes[0] && result.routes[0].legs;
        if (status !== 'OK' || !legs || !legs.length) { reject({ code: 'directions' }); return; }
        var meters = 0, seconds = 0, trafficSeconds = 0, hasTraffic = false;
        legs.forEach(function (leg) {
          meters += leg.distance.value;
          seconds += leg.duration.value;
          if (leg.duration_in_traffic && leg.duration_in_traffic.value) {
            trafficSeconds += leg.duration_in_traffic.value;
            hasTraffic = true;
          }
        });
        resolve({
          miles: meters / 1609.344,
          minutes: seconds / 60,
          trafficMinutes: hasTraffic ? trafficSeconds / 60 : null,
          result: result
        });
      });
    });
  }

  // -------- place-name resolution (Google Places, browser-side)
  // Search is biased to the local region so "Costco" leans to the
  // nearby Costcos; it is a bias, not a fence — coverage is 48
  // states, and the query text itself ("Costco in Germantown")
  // carries the place. Resolved places feed the same geocode +
  // Directions measuring as typed addresses; nothing is sent to or
  // stored on the server beyond the formatted address the flow
  // already used.
  var REGION_BIAS = { lat: 38.98, lng: -77.10, radiusMeters: 160000 };
  var PLACE_STOPWORDS = { the: 1, a: 1, an: 1, in: 1, at: 1, near: 1, to: 1, of: 1 };

  // Street addresses keep the exact pre-Places behavior: house
  // number first, a ZIP anywhere, or a street suffix plus a comma.
  function looksLikeStreetAddress(q) {
    var t = String(q || '');
    if (/^\s*\d{1,6}\s+\S/.test(t)) return true;
    if (/\b\d{5}(?:-\d{4})?\b/.test(t)) return true;
    if (/\b(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|way|highway|hwy|parkway|pkwy|place|pl|circle|cir|terrace|ter|trail|trl|square|sq|alley|aly)\b/i.test(t) && /,/.test(t)) return true;
    return false;
  }

  function queryTokens(query) {
    return String(query || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(function (t) { return t && !PLACE_STOPWORDS[t]; });
  }

  function normalizePlace(r) {
    return {
      name: r.name || '',
      formatted: r.formatted_address || r.name || '',
      lat: r.geometry.location.lat(),
      lng: r.geometry.location.lng()
    };
  }

  // Relevant: every meaningful query token shows up in the place's
  // name or address ("monument" in "Washington Monument, …").
  function placeRelevant(p, query) {
    var toks = queryTokens(query);
    if (!toks.length) return false;
    var hay = (p.name + ' ' + p.formatted).toLowerCase();
    return toks.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  // Name-covering: every meaningful query token is in the NAME
  // itself — a stronger signal than relevance alone.
  function placeNameCovers(p, query) {
    var toks = queryTokens(query);
    if (!toks.length) return false;
    var name = p.name.toLowerCase();
    return toks.every(function (t) { return name.indexOf(t) !== -1; });
  }

  function placeLocality(p) {
    var m = String(p.formatted).replace(/,?\s*USA\s*$/, '')
      .match(/,\s*([^,]+,\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    return m ? m[1] : '';
  }

  // "Washington Monument, Washington, DC" — name + locality, the
  // way the resolution is echoed back and shown on choice chips.
  function placeDisplay(p) {
    var loc = placeLocality(p);
    if (p.name && loc) return p.name + ', ' + loc;
    return p.name || p.formatted;
  }

  // Today's behavior for a raw entry: store it and move on.
  function acceptRawAddress(which, q) {
    flow[which] = q;
    flow[which + 'Entered'] = q;
    flow[which + 'Place'] = null;
    if (maybeResubmit()) return;
    if (which === 'pickup') {
      flow.step = 'dropoff';
      renderChips();
      addMessage(STEP_PROMPTS.dropoff, 'bot');
      setPlaceholder('Drop-off address\u2026');
    } else {
      flow.step = 'service';
      renderChips();
      addMessage(STEP_PROMPTS.service, 'bot');
      setPlaceholder('Or type the ride type\u2026');
    }
  }

  function acceptPlace(which, place, pending) {
    flow[which] = place.formatted;
    flow[which + 'Place'] = place;
    var echo = 'Got it \u2014 ' + (which === 'pickup' ? 'pickup' : 'drop-off') + ': ' + placeDisplay(place) + '.';
    if (maybeResubmit()) {
      if (pending) fillPending(pending, echo); else addMessage(echo, 'bot');
      return;
    }
    if (which === 'pickup') {
      flow.step = 'dropoff';
      renderChips();
      if (pending) fillPending(pending, echo + '\n\n' + STEP_PROMPTS.dropoff);
      else addMessage(echo + '\n\n' + STEP_PROMPTS.dropoff, 'bot');
      setPlaceholder('Drop-off address\u2026');
    } else {
      flow.step = 'service';
      renderChips();
      if (pending) fillPending(pending, echo + '\n\n' + STEP_PROMPTS.service);
      else addMessage(echo + '\n\n' + STEP_PROMPTS.service, 'bot');
      setPlaceholder('Or type the ride type\u2026');
    }
  }

  function resolvePlace(which, query) {
    if (flow) flow[which + 'Entered'] = query;
    busy = true;
    send.disabled = true;
    var pending = showTyping();
    function finish(fn) {
      busy = false;
      send.disabled = false;
      headAvatar.src = WAITING_GIF;
      fn();
      input.focus();
    }
    loadMaps()
      .then(function (maps) {
        if (!maps.places || !maps.places.PlacesService) throw { code: 'no-places' };
        return new Promise(function (resolve, reject) {
          var service = new maps.places.PlacesService(document.createElement('div'));
          service.textSearch({
            query: query,
            location: new maps.LatLng(REGION_BIAS.lat, REGION_BIAS.lng),
            radius: REGION_BIAS.radiusMeters
          }, function (results, status) {
            if (status !== maps.places.PlacesServiceStatus.OK || !results || !results.length) {
              reject({ code: 'places-none' });
              return;
            }
            resolve(results);
          });
        });
      })
      .then(function (results) {
        var places = results
          .filter(function (r) { return r && r.geometry && r.geometry.location; })
          .map(normalizePlace);
        if (!places.length) throw { code: 'places-none' };
        var pool = places.filter(function (p) { return placeRelevant(p, query); });
        if (!pool.length) {
          // Places answered, but no result carries every word of
          // the query — the usual case is a place locals name for
          // the next town over ("Costco in Germantown" is actually
          // in Gaithersburg, so "germantown" matches nothing and
          // the strict filter empties out). Offer what Places
          // returned, in its own order, as choices under a line
          // that says the exact name was not found; a mismatch is
          // never accepted silently — the visitor picks, exactly
          // as in the several-matches branch below.
          finish(function () {
            flow.step = which === 'pickup' ? 'placePickup' : 'placeDropoff';
            flow.placeOptions = places.slice(0, 4);
            renderChips();
            fillPending(pending, 'I couldn\u2019t find a place with that exact name nearby \u2014 did you mean one of these? Tap the right one, or type a more specific name or a street address.');
            setPlaceholder('Tap a place above, or type again\u2026');
          });
          return;
        }
        if (pool.length === 1) {
          finish(function () { acceptPlace(which, pool[0], pending); });
          return;
        }
        var full = pool.filter(function (p) { return placeNameCovers(p, query); });
        if (full.length === 1) {
          finish(function () { acceptPlace(which, full[0], pending); });
          return;
        }
        finish(function () {
          flow.step = which === 'pickup' ? 'placePickup' : 'placeDropoff';
          flow.placeOptions = pool.slice(0, 4);
          renderChips();
          fillPending(pending, 'I found a few places matching \u201c' + query + '\u201d \u2014 tap the right one, or type a more specific name or a street address.');
          setPlaceholder('Tap a place above, or type again\u2026');
        });
      })
      .catch(function (err) {
        finish(function () {
          if (err && err.code === 'places-none') {
            fillPending(pending, 'I couldn\u2019t find a place matching \u201c' + query + '\u201d. Could you give me the street address with city and state, or a more specific place name?');
            flow.step = which;
            renderChips();
            setPlaceholder(which === 'pickup' ? 'Pickup address\u2026' : 'Drop-off address\u2026');
            return;
          }
          // Maps/Places unavailable: fall back to the raw text,
          // exactly as the flow behaved before place resolution.
          pending.remove();
          acceptRawAddress(which, query);
        });
      });
  }

  // Route map with the live traffic layer, shown under the estimate
  // answer with the drive time in current traffic. Best-effort only:
  // any Maps failure quietly leaves the text-only estimate as it was.
  function renderRouteMap(route) {
    if (!route || !route.result) return;
    loadMaps().then(function (maps) {
      if (!maps.Map || !maps.DirectionsRenderer) return;
      var wrap = document.createElement('div');
      wrap.className = 'nvaMapWrap';
      var mapEl = document.createElement('div');
      mapEl.className = 'nvaMap';
      mapEl.setAttribute('role', 'img');
      mapEl.setAttribute('aria-label', 'Map of your trip route with current traffic');
      var meta = document.createElement('div');
      meta.className = 'nvaMapMeta';
      var milesTxt = (Math.round(route.miles * 10) / 10).toFixed(1) + ' mi';
      var mins = route.trafficMinutes != null ? route.trafficMinutes : route.minutes;
      var label = route.trafficMinutes != null
        ? 'About ' + Math.round(mins) + ' min in current traffic'
        : 'About ' + Math.round(mins) + ' min drive';
      meta.textContent = label + ' \u00b7 ' + milesTxt + (route.roundTrip ? ' each way' : '');
      wrap.appendChild(mapEl);
      wrap.appendChild(meta);
      log.appendChild(wrap);
      try {
        var map = new maps.Map(mapEl, {
          disableDefaultUI: true, zoomControl: true,
          clickableIcons: false, gestureHandling: 'cooperative'
        });
        if (maps.TrafficLayer) new maps.TrafficLayer().setMap(map);
        var renderer = new maps.DirectionsRenderer({ map: map, suppressInfoWindows: true });
        renderer.setDirections(route.result);
      } catch (e) {
        wrap.remove();
        return;
      }
      log.scrollTop = log.scrollHeight;
    }).catch(function () { /* the text-only estimate stands */ });
  }

  function measureTrip() {
    return loadMaps().then(function (maps) {
      return Promise.all([geocode(maps, flow.pickup, 'pickup'), geocode(maps, flow.dropoff, 'dropoff')])
        .then(function (geo) {
          var from = geo[0], to = geo[1];
          return directionsMiles(maps, from.formatted, to.formatted).then(function (out) {
            // Keep the outbound route for the traffic map shown
            // under the estimate (raw Directions result + timings).
            flow.route = {
              result: out.result, miles: out.miles, minutes: out.minutes,
              trafficMinutes: out.trafficMinutes, roundTrip: flow.tripType === 'ROUND_TRIP'
            };
            var payload = {
              pickup: flow.pickup, dropoff: flow.dropoff,
              service: flow.service, tripType: flow.tripType,
              date: flow.date, time: flow.time,
              loadedMiles: out.miles, durationMinutes: out.minutes,
              pickupState: from.state, dropoffState: to.state,
              pickupLat: from.lat, pickupLng: from.lng,
              dropoffLat: to.lat, dropoffLng: to.lng
            };
            // Kept on the flow so a completed estimate can be
            // remembered verbatim for follow-up re-prices.
            flow.lastPayload = payload;
            if (flow.tripType === 'ROUND_TRIP') {
              return directionsMiles(maps, to.formatted, from.formatted).then(
                function (back) { payload.returnMiles = back.miles; return payload; },
                function () { return payload; }
              );
            }
            return payload;
          });
        });
    });
  }

  function maybeResubmit() {
    // After a repaired address, everything else may already be collected.
    if (flow.pickup && flow.dropoff && flow.service && flow.tripType && flow.date && flow.time) {
      submitEstimate();
      return true;
    }
    return false;
  }

  function advanceFlow(q) {
    var lower = q.toLowerCase();
    if (/^(cancel|stop|quit|exit|never ?mind)\b/.test(lower)) { cancelFlow(); return; }
    if (flow.step === 'pickup' || flow.step === 'dropoff') {
      var which = flow.step;
      if (q.length < 6) { addMessage('That looks a bit short \u2014 could you give me a street address with city and state, or a place name like \u201cCostco in Germantown\u201d?', 'bot'); return; }
      if (looksLikeStreetAddress(q)) { acceptRawAddress(which, q); return; }
      resolvePlace(which, q);
      return;
    }
    if (flow.step === 'placePickup' || flow.step === 'placeDropoff') {
      // A typed reply while place choices are showing is a fresh
      // attempt at the same end of the trip: resolve it the same way.
      var pwhich = flow.step === 'placePickup' ? 'pickup' : 'dropoff';
      if (q.length < 6) { addMessage('Tap one of the places above, or type a street address or a more specific place name.', 'bot'); return; }
      if (looksLikeStreetAddress(q)) { acceptRawAddress(pwhich, q); return; }
      resolvePlace(pwhich, q);
      return;
    }
    if (flow.step === 'service') {
      var svc = parseService(q);
      if (!svc) { addMessage('Please tap a ride type above, or type one: ambulatory, wheelchair, stretcher, bariatric, or ambulance.', 'bot'); return; }
      setService(svc);
      return;
    }
    if (flow.step === 'tripType') {
      var tt = parseTripType(q);
      if (!tt) { addMessage('Please tap One way or Round trip above, or type it.', 'bot'); return; }
      setTripType(tt);
      return;
    }
    if (flow.step === 'datetime') {
      var dt = parseDateTime(q);
      if (!dt || (dt.timeOnly && !flow.pendingDate)) {
        addMessage('I couldn\u2019t read that date and time. Try something like \u201cFriday at 10:30 AM\u201d, \u201ctomorrow at 9 AM\u201d, or \u201cNov 8 at 2 PM\u201d.', 'bot');
        return;
      }
      if (dt.past) { addMessage('That date is in the past \u2014 what day should we pick you up?', 'bot'); return; }
      if (dt.dateOnly) {
        flow.pendingDate = dt.date;
        flow.step = 'timeOnly';
        addMessage(STEP_PROMPTS.timeOnly, 'bot');
        setPlaceholder('Pickup time, e.g. 10:30 AM\u2026');
        return;
      }
      flow.date = dt.timeOnly ? flow.pendingDate : dt.date;
      flow.time = dt.time;
      submitEstimate();
      return;
    }
    if (flow.step === 'timeOnly') {
      var t = extractTime(' ' + q.toLowerCase() + ' ');
      if (!t) { addMessage('What time should we pick you up? For example, \u201c10:30 AM\u201d or \u201c2 PM\u201d.', 'bot'); return; }
      flow.date = flow.pendingDate;
      flow.time = t;
      submitEstimate();
    }
  }

  function submitEstimate() {
    busy = true;
    send.disabled = true;
    var pending = showTyping();
    var startedAt = Date.now();
    measureTrip()
      .then(function (payload) {
        return fetch(ESTIMATE_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); });
      })
      .then(function (out) {
        if (out.res.ok && out.data && out.data.mode === 'out_of_area') {
          return afterThinking(startedAt, out.data.answer).then(function () {
            fillPending(pending, out.data.answer);
            endFlow();
          });
        }
        if (out.res.ok && out.data && out.data.mode === 'estimate' && out.data.answer) {
          return afterThinking(startedAt, out.data.answer).then(function () {
          fillPendingEstimate(pending, out.data.answer, out.data.estimate, flow && flow.lastPayload);
          rememberEstimate(out.data.estimate);
          recordTurn('assistant', out.data.answer);
          addEstimateActions();
          renderRouteMap(flow && flow.route);
          log.scrollTop = log.scrollHeight;
          endFlow();
          return;
          });
        }
        if (out.data && out.data.error) {
          fillPending(pending, out.data.error + ' You can also get the exact quote in the booking app at ' + BOOKING_URL + ', or call ' + MAIN_PHONE + '.');
          endFlow();
          return;
        }
        throw { code: 'server' };
      })
      .catch(function (err) {
        if (err && err.code === 'geocode') {
          var which = err.which === 'dropoff' ? 'dropoff' : 'pickup';
          flow.geoFails[which] += 1;
          if (flow.geoFails[which] >= 2) {
            fillPending(pending, 'I still can\u2019t find that address, so I can\u2019t work out the distance. Please call us at ' + MAIN_PHONE + ' and the team will quote the trip, or book online at ' + BOOKING_URL + '.');
            endFlow();
            return;
          }
          fillPending(pending, 'I couldn\u2019t find the ' + (which === 'pickup' ? 'pickup' : 'drop-off') + ' address \u2014 could you check it and enter it again, with the city and state?');
          flow.step = which;
          flow[which + 'Place'] = null;
          renderChips();
          setPlaceholder(which === 'pickup' ? 'Pickup address\u2026' : 'Drop-off address\u2026');
          return;
        }
        fillPending(pending, 'I couldn\u2019t finish the estimate just now. You can get the exact quote in the booking app at ' + BOOKING_URL + ', or call ' + MAIN_PHONE + ' and the team will quote it.');
        endFlow();
      })
      .finally(function () {
        busy = false;
        send.disabled = false;
        headAvatar.src = WAITING_GIF;
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  // ------------------------------------------------------------- dispatch
  var EMERGENCY_RE = /\b(911|emergency|hurt|injur|unconscious|not breathing|chest pain|heart attack|stroke|bleed|accident|dying|overdose|choking|seizure|suicide|passed out|collapsed|unresponsive)\b/i;
  var PRICE_RE = /(cost|price|pricing|how much|fare|rates?|charge|quote|fees?|expensive|afford|per mile)|\bestimates?\b/i;

  // Narrow client-side mirror of the server's follow-up detection
  // (netlify/functions/_shared/visitor-conversation.cjs). With a
  // priced trip in memory, a message that reads as a one-change
  // follow-up goes to the assistant — which re-prices the stored
  // trip — instead of restarting the wizard on the price keywords it
  // happens to contain ("for the same, what would be the PRICE for
  // stretcher"). The server detector is authoritative; this only
  // routes, and anything it misses still reaches the assistant
  // through the normal Q&A path below whenever it has no price words.
  function looksLikeFollowUp(q) {
    if (!lastEstimate) return false;
    var t = ' ' + q.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ') + ' ';
    var trimmed = t.trim();
    if (/^(start over|start again|new estimate|another estimate|new trip|another trip|different trip|forget it|forget that)\b/.test(trimmed)) return true;
    if (/\b(same|instead|switch|change|different|new)\b/.test(t) && /\b(pick ?up|drop ?off|dropoff|address|location)\b/.test(t)) return true;
    var kb = /\b(do you|does|can i|can we|can you|how do|how does|what is|what are|tell me|is there|are there|are you)\b/.test(t);
    var strong = /\b(same|instead|for the same)\b/.test(t);
    if (/\b(wheelchair|stretcher|bariatric|ambulance|ambulatory|sedan|bls)\b/.test(t) &&
        (strong || /\b(price|cost|quote|fare) for\b/.test(t) || /\bwhat (about|if)\b/.test(t) || /\bas an?\b/.test(t) || /\bin an?\b/.test(t))) return true;
    if (/\bwhat if\b/.test(t)) return true;
    if ((/\bround[ -]?trip\b/.test(t) || /\bone[ -]?way\b/.test(t)) && (!kb || strong || /\bback to\b/.test(t) || trimmed.length <= 60)) return true;
    if (/\b(tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/.test(t) && (strong || /\bwhat (about|if)\b/.test(t))) return true;
    return false;
  }

  function handleUserText(raw) {
    var q = String(raw || '').trim();
    if (!q || busy) return;
    input.value = '';
    // The visitor has asked something: clear the suggestion chips out
    // of the way so the answer is fully visible when it lands.
    if (!suggestionsHidden) { suggestionsHidden = true; renderChips(); }
    if (EMERGENCY_RE.test(q)) {
      // Emergencies always win; abandon any estimate in progress and
      // let the server's safety path answer.
      if (flow) endFlow();
      pendingAddressClarify = false;
      ask(q);
      return;
    }
    if (flow) { addMessage(q, 'user'); advanceFlow(q); return; }
    if (pendingAddressClarify) {
      // The assistant asked "pickup or drop-off?" for an address
      // change; read the reply as "<end>, <address>" (address may
      // come with it or follow as the seeded step's answer).
      var m = q.match(/^(pick ?up|drop[ -]?off|dropoff)\b[:,]?\s*(.*)$/i);
      pendingAddressClarify = false;
      if (m && lastEstimate) {
        addMessage(q, 'user');
        var whichC = /drop/i.test(m[1]) ? 'dropoff' : 'pickup';
        var addr = m[2] && m[2].trim().length >= 6 ? m[2].trim() : null;
        startAddressChange(whichC, addr);
        if (!addr) addMessage('Got it \u2014 what\u2019s the new ' + (whichC === 'pickup' ? 'pickup' : 'drop-off') + ' address? A street address with city and state works, or a place name like \u201cCostco in Germantown\u201d.', 'bot');
        return;
      }
      ask(q);
      return;
    }
    if (looksLikeFollowUp(q)) { ask(q); return; }
    if (PRICE_RE.test(q)) { addMessage(q, 'user'); startEstimateFlow(); return; }
    ask(q);
  }

  renderChips();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    handleUserText(input.value);
  });
})();
