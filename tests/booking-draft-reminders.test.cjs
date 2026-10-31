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
 assert.match(reminder,/Reply HELP for help/);
 assert.match(reminder,/data rates may apply/i);
});

test('undeliverable draft phones are parked instead of retried every minute',()=>{
 const {MAX_REMINDER_ATTEMPTS,PERMANENT_TWILIO_ERROR_CODES}=require('../netlify/functions/booking-draft-reminders.cjs');
 assert.equal(MAX_REMINDER_ATTEMPTS,3);
 for(const code of [21211,21408,21610,21612])assert.equal(PERMANENT_TWILIO_ERROR_CODES.has(code),true);
 // Destination is validated before any Twilio send is attempted.
 assert.match(reminder,/isValidUsPhone\(draft\.phone\)/);
 assert.match(reminder,/invalid-phone-format/);
 // Permanent failures and exhausted attempts are parked via reminder_sent_at.
 assert.match(reminder,/parkDraft\(draft\.phone/);
 // Transient failures defer the next attempt instead of refiring next minute.
 assert.match(reminder,/reminder_due_at=now\(\)\+\(\$4\|\|' minutes'\)::interval/);
});

test('migration 099 tracks reminder attempts and the parking reason',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'..','database','migrations','099.001_booking_draft_reminder_attempts.sql'),'utf8');
 assert.match(migration,/reminder_attempts integer NOT NULL DEFAULT 0/);
 assert.match(migration,/reminder_last_error text/);
});
