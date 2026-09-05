const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('booking-app.js','utf8');

test('fare estimator rechecks traffic at the projected pickup departure',()=>{
 assert.match(client,/resolveRouteDepartureTime\(tripDate, String\(appointmentTimeInput\?\.value \|\| ''\)\.trim\(\), Math\.ceil\(initialMinutes\) \+ 15\)/);
 assert.match(client,/drivingOptions:\{departureTime:scheduledDeparture,trafficModel:google\.maps\.TrafficModel\.BEST_GUESS\}/);
});
