async function facilityFor(query,user){
 const facilities=(await query("SELECT facility_code AS id,name,address FROM facilities WHERE active=true AND lower(name)='futurecare annapolis' AND address ILIKE '%2700%Southaven%' LIMIT 2")).rows;
 if(facilities.length!==1)throw Object.assign(Error('FutureCare Annapolis must have one active facility record before bookings can be linked. Contact Nexus.'),{statusCode:409});
 const facility=facilities[0];
 if(user&&!['ADMIN'].includes(user.role)&&user.scope_id!==facility.id)throw Object.assign(Error('Your account is not assigned to this facility.'),{statusCode:403});
 return facility;
}
async function view(query,user){
 const facility=await facilityFor(query,user);
 const trips=(await query(`SELECT reference,name,service,pickup,destination,trip_date,trip_time,status,payment_status,estimated_fare,balance_due FROM bookings WHERE facility_id=$1 AND booking_source NOT IN ('MOCK','DEMO') AND (payment_status IN ('DEPOSIT_PAID','PAID_IN_FULL','BALANCE_REMINDER_SENT') OR deposit_paid_at IS NOT NULL OR paid_in_full_at IS NOT NULL) ORDER BY trip_date DESC,trip_time DESC LIMIT 250`,[facility.id])).rows;
 return {facility,bookingUrl:'/booking-app.html?facility='+encodeURIComponent(facility.id),trips};
}
module.exports={view,facilityFor};
