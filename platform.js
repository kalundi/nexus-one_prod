const nexusAnalyticsPages=new Set([
  '/accessibility.html','/about-nexus-medical-transit.html','/booking-app.html',
  '/career-application.html','/careers.html','/contact-service-areas.html',
  '/dialysis-transportation.html','/hospital-discharge-transportation.html',
  '/livecare.html','/maryland-medical-transportation.html',
  '/northern-virginia-medical-transportation.html','/stretcher-transportation.html',
  '/washington-dc-medical-transportation.html','/wheelchair-transportation.html'
]);
const nexusAnalyticsPath=location.pathname.endsWith('.html')?location.pathname:`${location.pathname}.html`;
if(nexusAnalyticsPages.has(nexusAnalyticsPath)){
  const nexusAnalyticsScript=document.createElement('script');
  nexusAnalyticsScript.src='/nexus-analytics.js';
  document.head.appendChild(nexusAnalyticsScript);
}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
(function(){
  const POPUP_ID='nexusGlobalTripPopup';
  function showTripPopup({title='Trip created', message='Your trip request has been received.', detail='', accent='#0f766e', duration=5000}={}){
    if(typeof document==='undefined' || !document.body) return;
    const existing=document.getElementById(POPUP_ID);
    if(existing) existing.remove();

    const overlay=document.createElement('div');
    overlay.id=POPUP_ID;
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-live','assertive');
    overlay.setAttribute('aria-label',title);
    overlay.style.cssText='position:fixed;inset:0;background:rgba(2,17,31,.78);display:flex;align-items:center;justify-content:center;padding:24px;z-index:2147483647;';

    const card=document.createElement('div');
    card.style.cssText=`max-width:min(640px,100%);width:100%;padding:30px 28px 24px;border-radius:24px;background:linear-gradient(145deg,#ffffff,#f2f7fb);box-shadow:0 40px 90px rgba(2,12,24,.36);border:1px solid rgba(255,255,255,.8);text-align:center;`;
    card.innerHTML=`
      <div style="width:74px;height:74px;border-radius:999px;margin:0 auto 16px;display:grid;place-items:center;background:${accent};color:#fff;font-size:34px;font-weight:900;box-shadow:0 16px 36px rgba(15,23,42,.14)">✓</div>
      <h2 style="margin:0 0 10px;font:800 28px/1.15 Manrope,sans-serif;color:#071c2d">${String(title||'Trip created').replace(/</g,'&lt;')}</h2>
      <p style="margin:0 0 10px;font-size:17px;line-height:1.55;color:#23404f">${String(message||'Your trip request has been received.').replace(/</g,'&lt;')}</p>
      ${detail?`<p style="margin:0 0 18px;font-size:15px;line-height:1.45;color:#5b7385">${String(detail).replace(/</g,'&lt;')}</p>`:''}
      <button type="button" data-close-popup style="border:0;border-radius:999px;padding:10px 18px;background:${accent};color:#fff;font:800 14px/1 Manrope,sans-serif;cursor:pointer;box-shadow:0 10px 24px rgba(15,23,42,.14)">Close</button>
    `;

    card.querySelector('[data-close-popup]')?.addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',event=>{if(event.target===overlay) overlay.remove();});
    document.body.appendChild(overlay);

    const close=()=>overlay.remove();
    const handleKey=(event)=>{if(event.key==='Escape'){close(); document.removeEventListener('keydown',handleKey);}};
    document.addEventListener('keydown',handleKey);
    if(Number(duration)>0){window.setTimeout(()=>{close();document.removeEventListener('keydown',handleKey);},Number(duration));}
  }

  window.NexusTripPopup={show:showTripPopup};
})();
function ensureGlobalAccessWidget(){
	if(typeof document==='undefined' || !document.body) return;
	if(document.getElementById('accessToggle') && document.getElementById('accessPanel')) return;
	const root=document.createElement('div');
	root.className='access';
	root.innerHTML=''
		+ '<button id="accessToggle" class="section508Button" type="button" aria-expanded="false" aria-controls="accessPanel" aria-label="Open Section 508 accessibility options">'
		+ '<span aria-hidden="true">&#9855;</span><span aria-hidden="true">508</span>'
		+ '</button>'
		+ '<div id="accessPanel" class="accessPanel" hidden>'
		+ '<strong>Accessibility</strong>'
		+ '<button id="large" type="button">Larger text</button>'
		+ '<button id="contrast" type="button">High contrast</button>'
		+ '<button id="motion" type="button">Reduce motion</button>'
		+ '</div>';
	document.body.appendChild(root);
}

ensureGlobalAccessWidget();

const access=$('#accessToggle'),panel=$('#accessPanel');
if(access && panel){
	const accessIcon=access.querySelector('span[aria-hidden="true"]');
	if(accessIcon&&String(accessIcon.textContent||'').includes('â™¿')) accessIcon.textContent='♿';
	const accessRoot=access.closest('.access') || access.parentElement;
	let accessPinnedOpen=false;
	const setAccessOpen=(open)=>{
		panel.classList.toggle('open',open);
		panel.hidden=!open;
		access.setAttribute('aria-expanded',String(open));
	};

	// Ensure a consistent closed default state on load.
	setAccessOpen(false);

	access.addEventListener('click',(event)=>{
		event.preventDefault();
		accessPinnedOpen=!accessPinnedOpen;
		setAccessOpen(accessPinnedOpen);
	});
	const openFromHover=()=>setAccessOpen(true);
	const closeFromHover=()=>{
		if(accessPinnedOpen) return;
		setAccessOpen(false);
	};
	access.addEventListener('mouseenter',openFromHover);
	access.addEventListener('focus',()=>setAccessOpen(true));
	panel.addEventListener('mouseenter',openFromHover);
	access.addEventListener('mouseleave',closeFromHover);
	panel.addEventListener('mouseleave',closeFromHover);
	accessRoot?.addEventListener('pointerleave',closeFromHover);

	document.addEventListener('click',(event)=>{
		if(!panel.classList.contains('open')) return;
		if(accessRoot && accessRoot.contains(event.target)) return;
		accessPinnedOpen=false;
		setAccessOpen(false);
	});
	document.addEventListener('keydown',(event)=>{
		if(event.key==='Escape'){
			accessPinnedOpen=false;
			setAccessOpen(false);
		}
	});
}
$('#large')?.addEventListener('click',()=>document.body.classList.toggle('large'));
$('#contrast')?.addEventListener('click',()=>document.body.classList.toggle('contrast'));
$('#motion')?.addEventListener('click',()=>document.body.classList.toggle('reduce'));
// Global mobile nav toggle
(function(){var toggle=document.querySelector('.mobileNavToggle');if(!toggle)return;var nav=document.querySelector('.globalLinks');if(!nav)return;toggle.addEventListener('click',function(){var open=!nav.classList.contains('open');nav.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');});nav.addEventListener('click',function(e){if(e.target.tagName==='A'&&window.innerWidth<=950){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}});})();
$$('[data-api-list]').forEach(async el=>{try{const endpoint=el.dataset.apiList;if(!endpoint) return;const key=sessionStorage.getItem('nexusAdminKey')||'';const r=await fetch(endpoint,{headers:{'x-admin-key':key}});if(r.status===401){el.innerHTML='<p>Enter the operations key to load live data.</p>';return}if(!r.ok){console.warn('[NEXUS] API fetch failed:',r.status,endpoint);el.innerHTML='<p>Live data is unavailable.</p>';return}const j=await r.json();el.dispatchEvent(new CustomEvent('nexus-data',{detail:j}));}catch(e){console.error('[NEXUS] API error:',e);if(el.innerHTML==='') el.innerHTML='<p>Live data is unavailable.</p>';}});

// Apply the red sign design to all Book A Ride triggers.
(function(){
	const CLASS_NAME='bookRideSign';
	const SELECTOR='a, button, [role="button"]';
	const KNOWN_SERVICES=[
		{key:'facility_transfer_critical',test:/\b(high\s*acuity|critical\s*ift|critical\s*care\s*transfer)\b/i},
		{key:'als2',test:/\b(als\s*ii|als\s*2|advanced\s*life\s*support\s*ii)\b/i},
		{key:'als1',test:/\b(als\s*i|als\s*1|advanced\s*life\s*support\s*i)\b/i},
		{key:'bls',test:/\b(bls|basic\s*life\s*support|ambulance)\b/i},
		{key:'bariatric',test:/\bbariatric\b/i},
		{key:'stretcher',test:/\bstretcher\b/i},
		{key:'broda',test:/\bbroda\b/i},
		{key:'wheelchair',test:/\bwheel\s*chair|wheelchair\b/i},
		{key:'facility_transfer',test:/\b(facility\s*(to|-)\s*facility|inter\s*facility|\bift\b|routine\s*ift)\b/i},
		{key:'ambulatory',test:/\bambulatory|walking\b/i}
	];

	function normalizeService(value){
		const raw=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
		if(!raw)return '';
		if(raw==='wheel_chair')return 'wheelchair';
		if(raw==='routine_ift'||raw==='ift_routine'||raw==='interfacility'||raw==='inter_facility')return 'facility_transfer';
		if(raw==='critical_ift'||raw==='high_acuity_ift'||raw==='critical_care_transfer')return 'facility_transfer_critical';
		if(raw==='als_ii'||raw==='als2')return 'als2';
		if(raw==='als_i'||raw==='als1')return 'als1';
		return raw;
	}

	function parseServiceFromText(text){
		for(const rule of KNOWN_SERVICES){
			if(rule.test.test(text)) return rule.key;
		}
		return '';
	}

	function inferServiceFromElement(el){
		if(!el)return '';
		const attrs=[
			el.getAttribute('data-service'),
			el.getAttribute('data-book-service'),
			el.getAttribute('data-transport'),
			el.getAttribute('data-service-type'),
			el.getAttribute('data-ride-type'),
			el.getAttribute('href'),
			el.getAttribute('aria-label'),
			el.getAttribute('title'),
			el.className,
			el.id,
			el.textContent
		].map(v=>String(v||'')).filter(Boolean);

		for(const candidate of attrs){
			const normalized=normalizeService(candidate);
			if(normalized && KNOWN_SERVICES.some(rule=>rule.key===normalized)) return normalized;
			const parsed=parseServiceFromText(candidate);
			if(parsed) return parsed;
		}

		const scope=el.closest('[data-service],[data-transport],article,section,.card,.serviceCard,.roleCard,.moduleHero,.heroPanel');
		const scopeText=String(scope?.textContent||'').replace(/\s+/g,' ').slice(0,900);
		return parseServiceFromText(scopeText);
	}

	function buildBookingUrl(el){
		const service=inferServiceFromElement(el);
		if(!service) return '/booking-app.html';
		return `/booking-app.html?service=${encodeURIComponent(service)}`;
	}

	window.NexusBookingIntent={
		inferServiceFromElement,
		buildBookingUrl,
		normalizeService
	};

	function isBookRideControl(el){
		if(!el) return false;
		const text=(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
		const href=(el.getAttribute('href')||'').toLowerCase();
		return text.includes('book a ride') ||
			el.classList.contains('bookRide') ||
			el.classList.contains('bookRideCta') ||
			el.classList.contains('facilityBookRide') ||
			el.getAttribute('data-book-ride') !== null ||
			(el.classList.contains('navCta') && href.includes('booking-app'));
	}

	function applyBookRideSign(root){
		(root || document).querySelectorAll(SELECTOR).forEach(el=>{
			if(!isBookRideControl(el)) return;
			el.classList.add(CLASS_NAME);
			if(el.tagName==='A'){
				el.setAttribute('href',buildBookingUrl(el));
			}
		});
	}

	applyBookRideSign(document);

	const observer=new MutationObserver(records=>{
		for(const record of records){
			record.addedNodes.forEach(node=>{
				if(node.nodeType!==1) return;
				if(node.matches && node.matches(SELECTOR) && isBookRideControl(node)){
					node.classList.add(CLASS_NAME);
				}
				if(node.querySelectorAll){
					applyBookRideSign(node);
				}
			});
		}
	});
	observer.observe(document.documentElement,{childList:true,subtree:true});
})();

// Keep footer consistent across all portal pages that load platform.js.
(function(){
	const STYLE_ID='nexusUnifiedFooterStyle';

	function ensureStyle(){
		if(document.getElementById(STYLE_ID)) return;
		const style=document.createElement('style');
		style.id=STYLE_ID;
		style.textContent=`
.footer.footerUnified{position:relative;margin-top:24px;padding:0 !important;background:linear-gradient(180deg,#082f49 0%,#07283f 100%);color:#d4e5f1;border-top:1px solid rgba(255,255,255,.12);}
.footer.footerUnified::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,#28b0e8 0%,#67e8f9 35%,#22c55e 70%,#f97316 100%);opacity:.75;pointer-events:none;}
.footer.footerUnified .shell{width:min(1280px,calc(100% - 40px)) !important;}
.footer.footerUnified .footerGrid{display:grid;grid-template-columns:minmax(220px,1.25fr) minmax(150px,.9fr) minmax(210px,1fr) minmax(150px,.75fr);gap:18px 24px;padding:14px 0 10px !important;align-items:stretch;align-content:start;}
.footer.footerUnified .footerGrid>div{min-width:0;}
.footer.footerUnified .footerGrid>div:not(.footerBrandCompact){padding-left:0;}
.footer.footerUnified .footerBrandCompact{display:grid;align-content:start;gap:6px;border-right:2px solid #fff;padding-right:clamp(12px,1.8vw,24px);margin-right:clamp(6px,1vw,14px);}
.footer.footerUnified .footerBrandCompact .footerLogo{width:clamp(182px,18vw,240px);height:auto;max-width:100%;display:block;margin:0 0 6px;}
.footer.footerUnified .footerBrandCompact p{margin:4px 0 0;border-top:2px solid #fff;padding-top:10px;max-width:26ch;font-size:15px !important;font-weight:800;line-height:1.3;color:#fff !important;}
.footer.footerUnified .footerGrid h4,.footer.footerUnified .footerGrid strong{margin:0 0 4px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#f2f8fc;font-weight:800;}
.footer.footerUnified .footerGrid p,.footer.footerUnified .footerGrid span,.footer.footerUnified .footerGrid small{color:#b4cadd;font-size:13px;line-height:1.45;}
.footer.footerUnified .footerGrid a,.footer.footerUnified .footerGrid button{color:#deecf6 !important;font-size:13px;line-height:1.28;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;max-width:100%;}
.footer.footerUnified .footerGrid a:hover,.footer.footerUnified .footerGrid button:hover{color:#fff !important;}
.footer.footerUnified .footerBottom{border-top:1px solid rgba(255,255,255,.14);padding:8px 0 12px !important;color:#9fb8cc;font-size:12px;overflow-wrap:anywhere;word-break:break-word;}
.footer.footerUnified .footerCompactNav{display:grid;gap:3px;}
.footer.footerUnified .footerCompactNav a{display:block;}
.footer.footerUnified .footerContactList{display:grid;gap:3px;margin:0;padding:0;list-style:none;}
.footer.footerUnified .footerContactItem{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:start;gap:5px;color:#cce0ef;font-size:13px;line-height:1.18;}
.footer.footerUnified .footerContactBody{display:grid;gap:1px;min-width:0;}
.footer.footerUnified .footerContactBody a,.footer.footerUnified .footerContactBody span{display:block;min-width:0;overflow-wrap:anywhere;word-break:break-word;}
.footer.footerUnified .footerContactBody a{font-weight:700;color:#f4fbff !important;}
.footer.footerUnified .footerContactIcon{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:999px;background:rgba(255,255,255,.12);font-size:10px;color:#fff;margin-top:1px;}
.footer.footerUnified .footerContactIcon svg,.footer.footerUnified .footerSocial a svg,.footer.footerUnified .footerFollowMetaIcon svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.footer.footerUnified .footerSocial{display:flex;flex-wrap:wrap;gap:6px;margin-top:0;}
.footer.footerUnified .footerFollow{display:grid;gap:6px;align-content:start;}
.footer.footerUnified .footerFollowMeta{display:grid;gap:2px;margin-top:0;color:#b4cadd;font-size:13px;line-height:1.2;}
.footer.footerUnified .footerFollowMetaRow{display:grid;grid-template-columns:14px minmax(0,1fr);gap:6px;align-items:start;}
.footer.footerUnified .footerFollowMeta a{color:#deecf6 !important;font-weight:700;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;}
.footer.footerUnified .footerFollowMetaIcon{display:inline-grid;place-items:center;width:14px;height:14px;margin-top:1px;color:#fff;}
.footer.footerUnified .footerFollow p{margin:0;color:#b4cadd;}
.footer.footerUnified .footerSocial a{width:26px;height:26px;border-radius:999px;border:1px solid rgba(255,255,255,.2);display:inline-grid;place-items:center;background:rgba(255,255,255,.06);color:#f4fbff !important;font-weight:800;font-size:11px;transition:transform .18s ease,background-color .18s ease,border-color .18s ease;}
.footer.footerUnified .footerSocial a:hover{transform:translateY(-1px);background:rgba(103,232,249,.2);border-color:rgba(103,232,249,.65);}
.footer.footerUnified .footerSocial a[aria-label="YouTube"] svg,.footer.footerUnified .footerSocial a[aria-label="TikTok"] svg,.footer.footerUnified .footerSocial a[aria-label="Instagram"] svg,.footer.footerUnified .footerSocial a[aria-label="Facebook"] svg,.footer.footerUnified .footerSocial a[aria-label="Bluesky"] svg{fill:currentColor;stroke:none;}main>section.section{padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important;}main>section.section+section.section{margin-top:0!important;}
@media (max-width:980px){.footer.footerUnified .shell{width:min(1280px,calc(100% - 28px)) !important;}.footer.footerUnified .footerGrid{grid-template-columns:1fr 1fr;gap:12px 16px;padding:12px 0 8px !important;}.footer.footerUnified .footerGrid>div:first-child{grid-column:1 / -1;}.footer.footerUnified .footerBrandCompact{border-right:0;padding-right:0;margin-right:0;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.16);}.footer.footerUnified .footerBrandCompact .footerLogo{width:clamp(150px,34vw,190px);}.footer.footerUnified .footerBrandCompact p{font-size:14px !important;max-width:32ch;}}
@media (max-width:620px){.footer.footerUnified{margin-top:6px;}.footer.footerUnified .shell{width:calc(100% - 20px) !important;}.footer.footerUnified .footerGrid{grid-template-columns:.93fr 1.07fr;gap:0;padding:6px 0 2px !important;}.footer.footerUnified .footerGrid>div{padding:8px 0;border:0;border-radius:0;background:none;}.footer.footerUnified .footerGrid>div:first-child,.footer.footerUnified .footerGrid>div:nth-child(4){grid-column:auto;}.footer.footerUnified .footerGrid>div:nth-child(3),.footer.footerUnified .footerGrid>div:nth-child(4){border-top:1px solid rgba(255,255,255,.1);}.footer.footerUnified .footerGrid>div:nth-child(2),.footer.footerUnified .footerGrid>div:nth-child(4){border-left:2px solid rgba(255,255,255,.22);padding-left:8px;margin-left:8px;}.footer.footerUnified .footerBrandCompact{justify-items:center;text-align:center;padding:0 8px 8px 0;margin-right:0;border-right:0;border-bottom:0;background:none;}.footer.footerUnified .footerBrandCompact .footerLogo{width:min(170px,56vw);margin:0 auto 6px;}.footer.footerUnified .footerBrandCompact p{max-width:24ch;font-size:13px !important;text-align:center;padding-top:8px;border-top:1px solid rgba(255,255,255,.2);}.footer.footerUnified .footerGrid h4,.footer.footerUnified .footerGrid strong{margin-bottom:8px;font-size:11px;letter-spacing:.12em;}.footer.footerUnified .footerCompactNav{gap:2px;}.footer.footerUnified .footerCompactNav a{padding:6px 0;}.footer.footerUnified .footerContactList{gap:8px;}.footer.footerUnified .footerContactItem{grid-template-columns:18px minmax(0,1fr);gap:10px;}.footer.footerUnified .footerContactIcon{width:18px;height:18px;background:rgba(255,255,255,.08);}.footer.footerUnified .footerSocial{justify-content:flex-start;gap:8px;}.footer.footerUnified .footerSocial a{width:32px;height:32px;font-size:11px;background:rgba(255,255,255,.05);}.footer.footerUnified .footerFollow{justify-items:start;text-align:left;padding-right:0;}.footer.footerUnified .footerFollow p{max-width:26ch;}.footer.footerUnified .footerFollowMeta{width:100%;gap:6px;text-align:left;}.footer.footerUnified .footerFollowMeta a{padding:0;background:none;border-radius:0;}.footer.footerUnified .footerFollowMeta>span,.footer.footerUnified .footerFollowMetaRow{padding:0;background:none;border-radius:0;}.footer.footerUnified .footerBottom{padding:4px 0 6px !important;text-align:left;line-height:1.45;}}
@media (max-width:340px){.footer.footerUnified .footerGrid{grid-template-columns:1fr;}.footer.footerUnified .footerGrid>div:nth-child(3){border-left:0;padding-left:0;margin-left:0;}}
		`;
		document.head.appendChild(style);
	}

	function normalizeFooter(){
		const footer=document.querySelector('footer.footer');
		if(!footer) return false;
		const grid=footer.querySelector('.footerGrid');
		if(!grid) return false;
		footer.classList.add('footerUnified');
		grid.dataset.unifiedFooterApplied='1';
		grid.innerHTML=''
			+ '<div class="footerBrandCompact">'
			+   '<img class="logo footerLogo" src="./nexus-footer-logo.png" alt="Nexus Medical Transit">'
			+   '<p>Mission: Access drives equity through safe, compassionate medical transportation.</p>'
			+ '</div>'
			+ '<div>'
			+   '<strong>Navigation</strong>'
			+   '<div class="footerCompactNav">'
			+     '<a href="/#services">Services</a>'
			+     '<a href="/about-nexus-medical-transit.html">About</a>'
			+     '<a href="/contact-service-areas.html">Contact and Areas</a>'
			+     '<a href="/careers.html">Careers</a>'
			+     '<a href="/livecare.html">Livecare</a>'
			+   '</div>'
			+ '</div>'
			+ '<div>'
			+   '<strong>Contact</strong>'
			+   '<ul class="footerContactList">'
			+     '<li class="footerContactItem"><span class="footerContactIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.65a16 16 0 0 0 6.35 6.35l1.2-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path></svg></span><div class="footerContactBody"><span>Main Toll Free:</span><a href="tel:+18886395766">888-639-5766</a></div></li>'
			+     '<li class="footerContactItem"><span class="footerContactIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.65a16 16 0 0 0 6.35 6.35l1.2-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path></svg></span><div class="footerContactBody"><span>Customer Service:</span><a href="tel:+18887604990">888-760-4990</a></div></li>'
			+     '<li class="footerContactItem"><span class="footerContactIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.65a16 16 0 0 0 6.35 6.35l1.2-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path></svg></span><div class="footerContactBody"><span>Regional DC:</span><a href="tel:+12023159253">202-315-9253</a></div></li>'
			+     '<li class="footerContactItem"><span class="footerContactIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.65a16 16 0 0 0 6.35 6.35l1.2-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path></svg></span><div class="footerContactBody"><span>Regional MD:</span><a href="tel:+12403947089">240-394-7089</a></div></li>'
			+   '</ul>'
			+ '</div>'
			+ '<div class="footerFollow">'
			+   '<strong>Follow</strong>'
			+   '<p>Stay connected with Nexus Medical Transit.</p>'
			+   '<div class="footerSocial" aria-label="Social media">'
			+     '<a href="https://www.youtube.com/@nexus_m_t" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M21.8 8.2a3 3 0 0 0-2.1-2.1C17.8 5.6 12 5.6 12 5.6s-5.8 0-7.7.5A3 3 0 0 0 2.2 8.2 31.8 31.8 0 0 0 1.8 12a31.8 31.8 0 0 0 .4 3.8 3 3 0 0 0 2.1 2.1c1.9.5 7.7.5 7.7.5s5.8 0 7.7-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.4.4-3.8s-.1-2.8-.4-3.8z"></path><path d="M10 15.2V8.8L15.5 12 10 15.2z"></path></svg></a>'
			+     '<a href="https://www.tiktok.com/@nexus_m_t" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><svg viewBox="0 0 24 24"><path d="M14 3c.4 2.8 2 4.4 4.8 4.8v3.1c-1.7 0-3.3-.5-4.8-1.5v5.5a5.1 5.1 0 1 1-5.1-5.1c.2 0 .5 0 .7.1v3.2a2 2 0 1 0 1.6 2V3h2.8z"></path></svg></a>'
			+     '<a href="https://www.instagram.com/nexus_m_t/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2zm0 1.8A3 3 0 1 1 9 12a3 3 0 0 1 3-3zm5.2-2.5a1.2 1.2 0 1 0 1.2 1.2 1.2 1.2 0 0 0-1.2-1.2z"></path></svg></a>'
			+     '<a href="https://www.facebook.com/profile.php?id=61581462908206" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.2c0-.87.24-1.46 1.5-1.46h1.6V5.1c-.28-.04-1.23-.1-2.33-.1-2.3 0-3.87 1.4-3.87 4V11H8v3h2.4v8z"></path></svg></a>'
			+     '<a href="https://bsky.app/profile/nexusmt.bsky.social" target="_blank" rel="noopener noreferrer" aria-label="Bluesky"><svg viewBox="0 0 24 24"><path d="M12 11.7c-1.6-2.8-5.1-5.1-7.4-6.2C3.4 5 3 5.7 3 6.8c0 2.2 1.4 6.7 3.3 8.5 1 1 2.2 1.3 3.1.3.8-.8 1.2-1.9 1.6-2.9.4 1 .8 2.1 1.6 2.9.9 1 2.1.7 3.1-.3C17.6 13.5 19 9 19 6.8c0-1.1-.4-1.8-1.6-1.3-2.3 1.1-5.8 3.4-7.4 6.2z"></path></svg></a>'
			+   '</div>'
			+   '<div class="footerFollowMeta">'
			+     '<span>Normal Hours: Mon-Friday, 7 AM-7 PM</span>'
			+     '<span>24/7 Operations - After Hour Rides</span>'
			+     '<div class="footerFollowMetaRow"><span class="footerFollowMetaIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path><path d="m22 6-10 7L2 6"></path></svg></span><a href="mailto:contact@nexusmt.com">contact@nexusmt.com</a></div>'
			+   '</div>'
			+ '</div>';
		return true;
	}

	function boot(){
		ensureStyle();
		normalizeFooter();
	}

	if(document.readyState==='loading'){
		document.addEventListener('DOMContentLoaded',boot,{once:true});
	}else{
		boot();
	}

	// ===== Logo pop every 60 seconds =====
	const LOGO_POP_SELECTOR='img.logo, img.topLogo, img.brandLogo, img.loginLogo, img[src*="nexus-logo"], img[src*="nexus-footer-logo"], header img[alt*="Nexus"]';
	const LOGO_POP_STYLE_ID='nexusLogoPopStyle';
	function ensureLogoPopStyle(){
		if(document.getElementById(LOGO_POP_STYLE_ID)) return;
		const style=document.createElement('style');
		style.id=LOGO_POP_STYLE_ID;
		style.textContent='@keyframes logoPop{0%{transform:scale(1) rotate(0deg)}15%{transform:scale(1.28) rotate(-4deg)}30%{transform:scale(1.35) rotate(4deg)}50%{transform:scale(1.25) rotate(-2deg)}70%{transform:scale(1.12) rotate(1.5deg)}85%{transform:scale(1.05) rotate(-0.5deg)}100%{transform:scale(1) rotate(0deg)}}.logo-pop{animation:logoPop .8s cubic-bezier(.36,.07,.19,.97) both !important;transform-origin:center center}@media (prefers-reduced-motion:reduce){.logo-pop{animation:none!important}}';
		document.head.appendChild(style);
	}
	function popLogos(){
		ensureLogoPopStyle();
		const logos=document.querySelectorAll(LOGO_POP_SELECTOR);
		logos.forEach(logo=>{
			logo.classList.remove('logo-pop');
			void logo.offsetWidth; // force reflow to restart animation
			logo.classList.add('logo-pop');
			logo.addEventListener('animationend',()=>logo.classList.remove('logo-pop'),{once:true});
		});
	}
	setTimeout(()=>{ popLogos(); setInterval(popLogos,60000); },3000); // first pop 3s after load, then every 60s
})();

// ===== Standalone logo pop (runs independently of any IIFE) =====
(function nexusLogoPop(){
	const LOGO_POP_SELECTOR='img.logo, img.topLogo, img.brandLogo, img.loginLogo, img[src*="nexus-logo"], img[src*="nexus-footer-logo"], header img[alt*="Nexus"]';
	const LOGO_POP_STYLE_ID='nexusLogoPopStyle';
	function ensureLogoPopStyle(){
		if(document.getElementById(LOGO_POP_STYLE_ID)) return;
		const style=document.createElement('style');
		style.id=LOGO_POP_STYLE_ID;
		style.textContent='@keyframes logoPop{0%{transform:scale(1) rotate(0deg)}15%{transform:scale(1.28) rotate(-4deg)}30%{transform:scale(1.35) rotate(4deg)}50%{transform:scale(1.25) rotate(-2deg)}70%{transform:scale(1.12) rotate(1.5deg)}85%{transform:scale(1.05) rotate(-0.5deg)}100%{transform:scale(1) rotate(0deg)}}.logo-pop{animation:logoPop .8s cubic-bezier(.36,.07,.19,.97) both !important;transform-origin:center center}@media (prefers-reduced-motion:reduce){.logo-pop{animation:none!important}}';
		document.head.appendChild(style);
	}
	function popAll(){
		ensureLogoPopStyle();
		document.querySelectorAll(LOGO_POP_SELECTOR).forEach(function(el){
			el.classList.remove('logo-pop');
			void el.offsetWidth;
			el.classList.add('logo-pop');
			el.addEventListener('animationend',function(){ el.classList.remove('logo-pop'); },{once:true});
		});
	}
	// Fire on load, then every 60 seconds
	if(document.readyState==='loading'){
		document.addEventListener('DOMContentLoaded',function(){ popAll(); setInterval(popAll,60000); },{once:true});
	}else{
		popAll(); setInterval(popAll,60000);
	}
}());

// Shared focus deck: collapse sibling cards/sections and expand the selected one.
(function(){
	const STYLE_ID='nexusFocusDeckStyle';
	const ITEM_SELECTOR='.card, .section, .driverCard, .analyticsTile';
	const CONTAINER_SELECTOR='#dashView .padded, #inspectionView .padded, #manifestView .padded, #tripView .padded, #milesView .padded, #endView .padded, #changePasswordView .padded';
	const containers=new WeakSet();

	function ensureStyle(){
		if(document.getElementById(STYLE_ID)) return;
		const style=document.createElement('style');
		style.id=STYLE_ID;
		style.textContent=`
.nexusFocusDeck{align-content:start}
.nexusFocusDeck > .nexusFocusItem{transition:max-height .18s ease,opacity .18s ease,transform .18s ease,box-shadow .18s ease,padding .18s ease;overflow:hidden;cursor:pointer;transform-origin:center top;will-change:max-height,opacity,transform}
.nexusFocusDeck > .nexusFocusItem:not(.is-focused){max-height:112px;opacity:.82;transform:scale(.995);box-shadow:0 6px 14px rgba(0,0,0,.05)}
.nexusFocusDeck > .nexusFocusItem.is-focused{max-height:9999px;opacity:1;transform:none;box-shadow:0 14px 30px rgba(0,0,0,.10);z-index:1}
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) > *{pointer-events:none}
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .cardBody,
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .sectionBody,
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .cardFooter,
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .panelBody,
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .routeCardBody,
.nexusFocusDeck > .nexusFocusItem:not(.is-focused) .facilityPanelBody{display:none}
.nexusFocusDeck > .nexusFocusItem.is-focused .cardBody,
.nexusFocusDeck > .nexusFocusItem.is-focused .sectionBody,
.nexusFocusDeck > .nexusFocusItem.is-focused .cardFooter,
.nexusFocusDeck > .nexusFocusItem.is-focused .panelBody,
.nexusFocusDeck > .nexusFocusItem.is-focused .routeCardBody,
.nexusFocusDeck > .nexusFocusItem.is-focused .facilityPanelBody{display:block}
@media (prefers-reduced-motion:reduce){.nexusFocusDeck > .nexusFocusItem{transition:none}}
`;

		document.head.appendChild(style);
	}

	function directFocusItems(container){
		return Array.from(container.children).filter(child=>child.matches && child.matches(ITEM_SELECTOR));
	}

	function focusItem(container,item){
		const items=directFocusItems(container);
		if(items.length<2 || !items.includes(item)) return;
		items.forEach(entry=>{
			entry.classList.add('nexusFocusItem');
			entry.classList.toggle('is-focused',entry===item);
			entry.setAttribute('aria-expanded',String(entry===item));
		});
		container.classList.add('nexusFocusDeck');
	}

	function bindContainer(container){
		if(!container || containers.has(container)) return;
		if(container.id==='homePage') return;
		const items=directFocusItems(container);
		if(items.length<2) return;
		containers.add(container);
		container.classList.add('nexusFocusDeck');
		let active=items.find(item=>item.classList.contains('is-focused')) || items[0];
		focusItem(container,active);
		container.addEventListener('click',event=>{
			const target=event.target.closest(ITEM_SELECTOR);
			if(!target || target.parentElement!==container) return;
			focusItem(container,target);
		});
		container.addEventListener('keydown',event=>{
			if(event.key!=='Enter'&&event.key!==' ') return;
			const target=event.target.closest(ITEM_SELECTOR);
			if(!target || target.parentElement!==container) return;
			focusItem(container,target);
		});
	}

	function scan(){
		if(!document.getElementById('bookingForm') && !document.getElementById('dashView')) return;
		document.querySelectorAll(CONTAINER_SELECTOR).forEach(bindContainer);
	}

	function boot(){
		ensureStyle();
		scan();
	}

	if(document.readyState==='loading'){
		document.addEventListener('DOMContentLoaded',boot,{once:true});
	}else{
		boot();
	}

	const observer=new MutationObserver(()=>scan());
	observer.observe(document.documentElement,{childList:true,subtree:true});
}());

// ── Session inactivity timeout (non-driver pages only) ────────────────────
// If the authenticated user is inactive for 60 minutes, clear the session
// and redirect them to the login page. The driver app manages its own session
// and is excluded here (it uses /driver-app.html which doesn't load platform.js).
(function(){
  const TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
  const CHECK_MS   = 5  * 60 * 1000; // check every 5 minutes
  const TOKEN_KEY  = 'nexusAccessToken';
  const ACTIVITY_KEY = 'nexusLastActivity';

  // Only run when a session is active
  if (!sessionStorage.getItem(TOKEN_KEY)) return;

  function touch(){ localStorage.setItem(ACTIVITY_KEY, Date.now()); }
  function idle(){ return Date.now() - Number(localStorage.getItem(ACTIVITY_KEY)||0); }

  // Record activity on any interaction
  ['mousemove','keydown','click','touchstart','scroll'].forEach(ev =>
    document.addEventListener(ev, touch, { passive: true })
  );
  touch(); // record now as baseline

  setInterval(function(){
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return; // already signed out
    if (idle() > TIMEOUT_MS){
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem('nexusUser');
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.href = '/livecare.html?redirect=' + redirect + '&reason=timeout';
    }
  }, CHECK_MS);
}());
