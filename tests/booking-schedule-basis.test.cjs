const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('booking-app.html','utf8');
const client=fs.readFileSync('booking-app.js','utf8');
const api=fs.readFileSync('netlify/functions/api.cjs','utf8');

test('patient can schedule by pickup or appointment time',()=>{
 assert.match(html,/id="scheduleBasis"/);
 assert.match(html,/<option value="PICKUP">Pickup time<\/option>/);
 assert.match(client,/function applyAppointmentEstimateFromPickup/);
 assert.match(client,/function applyPickupEstimateFromAppointment/);
 assert.match(client,/appointmentTimeInput\.classList\.toggle\('systemGeneratedField',pickupBasis\)/);
 assert.match(client,/\$\('tripTime'\)\.classList\.toggle\('systemGeneratedField',!pickupBasis\)/);
 assert.match(client,/scheduleBasis: isPickupTimeBasis\(\)\?'PICKUP':'APPOINTMENT'/);
 assert.match(api,/Schedule basis: \$\{scheduleBasis\}/);
 assert.match(api,/Estimated arrival time:/);
});
