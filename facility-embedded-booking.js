(()=>{'use strict';
 window.NexusFacilityEmbeddedBooking={create({isActive,showBookings,refreshBookings}){
  const frame=document.getElementById('facilityBookingFrame'),status=document.getElementById('facilityBookingStatus');let configured=false;
  function configure(bookingUrl){
   if(!isActive()||configured)return;
   const url=new URL(bookingUrl,location.origin);
   if(url.origin!==location.origin||url.pathname!=='/booking-app.html'||!url.searchParams.get('facility')){error('The facility booking link is unavailable. Refresh the portal and try again.');return;}
   url.searchParams.set('facilityPortal','1');
   const returned=new URLSearchParams(location.search);
   if(['success','cancelled'].includes(returned.get('payment'))&&returned.get('bookingReference')){
    url.searchParams.set('payment',returned.get('payment'));url.searchParams.set('bookingReference',returned.get('bookingReference'));
   }
   frame.src=url.pathname+url.search;configured=true;status.textContent='';frame.hidden=false;
  }
  function error(message){if(!configured)status.textContent=message;}
  function clear(){configured=false;frame.src='about:blank';frame.hidden=true;status.textContent='Sign in to open the booking app.';}
  window.addEventListener('message',event=>{
   if(!isActive()||event.origin!==location.origin||event.source!==frame.contentWindow)return;
   if(event.data?.type==='nexus:facility-booking-saved')refreshBookings();
   if(event.data?.type==='nexus:facility-checkout'){
    let url;try{url=new URL(event.data.url);}catch{return;}
    if(url.protocol!=='https:'&&!(url.origin===location.origin&&['localhost','127.0.0.1'].includes(location.hostname)))return;
    location.assign(url.href);
   }
  });
  document.getElementById('viewFacilityPaidBookings').addEventListener('click',showBookings);
  frame.addEventListener('load',()=>{if(configured)status.textContent='';});
  return {configure,error,clear};
 }};
})();
