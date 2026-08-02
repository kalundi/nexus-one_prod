const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const access=$('#accessToggle'),panel=$('#accessPanel');
if(access){access.addEventListener('click',()=>{const open=!panel.classList.contains('open');panel.classList.toggle('open',open);panel.hidden=!open;access.setAttribute('aria-expanded',String(open));});}
$('#large')?.addEventListener('click',()=>document.body.classList.toggle('large'));
$('#contrast')?.addEventListener('click',()=>document.body.classList.toggle('contrast'));
$('#motion')?.addEventListener('click',()=>document.body.classList.toggle('reduce'));
// Global mobile nav toggle
(function(){var toggle=document.querySelector('.mobileNavToggle');if(!toggle)return;var nav=document.querySelector('.globalLinks');if(!nav)return;toggle.addEventListener('click',function(){var open=!nav.classList.contains('open');nav.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');});nav.addEventListener('click',function(e){if(e.target.tagName==='A'&&window.innerWidth<=950){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}});})();
$$('[data-api-list]').forEach(async el=>{const endpoint=el.dataset.apiList;const key=sessionStorage.getItem('nexusAdminKey')||'';try{const r=await fetch(endpoint,{headers:{'x-admin-key':key}});if(r.status===401){el.innerHTML='<p>Enter the operations key to load live data.</p>';return}const j=await r.json();el.dispatchEvent(new CustomEvent('nexus-data',{detail:j}));}catch{el.innerHTML='<p>Live data is unavailable.</p>'}});

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
		if(grid.dataset.unifiedFooterApplied==='1') return true;
		grid.dataset.unifiedFooterApplied='1';
		grid.innerHTML=''
			+ '<div class="footerBrandCompact">'
			+   '<img class="logo footerLogo" src="./nexus-footer-logo.png" alt="Nexus Medical Transit">'
			+   '<p>Mission: Access drives equity through safe, compassionate medical transportation.</p>'
			+ '</div>'
			+ '<div>'
			+   '<strong>Navigation</strong>'
			+   '<div class="footerCompactNav">'
			+     '<a href="#services">Services</a>'
			+     '<a href="#patient-experience">Experience</a>'
			+     '<a href="#coverage">Coverage</a>'
			+     '<a href="/livecare.html">Livecare</a>'
			+   '</div>'
			+ '</div>'
			+ '<div>'
			+   '<strong>Contact</strong>'
			+   '<ul class="footerContactList">'
			+     '<li class="footerContactItem"><span class="footerContactIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.65a16 16 0 0 0 6.35 6.35l1.2-1.23a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z"></path></svg></span><div class="footerContactBody"><span>Main Toll Free:</span><a href="tel:+18887604990">888-760-4990</a></div></li>'
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
	function popLogos(){
		const logos=document.querySelectorAll('img.logo');
		logos.forEach(logo=>{
			logo.classList.remove('logo-pop');
			void logo.offsetWidth; // force reflow to restart animation
			logo.classList.add('logo-pop');
			logo.addEventListener('animationend',()=>logo.classList.remove('logo-pop'),{once:true});
		});
	}
	setTimeout(()=>{ popLogos(); setInterval(popLogos,60000); },3000); // first pop 3s after load, then every 60s
})();