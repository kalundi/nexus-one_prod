'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const dashboard=fs.readFileSync('netlify/functions/nex-insights.cjs','utf8');
const knowledge=fs.readFileSync('netlify/functions/nex-knowledge-drafts.cjs','utf8');
const staff=fs.readFileSync('netlify/functions/_shared/staff-assistant.cjs','utf8');

test('Nex admin endpoints still enforce DB-session ADMIN access',()=>{
 for(const endpoint of [dashboard,knowledge]){
   assert.match(endpoint,/requireUser\(bearer\(event\),\['ADMIN'\]\)/);
   assert.match(endpoint,/!.*\.session_id/);
 }
});
test('knowledge approval requires explicit source attestation and never directly publishes',()=>{
 assert.match(knowledge,/sourceVerified!==true/);
 assert.match(knowledge,/manual-github-review-required/);
 assert.doesNotMatch(knowledge,/writeFileSync|nex-approved-knowledge\.json'\s*,\s*['"]w/);
});
test('staff actions keep single-use proposals and role checks',()=>{
 assert.match(staff,/proposals\.delete\(submittedKey\)/);
 assert.match(staff,/entry\.userId !== user\.id/);
 assert.match(staff,/entry\.expires < now\(\)/);
 assert.match(staff,/entry\.kind==='nex-review'/);
 assert.match(staff,/user\.role!=='ADMIN'/);
});
