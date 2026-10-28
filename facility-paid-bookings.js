(()=>{'use strict';
 window.NexusFacilityPaidBookings={create({api,isActive}){
  const $=id=>document.getElementById(id);let busy=false,last=0,version=0;
  async function refresh(force=false){
   if(!isActive()||busy||!force&&Date.now()-last<30000)return;
   busy=true;const revision=version;$('paidBookingsStatus').textContent='Refreshing paid bookings…';
   try{
    const data=await api('paid-bookings');if(revision!==version||!isActive())return;
    ['newBooking','bookFromBoard','bookPaidTrip'].forEach(id=>{$(id).href=data.bookingUrl;});
    const body=$('paidBookingRows');body.replaceChildren();
    data.trips.forEach(trip=>{const row=document.createElement('tr');
     [trip.reference,trip.name,trip.service,String(trip.trip_date).slice(0,10)+' · '+String(trip.trip_time).slice(0,5),trip.pickup+' → '+trip.destination,trip.status,String(trip.payment_status).replaceAll('_',' ')].forEach(value=>{const cell=document.createElement('td');cell.textContent=value||'—';row.append(cell);});body.append(row);
    });
    if(!data.trips.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=7;cell.textContent='No paid bookings yet. Choose this facility in Book a Ride and complete the deposit or full payment.';row.append(cell);body.append(row);}
    $('paidBookingsStatus').textContent=data.trips.length+' paid bookings associated with '+data.facility.name+'. Updated '+new Date().toLocaleTimeString('en-US',{timeZone:'America/New_York',timeZoneName:'short'})+'.';last=Date.now();
   }catch(error){if(revision===version)$('paidBookingsStatus').textContent=error.message;}
   finally{busy=false;}
  }
  function clear(){version++;last=0;$('paidBookingRows').replaceChildren();$('paidBookingsStatus').textContent='';}
  $('refreshPaidBookings').addEventListener('click',()=>refresh(true));
  return {refresh,clear};
 }};
})();
