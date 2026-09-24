function isDuplicateTrip(error){
 return error?.code==='23505'&&error?.constraint==='bookings_duplicate_trip_unique';
}
const duplicateTripResponse={code:'DUPLICATE_TRIP',error:'This trip already exists. Review the existing booking before submitting again.'};
module.exports={isDuplicateTrip,duplicateTripResponse};
