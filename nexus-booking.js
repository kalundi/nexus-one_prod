/**
 * nexus-booking.js — Nexus Medical Transit unified booking intercept
 * Intercepts "Book a Ride" links/buttons on every portal page and opens
 * a compact, intelligent booking sheet without leaving the page.
 * Address fields use Nominatim (free) + Google Places (if configured).
 */
(function(){
'use strict';

/* ─── Address typeahead (Nominatim + optional Google Places) ─── */
const NOMINATIM='https://nominatim.openstreetmap.org/search';
let _googleReady=false, _googleLoading=false, _googleCallbacks=[], _cfgPromise=null;

function getConfig(){
  return _cfgPromise||(_cfgPromise=fetch('/api/integrations/config').then(r=>r.json()).catch(()=>({googleMapsEnabled:false})));
}

function loadGoogle(key){
  if(_googleReady)return Promise.resolve();
  if(_googleLoading)return new Promise(r=>_googleCallbacks.push(r));
  _googleLoading=true;
  return new Promise((resolve,reject)=>{
    _googleCallbacks.push(resolve);
    const cb='_nexusGoogleReady_'+Date.now();
    window[cb]=()=>{_googleReady=true;delete window[cb];_googleCallbacks.forEach(fn=>fn());_googleCallbacks=[]};
    const s=document.createElement('script');
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&libraries=places&callback='+cb;
    s.async=true;s.defer=true;s.onerror=reject;
    document.head.appendChild(s);
  });
}

/* Nominatim typeahead returns suggestions as {label, lat, lng} */
async function nominatimSearch(query){
  try{
    const url=NOMINATIM+'?format=json&addressdetails=0&limit=6&countrycodes=us&q='+encodeURIComponent(query);
    const r=await fetch(url,{headers:{'Accept-Language':'en'}});
    const data=await r.json();
    return data.map(d=>({label:d.display_name,lat:parseFloat(d.lat),lng:parseFloat(d.lon)}));
  }catch{return []}
}

/* ─── Suggestion dropdown ─── */
function buildDropdown(input){
  if(input._nexusDrop)return input._nexusDrop;
  const drop=document.createElement('ul');
  drop.className='nbkDrop';
  drop.setAttribute('role','listbox');
  input.parentElement.style.position='relative';
  input.parentElement.appendChild(drop);
  input._nexusDrop=drop;

  input.addEventListener('blur',()=>setTimeout(()=>{drop.hidden=true},200));
  input.setAttribute('autocomplete','off');
  input.setAttribute('spellcheck','false');

  return drop;
}

function showSuggestions(input,items){
  const drop=buildDropdown(input);
  drop.innerHTML='';
  if(!items.length){drop.hidden=true;return;}
  items.slice(0,6).forEach(item=>{
    const li=document.createElement('li');
    li.setAttribute('role','option');
    li.textContent=item.label;
    li.addEventListener('mousedown',e=>{
      e.preventDefault();
      input.value=item.label;
      input.dataset.lat=item.lat||'';
      input.dataset.lng=item.lng||'';
      drop.hidden=true;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    drop.appendChild(li);
  });
  drop.hidden=false;
}

async function attachAddressIntelligence(input){
  if(input._nbkEnhanced)return;
  input._nbkEnhanced=true;

  let timer=null;
  let acInstance=null;

  /* Try Google Places first */
  const cfg=await getConfig().catch(()=>({googleMapsEnabled:false}));
  if(cfg.googleMapsEnabled&&cfg.googleMapsBrowserKey){
    try{
      await loadGoogle(cfg.googleMapsBrowserKey);
      const ac=new google.maps.places.Autocomplete(input,{
        fields:['formatted_address','geometry'],
        componentRestrictions:{country:'us'},
        types:['geocode','establishment']
      });
      ac.addListener('place_changed',()=>{
        const p=ac.getPlace();
        if(!p?.geometry)return;
        input.dataset.lat=p.geometry.location.lat();
        input.dataset.lng=p.geometry.location.lng();
      });
      acInstance=ac;
      return; /* Google Places is active, skip Nominatim */
    }catch(e){/* fall through to Nominatim */}
  }

  /* Nominatim fallback typeahead */
  buildDropdown(input);
  input.addEventListener('input',()=>{
    clearTimeout(timer);
    const q=input.value.trim();
    if(q.length<3){buildDropdown(input).hidden=true;return;}
    timer=setTimeout(async()=>{
      const results=await nominatimSearch(q);
      showSuggestions(input,results);
    },280);
  });
}

/* ─── Dialog HTML + logic ─── */
function createBookingDialog(){
  const d=document.createElement('dialog');
  d.id='nexusBookingSheet';
  d.setAttribute('aria-labelledby','nbkTitle');
  d.innerHTML=`
<div class="nbkHeader">
  <div>
    <span class="nbkEyebrow">Nexus Medical Transit</span>
    <h2 id="nbkTitle">Book a Ride</h2>
  </div>
  <button class="nbkClose" aria-label="Close booking form" type="button">&#x2715;</button>
</div>

<div id="nbkSuccess" class="nbkSuccess" hidden>
  <div class="nbkSuccessIcon" aria-hidden="true">✓</div>
  <h3>Request received!</h3>
  <p>Your transportation request has been submitted. Nexus will review and confirm shortly.</p>
  <p class="nbkRef">Reference: <strong id="nbkRefNum"></strong></p>
  <button class="button" id="nbkDone" type="button">Done</button>
</div>

<form id="nbkForm" class="nbkForm" novalidate>

  <div class="nbkSection">
    <div class="nbkSectionLabel">Your information</div>
    <div class="nbkRow">
      <label class="nbkField">
        Full name<span class="nbkReq">*</span>
        <input name="name" type="text" placeholder="First and last name" required autocomplete="name">
      </label>
      <label class="nbkField">
        Phone number<span class="nbkReq">*</span>
        <input name="phone" type="tel" placeholder="(202) 555-0100" required autocomplete="tel">
      </label>
    </div>
    <label class="nbkField">
      Email <span class="nbkOpt">optional</span>
      <input name="email" type="email" placeholder="you@example.com" autocomplete="email">
    </label>
  </div>

  <div class="nbkSection">
    <div class="nbkSectionLabel">Trip details</div>
    <div class="nbkAddressGroup">
      <label class="nbkField">
        <span class="nbkAddrLabel"><span class="nbkDot nbkPickup" aria-hidden="true"></span>Pickup address<span class="nbkReq">*</span></span>
        <input name="pickup" type="text" placeholder="Enter pickup address…" required>
      </label>
      <div class="nbkRouteLine" aria-hidden="true"></div>
      <label class="nbkField">
        <span class="nbkAddrLabel"><span class="nbkDot nbkDest" aria-hidden="true"></span>Destination<span class="nbkReq">*</span></span>
        <input name="destination" type="text" placeholder="Enter destination address…" required>
      </label>
    </div>
    <div class="nbkRow">
      <label class="nbkField">
        Date<span class="nbkReq">*</span>
        <input name="date" type="date" required id="nbkDate">
      </label>
      <label class="nbkField">
        Time<span class="nbkReq">*</span>
        <input name="time" type="time" required id="nbkTime">
      </label>
    </div>
    <label class="nbkField">
      Service type<span class="nbkReq">*</span>
      <select name="service" required>
        <option value="">Select service…</option>
        <option value="ambulatory">Ambulatory</option>
        <option value="wheelchair">Wheelchair</option>
        <option value="broda">Broda chair</option>
        <option value="stretcher">Stretcher</option>
        <option value="bariatric">Bariatric</option>
        <option value="bls">BLS ambulance</option>
        <option value="als1">ALS I ambulance</option>
        <option value="als2">ALS II ambulance</option>
      </select>
    </label>
  </div>

  <div class="nbkSection nbkNoteSection">
    <label class="nbkField">
      Special instructions <span class="nbkOpt">optional</span>
      <textarea name="notes" rows="2" placeholder="Mobility aids, medical needs, multi-leg trips…"></textarea>
    </label>
  </div>

  <div class="nbkFooter">
    <p id="nbkError" class="nbkError" role="alert"></p>
    <button class="button" type="submit" id="nbkSubmit"><span>Request transportation</span></button>
  </div>
</form>`;

  document.body.appendChild(d);

  /* Set minimum date to today */
  const today=new Date().toISOString().split('T')[0];
  d.querySelector('#nbkDate').min=today;
  d.querySelector('#nbkDate').value=today;

  /* Attach address intelligence to both fields */
  setTimeout(()=>{
    d.querySelectorAll('input[name="pickup"],input[name="destination"]').forEach(attachAddressIntelligence);
  },0);

  /* Close handlers */
  d.querySelector('.nbkClose').addEventListener('click',()=>d.close());
  d.querySelector('#nbkDone')?.addEventListener('click',()=>d.close());
  d.addEventListener('click',e=>{if(e.target===d)d.close();});

  /* Reset on close */
  d.addEventListener('close',()=>{
    d.querySelector('#nbkForm').hidden=false;
    d.querySelector('#nbkSuccess').hidden=true;
    d.querySelector('#nbkError').textContent='';
    d.querySelector('#nbkForm').reset();
    d.querySelector('#nbkDate').value=today;
    d.querySelectorAll('.nbkDrop').forEach(dr=>dr.remove());
    d.querySelectorAll('input[name="pickup"],input[name="destination"]').forEach(inp=>{
      delete inp._nbkEnhanced;delete inp._nexusDrop;inp.dataset.lat='';inp.dataset.lng='';
    });
  });

  /* Submit */
  d.querySelector('#nbkForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const err=d.querySelector('#nbkError');
    const btn=d.querySelector('#nbkSubmit');
    err.textContent='';

    /* Inline validation */
    const required=['name','phone','pickup','destination','date','time','service'];
    const fd=new FormData(form);
    for(const k of required){
      if(!fd.get(k)?.trim()){
        const el=form.querySelector(`[name="${k}"]`);
        el?.focus();err.textContent='Please fill in all required fields.';return;
      }
    }

    btn.disabled=true;btn.querySelector('span').textContent='Submitting…';
    try{
      const pickupInput=form.querySelector('[name="pickup"]');
      const destInput=form.querySelector('[name="destination"]');
      const body={
        name:fd.get('name').trim(),
        phone:fd.get('phone').trim(),
        email:fd.get('email')?.trim()||undefined,
        service:fd.get('service'),
        pickup:fd.get('pickup').trim(),
        destination:fd.get('destination').trim(),
        date:fd.get('date'),
        time:fd.get('time'),
        notes:fd.get('notes')?.trim()||undefined,
        pickupLat:pickupInput?.dataset.lat||undefined,
        pickupLng:pickupInput?.dataset.lng||undefined,
        destinationLat:destInput?.dataset.lat||undefined,
        destinationLng:destInput?.dataset.lng||undefined,
      };
      /* Remove undefined keys */
      Object.keys(body).forEach(k=>body[k]===undefined&&delete body[k]);

      const res=await fetch('/api/bookings',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      const json=await res.json();
      if(!res.ok)throw new Error(json.error||'Request failed');

      d.querySelector('#nbkRefNum').textContent=json.booking?.reference||'—';
      d.querySelector('#nbkForm').hidden=true;
      d.querySelector('#nbkSuccess').hidden=false;
      d.querySelector('#nbkSuccess').scrollIntoView({block:'nearest'});
    }catch(ex){
      err.textContent=ex.message||'Something went wrong. Please try again.';
    }finally{
      btn.disabled=false;btn.querySelector('span').textContent='Request transportation';
    }
  });

  return d;
}

/* ─── Intercept all Book a Ride triggers ─── */
function intercept(el){
  if(el._nbkIntercepted)return;
  el._nbkIntercepted=true;
  el.addEventListener('click',e=>{
    e.preventDefault();
    const resolver=window.NexusBookingIntent?.buildBookingUrl;
    const target=typeof resolver==='function' ? resolver(el) : '/booking-app.html';
    window.location.href=target;
  });
}

function scan(){
  document.querySelectorAll('a[href="/?book=1"],a[href*="book=1"],button[data-book-ride],[data-nexus-unified-booking]').forEach(intercept);
}

new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',scan);
scan();

})();
