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