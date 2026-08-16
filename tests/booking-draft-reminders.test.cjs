'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const api=fs.readFileSync(path.join(__dirname,'..','netlify','functions','api.cjs'),'utf8');
const reminder=fs.readFileSync(path.join(__dirname,'..','netlify','functions','booking-draft-reminders.cjs'),'utf8');
const config=fs.readFileSync(path.join(__dirname,'..','netlify.toml'),'utf8');

test('booking drafts reset a five-minute inactivity deadline',()=>{
 assert.match(api,/booking-drafts[\s\S]*now\(\)\+interval '5 minutes'/);
});

test('completed bookings cancel unfinished-booking reminders',()=>{
 assert.match(api,/UPDATE booking_drafts SET completed_at=now\(\)/);
});

test('scheduled reminder sends only once per phone number',()=>{
 assert.match(config,/\[functions\.booking-draft-reminders\][\s\S]*schedule = "\* \* \* \* \*"/);
 assert.match(reminder,/DISTINCT ON \(regexp_replace\(phone/);
 assert.match(reminder,/reminder_sent_at=now\(\)/);
 assert.match(reminder,/Reply STOP to opt out/);
});
