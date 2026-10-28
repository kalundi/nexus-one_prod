(()=>{'use strict';
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 let user=null,revision=0,busy=false,requiredId='',userKey='',portalUser=null,portalToken='',checkingPortal=false;
 function selection(facilities,id=''){
  const select=$('bookingFacilityId'),previous=id||select.value;
  select.replaceChildren(new Option('No associated facility',''));
  facilities.forEach(f=>select.add(new Option(f.name+(f.address?' — '+f.address:''),f.id)));
  if(facilities.some(f=>f.id===previous))select.value=previous;
 }
 async function load(id='',search=''){
  const version=++revision;busy=true;$('bookingFacilityStatus').textContent='Loading facilities…';
  try{
   const response=await fetch('/api/booking/facilities?'+new URLSearchParams(id?{id}:{q:search}),{cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Facility search is unavailable.');
   if(version!==revision)return;
   selection(data.facilities||[],id);
   if(id&&!data.facilities?.some(f=>f.id===id))throw Error('This facility is unavailable. Choose an active facility before booking.');
   $('bookingFacilityStatus').textContent=id?'Facility selected. This trip will appear in its portal.':data.facilities?.length?'Choose a facility from the results.':'No matching facilities. Try another name or address.';
  }catch(error){if(version===revision)$('bookingFacilityStatus').textContent=error.message;}
  finally{if(version===revision){busy=false;$('bookingFacilityId').disabled=user?.role==='FACILITY';}}
 }
 function setUser(next){
  const savedToken=params.get('facilityPortal')==='1'?sessionStorage.getItem('nexusFacilityDemoToken')||'':'';
  user=next||savedToken&&savedToken===portalToken&&portalUser||null;
  const scoped=user?.role==='FACILITY';$('bookingFacilityField').hidden=!scoped;
  const key=(user?.role||'')+':'+(user?.scopeId||user?.scope_id||'');
  if(key!==userKey){userKey=key;revision++;busy=false;requiredId=scoped?(user.scopeId||user.scope_id||''):'';
   $('bookingFacilitySearch').disabled=true;$('bookingFacilityFind').disabled=true;$('bookingFacilityId').disabled=true;
   if(!scoped){selection([]);$('bookingFacilityStatus').textContent='';}
   else if(requiredId)load(requiredId);
  }
  if(!next&&savedToken&&savedToken!==portalToken&&!checkingPortal)verifyPortal(savedToken);
 }
 async function verifyPortal(accessToken){
  checkingPortal=true;
  try{
   const response=await fetch('/api/facility-demo/booking-context',{headers:{authorization:'Bearer '+accessToken},cache:'no-store'}),data=await response.json();
   if(response.ok&&sessionStorage.getItem('nexusFacilityDemoToken')===accessToken){portalToken=accessToken;portalUser=data.user;if(!user)setUser(null);}
  }catch{}finally{checkingPortal=false;}
 }
 function validate(){
  if(user?.role!=='FACILITY')return !checkingPortal;
  if(busy||requiredId&&$('bookingFacilityId').value!==requiredId||user?.role==='FACILITY'&&!$('bookingFacilityId').value){$('bookingFacilityStatus').textContent=busy?'Wait for the facility to finish loading.':'Choose the associated facility before booking.';$('bookingFacilityField').scrollIntoView({block:'center'});return false;}return true;
 }
 function init(){
  window.addEventListener('message',event=>{
   if(params.get('productionFacilityPortal')!=='1'||window.parent===window||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='nexus:facility-location')return;
   const destination=String(event.data.destination||'').trim();if(!destination||destination.length>1000)return;
   const input=$('destination');if(input){input.value=destination;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  $('bookingFacilityFind').addEventListener('click',()=>{const search=$('bookingFacilitySearch').value.trim();if(search.length<2){$('bookingFacilityStatus').textContent='Enter at least two characters.';return;}requiredId='';load('',search);});
  $('bookingFacilitySearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('bookingFacilityFind').click();}});
  $('bookingFacilityId').addEventListener('change',()=>{if(user?.role!=='FACILITY')requiredId='';$('bookingFacilityStatus').textContent=$('bookingFacilityId').value?'The selected facility can view this trip. Pay securely during booking.':'No facility is associated with this trip.';});
  setUser(null);
 }
 function lock(){['bookingFacilitySearch','bookingFacilityFind','bookingFacilityId'].forEach(id=>$(id).disabled=true);}
 window.NexusBookingFacility={setUser,validate,lock,getFacilityId:()=>user?.role==='FACILITY'?$('bookingFacilityId').value:null};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
