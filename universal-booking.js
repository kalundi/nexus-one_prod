// @version 2.1.0 - Optimized layout deployment
(function(){
  'use strict';
  // Build v2.1 - Optimized layout deployed
  const SELECTOR='input[name="pickup"],input[name="destination"],input[placeholder*="pickup"],input[placeholder*="Pickup"],input[placeholder*="destination"],input[placeholder*="Destination"],input[placeholder*="address"],input[placeholder*="Address"]';
  const PHONE_PATTERN=/^\d{3}-\d{3}-\d{4}$/;
  const EMAIL_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const NOMINATIM='https://nominatim.openstreetmap.org/search';
  let configPromise, mapsPromise;
  const state={enhanced:new WeakSet(), facilities:[], timers:{}, phoneFields:new WeakSet(), emailFields:new WeakSet()};

  function isProductionHost(){
    const host=String(window.location.hostname||'').toLowerCase();
    return !(host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host.endsWith('.local'));
  }

  // Inject comprehensive booking form optimization styles
  if(!document.querySelector('#nexus-booking-styles')){
    const style=document.createElement('style');
    style.id='nexus-booking-styles';
    style.textContent=`
      /* Optimize all form labels in booking form */
      [role="dialog"] label, form label, fieldset label, [class*="Form"] label {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #082f49 !important;
        margin-bottom: 4px !important;
        display: block !important;
      }
      
      /* Optimize form section spacing */
      [role="dialog"] > *, form > *, fieldset > *, [class*="Form"] > * {
        margin-bottom: 10px !important;
      }
      
      /* Compact input fields (exclude radio/checkbox) */
      input[type="text"], input[type="email"], input[type="tel"], input[type="number"],
      textarea, select,
      [role="dialog"] input:not([type="radio"]):not([type="checkbox"]),
      [role="dialog"] textarea {
        padding: 8px 12px !important;
        font-size: 11px !important;
        margin-top: 4px !important;
        line-height: 1.4 !important;
      }
      
      /* Optimize form buttons */
      [role="dialog"] button, form button, fieldset button, [class*="Form"] button {
        padding: 10px 12px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        line-height: 1.2 !important;
      }
      
      /* Reduce form container padding */
      [role="dialog"] > div, form > fieldset, [class*="Form"] > div {
        padding: 12px 16px !important;
      }
      
      /* Optimize section headings */
      [role="dialog"] h1, [role="dialog"] h2, [role="dialog"] h3, 
      form h1, form h2, form h3,
      fieldset legend, [class*="Form"] h1, [class*="Form"] h2 {
        font-size: 12px !important;
        font-weight: 700 !important;
        margin: 0 0 8px 0 !important;
        line-height: 1.2 !important;
      }
      
      /* Reduce gaps in flex containers */
      [role="dialog"], form, fieldset, [class*="Form"] {
        gap: 10px !important;
      }
      
      /* Prevent horizontal overflow */
      [role="dialog"], [role="dialog"] *, form, form *, fieldset, fieldset * {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      [role="dialog"] {
        overflow-x: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function api(path, options){return fetch('/api'+path, options).then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Request failed');return data;});}
  function config(){return configPromise||(configPromise=api('/integrations/config').catch(()=>({googleMapsEnabled:false})));}
  
  // Nominatim typeahead for fallback address search
  async function nominatimSearch(query){
    try{
      const url=NOMINATIM+'?format=json&addressdetails=0&limit=6&countrycodes=us&q='+encodeURIComponent(query);
      const r=await fetch(url,{headers:{'Accept-Language':'en'}});
      const data=await r.json();
      return data.map(d=>({label:d.display_name,lat:parseFloat(d.lat),lng:parseFloat(d.lon)}));
    }catch{return []}
  }
  
  // Build datalist for address suggestions
  function buildDatalist(input){
    let listId='nexus-addr-'+input.name+'-'+Math.random().toString(36).slice(2);
    let list=document.getElementById(listId);
    if(!list){list=document.createElement('datalist');list.id=listId;document.body.appendChild(list);input.setAttribute('list',listId);}
    return {list, listId};
  }
  
  function loadMaps(key){
    if(window.google?.maps?.places)return Promise.resolve(window.google);
    if(mapsPromise)return mapsPromise;
    mapsPromise=new Promise((resolve,reject)=>{
      const cb='nexusMapsReady_'+Math.random().toString(36).slice(2);
      window[cb]=()=>{delete window[cb];resolve(window.google)};
      const s=document.createElement('script');
      s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&libraries=places&callback='+cb;
      s.async=true;s.defer=true;s.onerror=()=>reject(new Error('Google Maps failed to load'));
      document.head.appendChild(s);
    });
    return mapsPromise;
  }
  function setAddress(input, value, meta){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    if(meta){input.dataset.placeId=meta.placeId||'';input.dataset.lat=meta.lat??'';input.dataset.lng=meta.lng??'';}
  }
  async function facilitySuggestions(input){
    let listId='nexus-locations-'+input.name;
    let list=document.getElementById(listId);
    if(!list){list=document.createElement('datalist');list.id=listId;document.body.appendChild(list);input.setAttribute('list',listId);}
    const update=async()=>{
      const q=input.value.trim();if(q.length<2)return;
      try{const data=await api('/locations/search?q='+encodeURIComponent(q));list.innerHTML='';(data.locations||[]).slice(0,10).forEach(x=>{const o=document.createElement('option');o.value=x.address||x.name;o.label=x.name+(x.address?' — '+x.address:'');list.appendChild(o)});}catch{}
    };
    input.addEventListener('input',()=>{clearTimeout(input._nexusSearchTimer);input._nexusSearchTimer=setTimeout(update,180)});
  }
  async function enhance(input){
    if(state.enhanced.has(input))return;state.enhanced.add(input);
    // Set proper name attributes if missing for form submission
    if(!input.name){
      if(input.placeholder.toLowerCase().includes('pickup'))input.name='pickup';
      else if(input.placeholder.toLowerCase().includes('destination'))input.name='destination';
    }
    input.setAttribute('autocomplete','street-address');input.setAttribute('spellcheck','false');input.classList.add('nexusAddressInput');input.removeAttribute('pattern');input.removeAttribute('title');
    input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');
    // Hide validation error indicators
    input.style.backgroundImage='none';
    input.addEventListener('invalid',e=>{e.preventDefault();e.target.style.boxShadow='none'},true);
    // Remove error sibling elements
    setTimeout(()=>{
      let el=input.nextElementSibling;
      while(el){
        if(el.getAttribute('role')==='status'||el.textContent?.includes('!')||el.classList?.contains('error')||el.classList?.contains('invalid')){
          el.style.display='none';
        }
        el=el.nextElementSibling;
      }
    },100);
    await facilitySuggestions(input);
    const cfg=await config();
    if(cfg.googleMapsEnabled&&cfg.googleMapsBrowserKey){
      try{
        await loadMaps(cfg.googleMapsBrowserKey);
        const ac=new google.maps.places.Autocomplete(input,{fields:['formatted_address','geometry','place_id','name'],componentRestrictions:{country:'us'},types:['geocode','establishment']});
        ac.addListener('place_changed',()=>{
          const p=ac.getPlace();
          if(!p?.geometry)return;
          setAddress(input,p.formatted_address||p.name||input.value,{placeId:p.place_id,lat:p.geometry.location.lat(),lng:p.geometry.location.lng()});
          // Trigger blur to close autocomplete dropdown
          input.blur();
          setTimeout(()=>{input.focus();},50);
          // Dispatch custom event for address selection
          input.dispatchEvent(new CustomEvent('nexus:address-selected',{bubbles:true,detail:{field:input.name,address:input.value,lat:p.geometry.location.lat(),lng:p.geometry.location.lng()}}));
          // Try to trigger fare calculation by clicking calculate button
          setTimeout(()=>{
            const calculateBtn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.toLowerCase().includes('calculate'));
            if(calculateBtn&&!calculateBtn.disabled)calculateBtn.click();
            // Also dispatch a custom event for React components listening
            document.dispatchEvent(new CustomEvent('nexus:addressChanged',{bubbles:true,detail:{field:input.name,value:input.value,lat:p.geometry.location.lat(),lng:p.geometry.location.lng()}}));
            // Update Book a Ride live route map if both addresses filled
            tryShowBookingRouteMap(cfg.googleMapsBrowserKey);
          },100);
        });
      }catch(e){console.warn('[Nexus Booking] Google autocomplete unavailable; facility and browser suggestions remain active.',e);}
    }
    
    // Add Nominatim fallback with datalist for better mobile support
    const dl=buildDatalist(input);
    const inputId=input.name||'addr';
    input.addEventListener('input',async e=>{
      clearTimeout(state.timers[inputId]);
      const q=e.target.value.trim();
      if(q.length<3){dl.list.innerHTML='';return;}
      state.timers[inputId]=setTimeout(async()=>{
        const results=await nominatimSearch(q);
        dl.list.innerHTML='';
        results.slice(0,8).forEach(r=>{
          const opt=document.createElement('option');
          opt.value=r.label;
          opt.textContent=r.label;
          opt.dataset.lat=r.lat;
          opt.dataset.lng=r.lng;
          dl.list.appendChild(opt);
        });
      },280);
    });
  }
  function normalizeBookLinks(){document.querySelectorAll('a[href*="book=1"],button[data-book-ride]').forEach(el=>{el.dataset.nexusUnifiedBooking='true';if(el.tagName==='A'&&el.getAttribute('href')){el.setAttribute('href','/booking-app.html');}});}
  
  function enhancePhoneField(input){
    if(state.phoneFields.has(input))return;
    state.phoneFields.add(input);
    input.setAttribute('inputmode','tel');
    input.setAttribute('placeholder','+1 240 555 0101');
    input.setAttribute('maxlength','24');
  }
  
  function enhanceEmailField(input){
    if(state.emailFields.has(input))return;
    state.emailFields.add(input);
    input.setAttribute('type','email');
    input.setAttribute('inputmode','email');
    input.setAttribute('placeholder','name@example.com');
    input.addEventListener('blur',e=>{
      const val=e.target.value.trim();
      if(val.length>0&&!EMAIL_PATTERN.test(val)){
        input.style.borderColor='var(--red, #db2839)';
        input.setCustomValidity('Please enter a valid email address');
      }else{
        input.style.borderColor='';
        input.setCustomValidity('');
      }
    });
  }
  
  function scan(){normalizeBookLinks();document.querySelectorAll(SELECTOR).forEach(enhance);document.querySelectorAll('input[name="phone"],input[type="tel"],input[placeholder*="phone" i]').forEach(enhancePhoneField);document.querySelectorAll('input[name="email"],input[type="email"],input[placeholder*="email" i]').forEach(enhanceEmailField);injectManageTrip();}

  async function tryShowBookingRouteMap(apiKey){
    const pickupInput=document.querySelector('input[name="pickup"],input[placeholder*="pickup" i]');
    const destInput=document.querySelector('input[name="destination"],input[placeholder*="destination" i]');
    if(!pickupInput||!destInput)return;
    const pickup=pickupInput.value.trim();
    const destination=destInput.value.trim();
    if(!pickup||!destination)return;
    let mapWrap=document.getElementById('nexusBookingRouteMap');
    if(!mapWrap){
      mapWrap=document.createElement('div');
      mapWrap.id='nexusBookingRouteMap';
      mapWrap.style.cssText='height:220px;border:1px solid #dce6ee;border-radius:8px;overflow:hidden;margin-top:10px;background:#f5f5f5';
      // Insert after the destination field
      const destParent=destInput.closest('div,fieldset,label')||destInput.parentElement;
      destParent.insertAdjacentElement('afterend',mapWrap);
    }
    // Show the container and clear placeholder text
    mapWrap.style.display='flex';
    mapWrap.style.alignItems='stretch';
    const key=apiKey||'';
    if(!key)return;
    const origin=encodeURIComponent(pickup);
    const dest=encodeURIComponent(destination);
    mapWrap.innerHTML='';
    const iframe=document.createElement('iframe');
    iframe.style.cssText='width:100%;height:100%;border:0';
    iframe.loading='lazy';
    iframe.referrerPolicy='no-referrer-when-downgrade';
    iframe.src=`https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${origin}&destination=${dest}&mode=driving`;
    mapWrap.appendChild(iframe);
  }
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scan);
  setTimeout(scan,500);setTimeout(scan,1500);setTimeout(scan,3000);
  scan();

  // -- Cancel / Reschedule --------------------------------------------------
  function injectManageTrip(){
    // Look for booking form container - if tabs already exist, skip
    if(document.querySelector('.nexusManagedTrip'))return;
    // Find the first phone field - try multiple selectors
    let phoneField=document.querySelector('input[type="tel"]');
    if(!phoneField)phoneField=document.querySelector('input[name="phone"]');
    if(!phoneField)phoneField=document.querySelector('input[placeholder*="phone" i]');
    if(!phoneField){return;}
    
    console.log('[Nexus] Found phone field, searching for parent form...');
    // Find the closest form or form-like container
    let formContainer=phoneField.closest('form')||phoneField.closest('fieldset')||phoneField.closest('[role="dialog"]')||phoneField.closest('[class*="Form"]');
    if(!formContainer){
      // Go up to find a reasonable container
      let el=phoneField;
      for(let i=0;i<8;i++){
        el=el.parentElement;
        if(!el)break;
        if(el.querySelector('input[type="submit"]')||el.querySelector('button[type="submit"]')||el.querySelector('button:not([data-nexus])')){
          formContainer=el;
          break;
        }
      }
    }
    if(!formContainer){console.log('[Nexus] No form container found');return;}
    
    console.log('[Nexus] Found form container, creating manage trip interface...');
    
    // Find form heading - search in formContainer and up the tree
    let formHeading=formContainer.querySelector('h1,h2,h3,h4,h5,h6');
    if(!formHeading&&formContainer.previousElementSibling){
      formHeading=formContainer.previousElementSibling.querySelector('h1,h2,h3,h4,h5,h6');
    }
    if(!formHeading){
      let parent=formContainer.parentElement;
      for(let i=0;i<4&&!formHeading&&parent;i++){
        formHeading=parent.querySelector('h1,h2,h3,h4,h5,h6');
        parent=parent.parentElement;
      }
    }
    const originalHeadingText=formHeading?.textContent?.trim();
    console.log('[Nexus] Found heading:',formHeading?.tagName,originalHeadingText);
    
    // Create manage form with header
    const manageForm=document.createElement('div');
    manageForm.className='nexusManagedTrip';
    manageForm.style.cssText='display:none;margin:0;padding:0;background:#fff;border-radius:0;border:none;overflow:hidden;width:100%;grid-column:1/-1';
    

    // Create content container
    const content=document.createElement('div');
    content.style.cssText='padding:0;background:#fff;border:1px solid #dce6ee;border-radius:0;margin:0;width:100%';
    const demoQuickFill=isProductionHost()?'':`
        <div style="margin-top:8px;padding:8px 10px;background:#f0f4f8;border-radius:6px;border:1px solid #dce6ee">
          <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#62758a;text-transform:uppercase;letter-spacing:.5px">Try Demo Trips</p>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button type="button" data-nexus-demo="NMT-DEMO-0001" data-nexus-demo-phone="(202) 555-0101" style="padding:5px 8px;background:#fff;border:1px solid #dce6ee;border-radius:6px;font-size:10px;cursor:pointer;text-align:left;color:#082f49">NMT-DEMO-0001 - James Mitchell - Wheelchair</button>
            <button type="button" data-nexus-demo="NMT-DEMO-0002" data-nexus-demo-phone="(202) 555-0108" style="padding:5px 8px;background:#fff;border:1px solid #dce6ee;border-radius:6px;font-size:10px;cursor:pointer;text-align:left;color:#082f49">NMT-DEMO-0002 - Jennifer Smith - Ambulatory</button>
            <button type="button" data-nexus-demo="NMT-DEMO-0003" data-nexus-demo-phone="(703) 555-0103" style="padding:5px 8px;background:#fff;border:1px solid #dce6ee;border-radius:6px;font-size:10px;cursor:pointer;text-align:left;color:#082f49">NMT-DEMO-0003 - Robert Chen - Broda Chair</button>
          </div>
        </div>`;
    content.innerHTML=`
      <div style="padding:12px 16px;margin:0.5rem">
        <p style="font-size:11px;color:#62758a;margin:0 0 10px 0;line-height:1.4">Enter trip reference and phone to reschedule or cancel.</p>
        <label style="display:block;margin-bottom:8px"><span style="font-size:11px;font-weight:600;color:#082f49">Trip Reference or Name</span><br>
          <input type="text" placeholder="e.g., NMT-20260721-1234 or John Smith" maxlength="50" style="width:100%;padding:8px 12px;border:1px solid #dce6ee;border-radius:8px;box-sizing:border-box;margin-top:4px;font-size:11px"></label>
        <label style="display:block;margin-bottom:10px"><span style="font-size:11px;font-weight:600;color:#082f49">Phone Number</span><br>
          <input type="tel" placeholder="(555) 123-4567" maxlength="20" style="width:100%;padding:8px 12px;border:1px solid #dce6ee;border-radius:8px;box-sizing:border-box;margin-top:4px;font-size:11px"></label>
        <button type="button" data-nexus-lookup style="width:100%;padding:8px;background:#0369a1;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px">Look Up Trip</button>
        ${demoQuickFill}
        <div class="nexusLookupMsg" style="display:none;margin-top:12px;padding:10px;border-radius:8px;font-size:13px;font-weight:600"></div>
      </div>
      <div class="nexusManageActions" style="display:none;overflow:hidden;width:100%"></div>`;
    manageForm.appendChild(content);
    
    // Create "Manage Trip" button to show the manage form (replaces manage tab)
    const manageButton=document.createElement('button');
    manageButton.type='button';
    manageButton.className='nexus-manage-btn';
    manageButton.style.cssText='grid-column:1/-1;width:100%;padding:14px 12px;background:#0369a1;border:2px solid #0369a1;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;color:#fff;margin-bottom:12px;transition:all 0.2s;display:flex;align-items:center;justify-content:space-between;gap:10px';
    manageButton.innerHTML=`
      <div style="text-align:left">
        <div style="font-size:13px;font-weight:700">Manage Trip</div>
        <div style="font-size:11px;font-weight:500;opacity:0.95;margin-top:2px">Make changes</div>
      </div>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    manageButton.onmouseover=()=>{manageButton.style.background='#0258a1';manageButton.style.borderColor='#0258a1';};
    manageButton.onmouseout=()=>{manageButton.style.background='#0369a1';manageButton.style.borderColor='#0369a1';};
    
    // Insert manage form and button at the very top of the form container
    formContainer.insertBefore(manageButton, formContainer.firstChild);
    formContainer.insertBefore(manageForm, formContainer.firstChild);
    
    console.log('[Nexus] Manage trip interface injected successfully');
    
    // Show manage form when button is clicked
    manageButton.addEventListener('click',()=>{
      manageForm.style.display='block';
      manageButton.style.display='none';
      // Remove padding from form container to allow full-width card
      const originalPadding=formContainer.style.padding;
      formContainer.style.padding='0';
      manageForm.dataset.originalPadding=originalPadding;
      // Also remove padding from dialog or parent container
      const dialog=formContainer.closest('dialog')||formContainer.closest('[role="dialog"]');
      const contentWrapper=formContainer.parentElement;
      if(contentWrapper){
        const originalContentPadding=contentWrapper.style.padding;
        contentWrapper.style.padding='0';
        manageForm.dataset.originalContentPadding=originalContentPadding;
      }
      // Remove padding from the content div inside manage form
      // (now padding is on an inner wrapper, so no need to remove from content div)
      const originalContentDivPadding=null;
      console.log('[Nexus] Manage button clicked - formHeading:',formHeading?.tagName,formHeading?.textContent);
      // Swap form heading inside the dialog
      if(formHeading){
        console.log('[Nexus] Swapping heading text to: ? Manage Trip');
        formHeading.textContent='? Manage Trip';
      }else{
        console.log('[Nexus] WARNING: formHeading is null or undefined');
      }
      // Hide original form inputs and sections
      Array.from(formContainer.querySelectorAll('input:not([data-nexus]),select:not([data-nexus]),textarea,button[type="submit"]')).forEach(el=>{
        if(!el.closest('.nexusManagedTrip')){el.style.display='none';}
      });
      // Hide sections containing route/fare estimate text
      Array.from(formContainer.querySelectorAll('*')).forEach(el=>{
        if(el.textContent?.includes('Trip route and fare estimate')||el.textContent?.includes('route will appear')||el.textContent?.includes('Calculate route')){
          if(!el.closest('.nexusManagedTrip')){el.style.display='none';}
        }
      });
      // Hide labels and divs that are form sections
      Array.from(formContainer.querySelectorAll('label,fieldset,[role="group"],[class*="form"],[class*="section"]')).forEach(el=>{
        if(!el.closest('.nexusManagedTrip')&&el.parentElement===formContainer){el.style.display='none';}
      });
    });
    
    // Back to booking form: add click handler to restore heading when manage form closes
    function restoreBookingForm(){
      manageForm.style.display='none';
      manageButton.style.display='block';
      // Restore form container padding
      if(manageForm.dataset.originalPadding){
        formContainer.style.padding=manageForm.dataset.originalPadding;
      }
      // Restore parent content wrapper padding
      const contentWrapper=formContainer.parentElement;
      if(contentWrapper&&manageForm.dataset.originalContentPadding){
        contentWrapper.style.padding=manageForm.dataset.originalContentPadding;
      }
      console.log('[Nexus] Back clicked - restoring heading to:',originalHeadingText);
      if(formHeading&&originalHeadingText){
        formHeading.textContent=originalHeadingText;
      }else{
        console.log('[Nexus] WARNING: Cannot restore - formHeading:',!!formHeading,'originalHeadingText:',originalHeadingText);
      }
      // Show all original form inputs and sections
      Array.from(formContainer.querySelectorAll('input:not([data-nexus]),select:not([data-nexus]),textarea,button[type="submit"],label,fieldset,[role="group"],[class*="form"],[class*="section"]')).forEach(el=>{
        if(!el.closest('.nexusManagedTrip')){el.style.display='';}
      });
      // Clear manage lookup fields
      content.querySelector('input[type="text"]').value='';
      content.querySelector('input[type="tel"]').value='';
      manageForm.querySelector('.nexusLookupMsg').style.display='none';
      manageForm.querySelector('.nexusManageActions').style.display='none';
    }
    
    // Restore booking form when heading is clicked (back arrow interaction)
    if(formHeading){
      formHeading.style.cursor='pointer';
      formHeading.addEventListener('click',restoreBookingForm);
    }
    
    // Demo trip quick-fill buttons
    manageForm.querySelectorAll('[data-nexus-demo]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const ref=btn.getAttribute('data-nexus-demo');
        const phone=btn.getAttribute('data-nexus-demo-phone');
        manageForm.querySelector('input[type="text"]').value=ref;
        manageForm.querySelector('input[type="tel"]').value=phone;
        manageForm.querySelector('[data-nexus-lookup]').click();
      });
    });
    
    // Lookup trip
    const lookupBtn=manageForm.querySelector('[data-nexus-lookup]');
    if(lookupBtn){
      lookupBtn.addEventListener('click',async()=>{
        const tripRef=manageForm.querySelector('input[type="text"]').value.trim();
        const phone=manageForm.querySelector('input[type="tel"]').value.trim();
        if(!tripRef||!phone){showManageMsg('Please enter both trip reference and phone number.',false);return;}
        const btn=manageForm.querySelector('[data-nexus-lookup]');
        btn.disabled=true;btn.textContent='Looking up...';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(tripRef)}?phone=${encodeURIComponent(phone)}`);
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Trip not found');
          await showManageActions(data.booking,tripRef,phone);
        }catch(e){showManageMsg(e.message,false);btn.disabled=false;btn.textContent='Look Up Trip';}
      });
    }
    
    function showManageMsg(msg,ok){
      const el=manageForm.querySelector('.nexusLookupMsg');
      if(el){
        el.textContent=msg;el.style.display='block';
        el.style.background=ok?'#d1fae5':'#fff1f2';
        el.style.color=ok?'#047857':'#e11d48';
        el.style.borderLeft=`4px solid ${ok?'#10b981':'#e11d48'}`;
      }
    }
    
    async function showManageActions(booking,ref,phone){
      const actions=manageForm.querySelector('.nexusManageActions');
      const statusColor=booking.status==='cancelled'?'#e11d48':booking.status==='completed'?'#059669':'#0369a1';
      const statusBg=booking.status==='cancelled'?'#fff1f2':booking.status==='completed'?'#d1fae5':'#dbeafe';
      const statusLabel=(booking.status||'confirmed').replace(/^\w/,c=>c.toUpperCase());
      const tripDate=booking.date?new Date(booking.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'';
      const mapId='nexus-map-'+Math.random().toString(36).slice(2);
      const tabContents={
        timeline:`<em style="color:#94a3b8">No timeline events yet.</em>`,
        notes:`<p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#082f49">Trip Notes</p><textarea placeholder="Add a note…" style="width:100%;height:56px;padding:7px 9px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;font-size:12px;resize:vertical"></textarea>`,
        driver:`<em style="color:#94a3b8">No driver assigned yet.</em>`,
        vehicle:`<em style="color:#94a3b8">No vehicle assigned yet.</em>`,
        billing:`<em style="color:#94a3b8">No billing information available.</em>`,
        notifications:`<em style="color:#94a3b8">No notifications sent yet.</em>`
      };
      actions.innerHTML=`
        <div style="width:100%;background:#fff;border:1px solid #dce6ee;border-radius:0;font-size:12px;box-sizing:border-box;display:flex;flex-direction:column">
          <!-- Title bar with back arrow - styled like a button -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0369a1;color:#fff;flex-shrink:0;border-radius:0;cursor:pointer;gap:12px;margin:0.5rem" class="nexus-manage-back" onmouseover="this.style.background='#0258a1'" onmouseout="this.style.background='#0369a1'">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <div style="min-width:0">
                <div style="font-weight:700;font-size:12px;margin:0;line-height:1.2">Manage Trip</div>
              </div>
            </div>
            <span style="font-size:9px;font-weight:600;opacity:.85;white-space:nowrap;text-align:right;flex-shrink:0">${ref}<br>${tripDate||''}</span>
          </div>
          <!-- Full-width scrollable body -->
          <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;margin:0.5rem">
            <!-- Trip Route Map -->
            <div style="height:280px;border:1px solid #dce6ee;border-radius:8px;overflow:hidden;background:#f5f5f5" id="nexusRouteMap"></div>
            <!-- Patient Information - Editable -->
            <div>
              <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#62758a;text-transform:uppercase;letter-spacing:.5px">Patient Information</p>
              <div style="display:flex;flex-direction:column;gap:10px">
                <div>
                  <label style="display:block;font-size:10px;font-weight:600;color:#62758a;margin-bottom:4px">Name</label>
                  <input type="text" data-field="name" value="${booking.name||''}" style="width:100%;padding:8px;border:1px solid #dce6ee;border-radius:6px;font-size:12px;box-sizing:border-box">
                </div>
                <div>
                  <label style="display:block;font-size:10px;font-weight:600;color:#62758a;margin-bottom:4px">Pickup</label>
                  <input type="text" data-field="pickup" value="${booking.pickup||''}" style="width:100%;padding:8px;border:1px solid #dce6ee;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:6px" placeholder="Enter pickup address">
                  <div data-field-container="pickup" style="width:100%"></div>
                </div>
                <div>
                  <label style="display:block;font-size:10px;font-weight:600;color:#62758a;margin-bottom:4px">Destination</label>
                  <input type="text" data-field="destination" value="${booking.destination||''}" style="width:100%;padding:8px;border:1px solid #dce6ee;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:6px" placeholder="Enter destination address">
                  <div data-field-container="destination" style="width:100%"></div>
                </div>
                </div>
              </div>
            </div>
            <!-- Fare Estimate -->
            <div>
              <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#62758a;text-transform:uppercase;letter-spacing:.5px">Fare Estimate</p>
              <div style="padding:12px;border:2px solid #0369a1;border-radius:8px;background:#dbeafe;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span style="font-weight:600;color:#082f49">Subtotal</span>
                  <span style="font-weight:600;color:#0369a1;font-size:14px" data-fare="subtotal">—</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center" data-discount-row style="display:none">
                  <span style="font-weight:600;color:#059669">Discount (applied)</span>
                  <span style="font-weight:600;color:#059669;font-size:14px" data-fare="discount">-—</span>
                </div>
                <div style="border-top:1px solid #0369a1;padding-top:8px;display:flex;justify-content:space-between;align-items:center">
                  <span style="font-weight:700;color:#082f49;font-size:13px">Fare Estimate</span>
                  <span style="font-weight:700;color:#0369a1;font-size:16px" data-fare="total">—</span>
                </div>
              </div>
            </div>
          </div>
          </div>
          <!-- Payment Options Section -->
          <div style="padding:16px;border-top:1px solid #dce6ee;background:#f9fafb;margin:0.5rem">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#62758a;text-transform:uppercase;letter-spacing:.5px">Payment Method</p>
            <div style="display:flex;gap:6px;flex-direction:column">
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border:1.5px solid #dce6ee;border-radius:8px;background:#fff;transition:border-color 0.15s;position:relative">
                <input type="radio" name="payment-option" value="deposit" checked style="cursor:pointer;width:15px;height:15px;accent-color:#0369a1;margin-top:2px;flex-shrink:0">
                <div style="flex:1">
                  <div style="font-size:11px;font-weight:600;color:#082f49">Pay 25%</div>
                  <div style="font-size:10px;color:#62758a">Reserve</div>
                </div>
                <span style="font-weight:700;color:#0369a1;font-size:12px;position:absolute;right:10px;top:8px" data-payment-deposit>—</span>
              </label>
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:8px 10px;border:1.5px solid #dce6ee;border-radius:8px;background:#fff;transition:border-color 0.15s;position:relative">
                <input type="radio" name="payment-option" value="full" style="cursor:pointer;width:15px;height:15px;accent-color:#0369a1;margin-top:2px;flex-shrink:0">
                <div style="flex:1">
                  <div style="font-size:11px;font-weight:600;color:#082f49">Pay Full</div>
                  <div style="font-size:10px;color:#62758a">Now</div>
                </div>
                <span style="font-weight:700;color:#0369a1;font-size:12px;position:absolute;right:10px;top:8px" data-payment-full>—</span>
              </label>
            </div>
          </div>
          <!-- Action buttons -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-top:1px solid #dce6ee;flex-shrink:0;margin:0.5rem">
            <button type="button" data-nexus-action="cancel" style="padding:10px 6px;background:#dc2626;color:#fff;border:none;font-weight:700;cursor:pointer;font-size:11px;transition:background 0.2s">Cancel</button>
            <button type="button" data-nexus-action="update" style="padding:10px 6px;background:#0369a1;color:#fff;border:none;border-left:1px solid rgba(255,255,255,.2);border-right:1px solid rgba(255,255,255,.2);font-weight:600;cursor:pointer;font-size:11px;transition:background 0.2s">Update</button>
            <button type="button" data-nexus-action="complete" style="padding:10px 6px;background:#059669;color:#fff;border:none;font-weight:700;cursor:pointer;font-size:11px;transition:background 0.2s">Call In</button>
          </div>
        </div>
        <div class="nexusManageResult" style="display:none;margin-top:8px;padding:10px;border-radius:8px;font-size:13px;font-weight:600"></div>`;
      actions.style.display='block';
      
      const pricing=window.NexusCore?.getPricing?.()||{};
      const routeService=String(booking.service||'ambulatory').toLowerCase();
      const rate=pricing[routeService]||window.NexusCore?.DEFAULT?.[routeService]||window.NexusCore?.DEFAULT?.ambulatory||{base:65,includedMiles:5,perMile:3.25,waitPer15:20};

      const getNthWeekdayOfMonth=(year,monthIndex,weekday,nth)=>{
        const first=new Date(year,monthIndex,1);
        const offset=(weekday-first.getDay()+7)%7;
        return new Date(year,monthIndex,1+offset+((nth-1)*7));
      };
      const getLastWeekdayOfMonth=(year,monthIndex,weekday)=>{
        const last=new Date(year,monthIndex+1,0);
        const offset=(last.getDay()-weekday+7)%7;
        return new Date(year,monthIndex,last.getDate()-offset);
      };
      const sameCalendarDate=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
      const isFederalHoliday=(dateInput)=>{
        const d=new Date(dateInput||new Date());
        d.setHours(12,0,0,0);
        const y=d.getFullYear();
        const holidays=[
          new Date(y,0,1),
          getNthWeekdayOfMonth(y,0,1,3),
          getNthWeekdayOfMonth(y,1,1,3),
          getLastWeekdayOfMonth(y,4,1),
          new Date(y,5,19),
          new Date(y,6,4),
          getNthWeekdayOfMonth(y,8,1,1),
          getNthWeekdayOfMonth(y,9,1,2),
          new Date(y,10,11),
          getNthWeekdayOfMonth(y,10,4,4),
          new Date(y,11,25)
        ];
        return holidays.some((h)=>sameCalendarDate(h,d));
      };

      const applyFareEstimate=(miles)=>{
        const distanceMiles=Math.max(0,Number(miles)||0);
        const billableMiles=Math.max(0,distanceMiles-Number(rate.includedMiles||0));
        const baseFare=Number(rate.base||0)+(billableMiles*Number(rate.perMile||0));
        const tripDate=new Date(booking.date||new Date());
        const dayOfWeek=tripDate.getDay();
        const isWeekend=dayOfWeek===0||dayOfWeek===6;
        const isHoliday=isFederalHoliday(tripDate);
        const discountPercent=isHoliday?10:(!isWeekend?5:0);
        const discountAmount=baseFare*(discountPercent/100);
        const finalTotal=baseFare-discountAmount;
        const depositAmount=finalTotal*0.25;

        const subtotal=actions.querySelector('[data-fare="subtotal"]');
        if(subtotal) subtotal.textContent=`$${baseFare.toFixed(2)}${distanceMiles?` (${distanceMiles.toFixed(1)} mi)`:''}`;

        const discount=actions.querySelector('[data-fare="discount"]');
        const discountRow=actions.querySelector('[data-discount-row]');
        if(discountRow) discountRow.style.display=discountPercent>0?'flex':'none';
        if(discount) discount.textContent=discountPercent>0?`-$${discountAmount.toFixed(2)} (${discountPercent}%)`:'-$0.00';

        const totalEst=actions.querySelector('[data-fare="total"]');
        if(totalEst) totalEst.textContent=`$${finalTotal.toFixed(2)}`;

        const depositDisplay=actions.querySelector('[data-payment-deposit]');
        if(depositDisplay) depositDisplay.textContent=`$${depositAmount.toFixed(2)}`;
        const fullDisplay=actions.querySelector('[data-payment-full]');
        if(fullDisplay) fullDisplay.textContent=`$${finalTotal.toFixed(2)}`;
      };

      const refreshRouteAndFare=async()=>{
        const pickup=booking.pickup?.trim();
        const destination=booking.destination?.trim();
        if(!pickup||!destination){
          applyFareEstimate(Number(booking.distanceMiles||0));
          const mapContainer=actions.querySelector('#nexusRouteMap');
          if(mapContainer){
            mapContainer.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px">Enter pickup and destination to calculate route</div>';
          }
          return;
        }

        let miles=Number(booking.distanceMiles||0);
        if(!(miles>0)){
          const cfg=await config();
          if(cfg.googleMapsEnabled&&cfg.googleMapsBrowserKey){
            try{
              await loadMaps(cfg.googleMapsBrowserKey);
              const dirSvc=new google.maps.DirectionsService();
              const result=await new Promise((resolve,reject)=>{
                dirSvc.route({
                  origin:pickup,
                  destination,
                  travelMode:google.maps.TravelMode.DRIVING,
                  unitSystem:google.maps.UnitSystem.IMPERIAL
                },(r,status)=>status==='OK'?resolve(r):reject(new Error(status)));
              });
              miles=Number(result.routes?.[0]?.legs?.[0]?.distance?.value||0)/1609.34;
            }catch(e){
              console.warn('[Nexus] Route distance unavailable, using stored estimate.',e);
            }
          }
        }

        if(!(miles>0)){
          miles=Number(booking.distanceMiles||0);
        }
        applyFareEstimate(miles);

        const mapContainer=actions.querySelector('#nexusRouteMap');
        if(mapContainer){
          const cfg=await config().catch(()=>({googleMapsEnabled:false}));
          if(cfg.googleMapsEnabled&&cfg.googleMapsBrowserKey){
            mapContainer.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#62758a;font-size:12px">Loading route…</div>';
            const origin=encodeURIComponent(pickup);
            const dest=encodeURIComponent(destination);
            const key=encodeURIComponent(cfg.googleMapsBrowserKey);
            const iframe=document.createElement('iframe');
            iframe.style.cssText='width:100%;height:100%;border:0';
            iframe.loading='lazy';
            iframe.referrerPolicy='no-referrer-when-downgrade';
            iframe.src=`https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${origin}&destination=${dest}&mode=driving`;
            mapContainer.innerHTML='';
            mapContainer.appendChild(iframe);
          }else if(mapContainer.parentElement){
            mapContainer.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px">Maps not available</div>';
          }
        }
      };

      refreshRouteAndFare().catch(e=>console.warn('[Nexus] Fare/route refresh failed',e));
      
      // Button handlers with null checks
      const cancelBtn=actions.querySelector('[data-nexus-action="cancel"]');
      if(cancelBtn){
        try{cancelBtn.addEventListener('click',()=>{
          if(confirm('Are you certain you want to cancel your trip?')){
            doCancel(ref,phone,actions);
          }
        });}catch(e){console.warn('[Nexus] Cancel button error',e);}
      }
      const updateBtn=actions.querySelector('[data-nexus-action="update"]');
      if(updateBtn){
        try{updateBtn.addEventListener('click',()=>doUpdate(ref,phone,actions));}catch(e){console.warn('[Nexus] Update button error',e);}
      }
      const completeBtn=actions.querySelector('[data-nexus-action="complete"]');
      if(completeBtn){
        try{completeBtn.addEventListener('click',()=>{
          window.location.href='tel:+18886395766';
        });}catch(e){console.warn('[Nexus] Call In button error',e);}
      }
      
      // Back button handler
      const backBtn=actions.querySelector('.nexus-manage-back');
      if(backBtn){
        try{backBtn.addEventListener('click',()=>restoreBookingForm());backBtn.style.transition='background 0.2s';}catch(e){console.warn('[Nexus] Back button error',e);}
      }
      
      // Initialize Places Autocomplete for pickup and destination
      (async()=>{
        try{
          const cfg=await config();
          if(cfg.googleMapsEnabled&&cfg.googleMapsBrowserKey){
            await loadMaps(cfg.googleMapsBrowserKey);
            
            // Create autocomplete elements
            const pickupContainer=actions.querySelector('[data-field-container="pickup"]');
            const destContainer=actions.querySelector('[data-field-container="destination"]');
            
            if(pickupContainer&&google.maps.places){
              const pickupElement=new google.maps.places.PlaceAutocompleteElement({types:['geocode']});
              pickupElement.value=booking.pickup||'';
              pickupContainer.appendChild(pickupElement);
              
              pickupElement.addEventListener('gmp-placeselect',()=>{
                const place=pickupElement.getPlace();
                if(place){
                  booking.pickup=place.formattedAddress||'';
                  const pickupInput=actions.querySelector('[data-field="pickup"]');
                  if(pickupInput) pickupInput.value=booking.pickup;
                  refreshRouteAndFare().catch(e=>console.warn('[Nexus] Fare refresh after pickup change failed',e));
                }
              });
            }
            
            if(destContainer&&google.maps.places){
              const destElement=new google.maps.places.PlaceAutocompleteElement({types:['geocode']});
              destElement.value=booking.destination||'';
              destContainer.appendChild(destElement);
              
              destElement.addEventListener('gmp-placeselect',()=>{
                const place=destElement.getPlace();
                if(place){
                  booking.destination=place.formattedAddress||'';
                  const destInput=actions.querySelector('[data-field="destination"]');
                  if(destInput) destInput.value=booking.destination;
                  refreshRouteAndFare().catch(e=>console.warn('[Nexus] Fare refresh after destination change failed',e));
                }
              });
            }
          }
        }catch(e){console.warn('[Nexus] Places autocomplete init',e);}
      })();

      const pickupInput=actions.querySelector('[data-field="pickup"]');
      const destinationInput=actions.querySelector('[data-field="destination"]');
      [pickupInput,destinationInput].forEach(input=>{
        if(!input)return;
        input.addEventListener('change',()=>{booking[input.dataset.field]=input.value.trim();refreshRouteAndFare().catch(e=>console.warn('[Nexus] Fare refresh after input change failed',e));});
        input.addEventListener('input',()=>{booking[input.dataset.field]=input.value.trim();});
      });
    }
    
    function doUpdate(ref,phone,actions){
      const result=actions.querySelector('.nexusManageResult');
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      const minDate=tomorrow.toISOString().slice(0,10);
      result.innerHTML=`
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#082f49">Update Trip Date / Time</p>
        <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px">
          <label><span style="font-size:11px;font-weight:600;color:#62758a">New Date</span><br>
            <input type="date" name="date" min="${minDate}" style="width:100%;padding:7px 9px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;margin-top:3px;font-size:12px"></label>
          <label><span style="font-size:11px;font-weight:600;color:#62758a">New Time</span><br>
            <input type="time" name="time" style="width:100%;padding:7px 9px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;margin-top:3px;font-size:12px"></label>
        </div>
        <button type="button" data-nexus-do-update style="padding:8px 16px;background:#0369a1;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px">Confirm Update</button>`;
      result.style.display='block';
      const updateBtn=result.querySelector('[data-nexus-do-update]');
      if(updateBtn){
        updateBtn.addEventListener('click',async()=>{
        const date=result.querySelector('[name="date"]').value;
        const time=result.querySelector('[name="time"]').value;
        if(!date||!time){showManageMsg('Please select both date and time.',false);return;}
        const btn=result.querySelector('[data-nexus-do-update]');
        btn.disabled=true;btn.textContent='Updating…';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/reschedule`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone,date,time})});
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Update failed');
          showManageMsg(`? Trip updated to ${date} at ${time}. Confirmation sent.`,true);
          result.style.display='none';
        }catch(e){showManageMsg(e.message,false);btn.disabled=false;btn.textContent='Confirm Update';}
        });
      }
    }
    
    function doCancel(ref,phone,actions){
      const result=actions.querySelector('.nexusManageResult');
      result.innerHTML=`<label style="display:block;margin-bottom:8px"><span style="font-size:12px;font-weight:600;color:#082f49">Cancellation Reason (optional)</span><br>
        <textarea placeholder="e.g., Found alternative transport" maxlength="200" style="width:100%;height:60px;padding:8px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;margin-top:4px;font-size:13px;resize:none"></textarea></label>
        <button type="button" data-nexus-do-cancel style="width:100%;padding:8px;background:#e11d48;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Confirm Cancellation</button>`;
      result.style.display='block';
      const cancelBtn2=result.querySelector('[data-nexus-do-cancel]');
      if(cancelBtn2){
        cancelBtn2.addEventListener('click',async()=>{
        const reason=result.querySelector('textarea').value.trim();
        const btn=result.querySelector('[data-nexus-do-cancel]');
        btn.disabled=true;btn.textContent='Cancelling...';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/cancel`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone,reason})});
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Cancellation failed');
          showManageMsg('? Trip cancelled. Confirmation sent via text and email.',true);
          actions.style.display='none';
        }catch(e){const msg=result.querySelector('.nexusMsg')||document.createElement('div');msg.textContent=e.message;msg.style.cssText='padding:8px;background:#fff1f2;color:#e11d48;border-radius:6px;margin-bottom:8px;font-size:12px;font-weight:600';result.insertBefore(msg,result.firstChild);btn.disabled=false;btn.textContent='Confirm Cancellation';}
        });
      }
    }
    
    function doReschedule(ref,phone,actions){
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      const minDate=tomorrow.toISOString().slice(0,10);
      const result=actions.querySelector('.nexusManageResult');
      result.innerHTML=`<label style="display:block;margin-bottom:8px"><span style="font-size:12px;font-weight:600;color:#082f49">New Date</span><br>
        <input type="date" name="date" min="${minDate}" style="width:100%;padding:8px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;margin-top:4px;font-size:13px"></label>
        <label style="display:block;margin-bottom:8px"><span style="font-size:12px;font-weight:600;color:#082f49">New Time</span><br>
        <input type="time" name="time" style="width:100%;padding:8px;border:1px solid #dce6ee;border-radius:6px;box-sizing:border-box;margin-top:4px;font-size:13px"></label>
        <button type="button" data-nexus-do-reschedule style="width:100%;padding:8px;background:#0369a1;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Confirm Reschedule</button>`;
      result.style.display='block';
      const reschedBtn=result.querySelector('[data-nexus-do-reschedule]');
      if(reschedBtn){
        reschedBtn.addEventListener('click',async()=>{
        const date=result.querySelector('[name="date"]').value;
        const time=result.querySelector('[name="time"]').value;
        if(!date||!time){const msg=document.createElement('div');msg.textContent='Please fill in date and time.';msg.style.cssText='padding:8px;background:#fff1f2;color:#e11d48;border-radius:6px;margin-bottom:8px;font-size:12px;font-weight:600';result.insertBefore(msg,result.firstChild);return;}
        const btn=result.querySelector('[data-nexus-do-reschedule]');
        btn.disabled=true;btn.textContent='Rescheduling...';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/reschedule`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone,date,time})});
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Reschedule failed');
          showManageMsg(`? Trip rescheduled to ${date} at ${time}. Confirmation sent via text and email.`,true);
          actions.style.display='none';
        }catch(e){const msg=result.querySelector('.nexusMsg')||document.createElement('div');msg.textContent=e.message;msg.style.cssText='padding:8px;background:#fff1f2;color:#e11d48;border-radius:6px;margin-bottom:8px;font-size:12px;font-weight:600';result.insertBefore(msg,result.firstChild);btn.disabled=false;btn.textContent='Confirm Reschedule';}
        });
      }
    }
  }

  function injectManageButtons(successEl){
    if(successEl._nexusManaged)return;
    successEl._nexusManaged=true;
    // Extract reference and phone from the success screen
    const refText=successEl.querySelector('b')?.textContent?.trim()||'';
    const ref=refText.match(/NMT-[\w-]+/)?.[0]||'';
    if(!ref)return;
    // Build the manage section
    const section=document.createElement('div');
    section.className='nexusManageTrip';
    section.style.cssText='margin-top:20px;padding-top:18px;border-top:1px solid #dce6ee;display:flex;flex-direction:column;gap:10px';
    section.innerHTML=`
      <p style="font-size:13px;color:#62758a;margin:0">Need to make a change?</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" data-nexus-action="reschedule" style="flex:1;min-width:120px;padding:10px 16px;border-radius:10px;border:1px solid #dce6ee;background:#f3f8fb;color:#082f49;font-weight:600;font-size:14px;cursor:pointer">Reschedule</button>
        <button type="button" data-nexus-action="cancel" style="flex:1;min-width:120px;padding:10px 16px;border-radius:10px;border:1px solid #fecdd3;background:#fff1f2;color:#e11d48;font-weight:600;font-size:14px;cursor:pointer">Cancel Trip</button>
      </div>
      <div class="nexusManageForm" style="display:none"></div>
      <div class="nexusManageMsg" style="display:none;padding:10px 14px;border-radius:8px;font-size:14px;font-weight:600"></div>`;
    successEl.appendChild(section);

    function showMsg(msg,ok){
      const el=section.querySelector('.nexusManageMsg');
      if(el){
        el.textContent=msg;el.style.display='block';
        el.style.background=ok?'#d1fae5':'#fff1f2';el.style.color=ok?'#047857':'#e11d48';
        el.style.border=`1px solid ${ok?'#6ee7b7':'#fecdd3'}`;
      }
    }
    function phoneVerifyField(){
      const w=document.createElement('div');
      w.style.cssText='display:flex;flex-direction:column;gap:8px';
      w.innerHTML=`<label style="font-size:13px;font-weight:600;color:#62758a">Verify your phone number</label>
        <input type="tel" placeholder="202-555-0123" maxlength="20" style="padding:9px 12px;border:1px solid #dce6ee;border-radius:8px;font-size:14px;width:100%;box-sizing:border-box">`;
      return w;
    }
    const cancelActionBtn=section.querySelector('[data-nexus-action="cancel"]');
    if(cancelActionBtn){
      try{cancelActionBtn.addEventListener('click',()=>{
      const form=section.querySelector('.nexusManageForm');
      form.style.display='block';
      form.innerHTML='';
      const pf=phoneVerifyField();
      const btn=document.createElement('button');
      btn.type='button';btn.textContent='Confirm Cancellation';
      btn.style.cssText='padding:10px 16px;background:#e11d48;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:4px';
      btn.onclick=async()=>{
        const phone=pf.querySelector('input').value.trim();
        if(!phone){showMsg('Please enter your phone number to confirm.', false);return;}
        btn.disabled=true;btn.textContent='Cancelling…';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/cancel`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone})});
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Cancellation failed');
          form.style.display='none';
          showMsg('? Trip cancelled. A confirmation text/email has been sent.',true);
          section.querySelectorAll('[data-nexus-action]').forEach(b=>b.style.display='none');
        }catch(e){showMsg(e.message,false);btn.disabled=false;btn.textContent='Confirm Cancellation';}
      };
      form.appendChild(pf);form.appendChild(btn);
      });}catch(e){console.warn('[Nexus] Cancel action button error',e);}
    }

    const reschedActionBtn=section.querySelector('[data-nexus-action="reschedule"]');
    if(reschedActionBtn){
      try{reschedActionBtn.addEventListener('click',()=>{
      const form=section.querySelector('.nexusManageForm');
      form.style.display='block';
      form.innerHTML='';
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
      const minDate=tomorrow.toISOString().slice(0,10);
      form.innerHTML=`
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:13px;font-weight:600;color:#62758a">Verify your phone number</label>
          <input type="tel" name="phone" placeholder="202-555-0123" maxlength="20" style="padding:9px 12px;border:1px solid #dce6ee;border-radius:8px;font-size:14px;width:100%;box-sizing:border-box">
          <label style="font-size:13px;font-weight:600;color:#62758a;margin-top:4px">New date</label>
          <input type="date" name="date" min="${minDate}" style="padding:9px 12px;border:1px solid #dce6ee;border-radius:8px;font-size:14px;width:100%;box-sizing:border-box">
          <label style="font-size:13px;font-weight:600;color:#62758a">New time</label>
          <input type="time" name="time" style="padding:9px 12px;border:1px solid #dce6ee;border-radius:8px;font-size:14px;width:100%;box-sizing:border-box">
          <button type="button" data-nexus-submit style="padding:10px 16px;background:#0369a1;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:4px">Confirm Reschedule</button>
        </div>`;
      const submitBtn2=form.querySelector('[data-nexus-submit]');
      if(submitBtn2){
        try{submitBtn2.addEventListener('click',async()=>{
        const phone=form.querySelector('[name="phone"]').value.trim();
        const date=form.querySelector('[name="date"]').value;
        const time=form.querySelector('[name="time"]').value;
        if(!phone||!date||!time){showMsg('Please fill in all fields.',false);return;}
        const btn2=form.querySelector('[data-nexus-submit]');
        btn2.disabled=true;btn2.textContent='Rescheduling…';
        try{
          const r=await fetch(`/api/bookings/${encodeURIComponent(ref)}/reschedule`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone,date,time})});
          const data=await r.json();
          if(!r.ok)throw new Error(data.error||'Reschedule failed');
          form.style.display='none';
          showMsg(`? Trip rescheduled to ${date} at ${time}. A confirmation text/email has been sent.`,true);
          section.querySelectorAll('[data-nexus-action]').forEach(b=>b.style.display='none');
        }catch(e){showMsg(e.message,false);btn2.disabled=false;btn2.textContent='Confirm Reschedule';}
        });}catch(e){console.warn('[Nexus] Reschedule submit button error',e);}
      }
      });}catch(e){console.warn('[Nexus] Reschedule action button error',e);}
    }
  }

  // Watch for React forms and success screens
  new MutationObserver(()=>{
    document.querySelectorAll('.success[role="status"]').forEach(injectManageButtons);
    injectManageTrip();
  }).observe(document.documentElement,{childList:true,subtree:true});

  // Intercept "Book a Ride" nav links on non-home pages and open an overlay instead of navigating
  function openBookingOverlay(e){
    e.preventDefault();
    if(document.getElementById('nexus-booking-overlay'))return;
    const overlay=document.createElement('div');
    overlay.id='nexus-booking-overlay';
    Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'9999',background:'#e8eef5',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'none'});
    const frame=document.createElement('iframe');
    frame.src='/booking-app.html';
    frame.title='Book a Ride';
    // sandbox: allow scripts, forms, popups (for payment), same-origin for postMessage
    frame.setAttribute('sandbox','allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    Object.assign(frame.style,{width:'min(780px,100%)',height:'min(92vh,780px)',border:'none',borderRadius:'18px',background:'#fff',boxShadow:'0 32px 80px rgba(8,47,73,0.35)'});
    const close=document.createElement('button');
    close.setAttribute('aria-label','Close booking form');
    Object.assign(close.style,{position:'absolute',top:'16px',right:'20px',background:'none',border:'none',color:'#fff',fontSize:'28px',cursor:'pointer',lineHeight:'1',padding:'4px 8px'});
    close.textContent='\u00d7';
    const closeOverlay=()=>{if(overlay.parentNode)overlay.parentNode.removeChild(overlay);};
    close.onclick=closeOverlay;
    overlay.appendChild(close);
    overlay.appendChild(frame);
    overlay.addEventListener('click',ev=>{if(ev.target===overlay)closeOverlay();});
    document.addEventListener('keydown',function esc(ev){if(ev.key==='Escape'){closeOverlay();document.removeEventListener('keydown',esc);}});
    document.body.appendChild(overlay);
    // Auto-close when booking succeeds: watch iframe DOM for .success element
    frame.addEventListener('load',()=>{
      try{
        frame.contentWindow.postMessage({type:'nexus:openBooking'},'*');
        // Watch for booking success div appearing inside the iframe
        const iDoc=frame.contentDocument||frame.contentWindow.document;
        const successObserver=new MutationObserver(()=>{
          if(iDoc.querySelector('.success[role="status"]')){
            successObserver.disconnect();
            // Brief delay so user sees the confirmation, then close
            setTimeout(closeOverlay, 4000);
          }
        });
        successObserver.observe(iDoc.body||iDoc.documentElement,{childList:true,subtree:true});
      }catch{}
    });
  }

  function attachBookingInterceptors(){
    const isBookingPage=location.pathname==='/booking-app.html'||location.pathname==='/dist/booking-app.html';
    if(isBookingPage)return;
    document.querySelectorAll('a[href="/?book=1"],a[href*="book=1"],button[data-book-ride]').forEach(el=>{
      if(!el._nexusIntercepted){
        el._nexusIntercepted=true;
        el.addEventListener('click',e=>{
          e.preventDefault();
          const resolver=window.NexusBookingIntent?.buildBookingUrl;
          const target=typeof resolver==='function' ? resolver(el) : '/booking-app.html';
          window.location.href=target;
        });
      }
    });
  }

  document.addEventListener('DOMContentLoaded',attachBookingInterceptors);
  new MutationObserver(attachBookingInterceptors).observe(document.documentElement,{childList:true,subtree:true});
  window.NexusBooking={scan,refresh:scan,openBookingOverlay,version:'0.42.0'};
})();

