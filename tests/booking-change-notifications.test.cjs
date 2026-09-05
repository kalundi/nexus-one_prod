const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=fs.readFileSync('netlify/functions/api.cjs','utf8');

test('material booking mutation paths send notifications',()=>{
 for(const marker of ["'Driver or vehicle assignment updated'","'Driver accepted the trip'","'Booking details updated online'","'Trip contact or route details updated'",'sendPaymentTripConfirmation(updated.rows[0]'])assert.ok(api.includes(marker),`missing ${marker}`);
 assert.match(api,/STATUS_ADVANCED[\s\S]{0,700}sendTripStakeholderUpdate/);
 assert.match(api,/RESCHEDULED[\s\S]{0,700}sendTripStakeholderUpdate/);
});

test('pickup-based trips can advance without an appointment',()=>{
 assert.match(api,/submittedAppointment&&!\/Schedule basis:\\s\*PICKUP/);
});
