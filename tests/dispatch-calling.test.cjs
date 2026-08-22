const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'netlify/functions/api.cjs'),'utf8');
const dispatch=fs.readFileSync(path.join(root,'dispatch.html'),'utf8');
const migration=fs.readFileSync(path.join(root,'database/migrations/070.001_dispatch_voice_calls.sql'),'utf8');

test('dispatch callback requires an authorized role and configured dispatch destination',()=>{
 assert.match(api,/requireUser\(bearer\(event\),\['ADMIN','DISPATCHER'\]\)/);
 assert.match(api,/const dispatcherPhone=toE164\(config\.primaryDispatch\)/);
 assert.match(api,/Configure DISPATCH_PRIMARY_NUMBER before placing callbacks/);
});

test('callback uses an opaque expiring token and Nexus caller ID',()=>{
 assert.match(api,/crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
 assert.match(api,/callback_requested_at>now\(\)-interval '15 minutes'/);
 assert.match(api,/from:toE164\(config\.callerId\)/);
 assert.doesNotMatch(api,/callback-connect[^\n]*callerPhone/);
});

test('dispatch UI exposes incoming calls and Twilio callback workflow',()=>{
 assert.match(dispatch,/Incoming calls \+ callbacks/);
 assert.match(dispatch,/\(888\) 639-5766/);
 assert.match(dispatch,/\/api\/dispatch\/calls\/\$\{encodeURIComponent\(id\)\}\/callback/);
 assert.match(dispatch,/>Call Back</);
});

test('voice-call migration stores minimal call and callback audit fields',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS dispatch_voice_calls/);
 assert.match(migration,/callback_requested_by uuid REFERENCES users\(id\)/);
 assert.doesNotMatch(migration,/patient_name|medical|diagnosis|notes/i);
});
