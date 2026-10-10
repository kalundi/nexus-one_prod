function isDuplicateTrip(error){
 return error?.code==='23505'&&['bookings_duplicate_trip_unique','bookings_duplicate_appointment_unique','bookings_duplicate_referral_unique'].includes(error?.constraint);
}
const duplicateTripResponse={code:'DUPLICATE_TRIP',error:'A booking for this patient at this date and time, or with this broker referral, already exists. Open the existing trip to update it.'};
module.exports={isDuplicateTrip,duplicateTripResponse};
