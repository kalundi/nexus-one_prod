'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {isPublicIntent,isStaffIntent}=require('../netlify/functions/_shared/nex-public-role-intent.cjs');

test('visitor knowledge remains available to every signed-in role',()=>{
 for(const q of [
  'What services do you offer?',
  'How does booking work?',
  'How can I schedule a ride?',
  'What are your operating hours?',
  'Do you offer wheelchair transportation?',
  'Can Nexus provide stretcher transportation?',
  'Where do you operate?',
  'Show me your videos on YouTube',
  'What is your phone number?',
  'Tell me about accessibility',
  'What about stretcher service?',
  'I need wheelchair transportation',
  'I want help booking a ride',
  'Someone is not breathing call 911',
  'This is a medical emergency'
 ]){
  assert.equal(isPublicIntent(q,{intent:'board'}),true,q);
  assert.equal(isStaffIntent(q,{intent:'board'}),false,q);
 }
});
test('protected operational requests do not fall back to public answer or lose scope',()=>{
 for(const q of [
  'What is on the board today?',
  'How many trips today?',
  'How many trips do I have today?',
  'Who is on duty?',
  'Any open shifts?',
  'What is my schedule?',
  'Where is my driver?',
  'Tell me about NMT-20261102-1005',
  'Mark Nex recommendation #12 reviewed',
  'Show Nex analytics this week',
  'What are my rides tomorrow?',
  'How much revenue did we make on wheelchair trips today?',
  'How do I assign a trip?'
 ]){
  assert.equal(isPublicIntent(q,{intent:'board'}),false,q);
 }
});
test('public emergency help takes precedence over staff mode',()=>{
 for(const q of ['Someone is not breathing, call 911','Medical emergency, severe bleeding','A driver is unconscious']){
   assert.equal(isPublicIntent(q,{intent:'board'}),true,q);
 }
});
test('short operational follow-up stays tied to authenticated staff state',()=>{
 for(const q of ['And tomorrow?','What about the wheelchair ones?','Today?']){
  assert.equal(isStaffIntent(q,{intent:'unassigned'}),true,q);
 }
 assert.equal(isStaffIntent('How does booking work?',{intent:'unassigned'}),false);
});
test('Nex staff pipeline checks public intent without replacing role checks',()=>{
 const source=fs.readFileSync('netlify/functions/_shared/staff-assistant.cjs','utf8');
 const start=source.indexOf('    // Existing authenticated staff-chat session controls access;');
 const publicBranch=source.indexOf('if (isPublicIntent(question, state))',start);
 const roleBranch=source.indexOf('if (ACTION_ROLES.includes(role) || role',publicBranch);
 assert.ok(start>=0 && publicBranch>start && roleBranch>publicBranch);
 assert.match(source,/if \(isPublicIntent\(question, state\)\) \{\s*return handlePublicFallback\(event, user, body\)/);
 assert.match(source,/const user = await resolveStaffUser\(event\)/);
 assert.match(source,/if \(!staffRole\) return handlePublicFallback\(event, user, body\)/);
});
test('signed-in widget offers visitor features and retains staff mode',()=>{
 const widget=fs.readFileSync('visitor-assistant.js','utf8');
 assert.match(widget,/Staff still have access to the same customer ride quote workflow/);
 assert.match(widget,/How does booking work\?/);
 assert.match(widget,/What services do you offer\?/);
 assert.match(widget,/if \(staffActive\) \{ ask\(q\); return; \}/);
});
