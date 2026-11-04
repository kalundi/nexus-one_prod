'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('visitor-assistant.js','utf8');
const start=src.indexOf('  var PRICE_RE = ');
const end=src.indexOf('  // Narrow client-side mirror',start);
assert.ok(start>=0 && end>start,'Estimate intent recognition source exists');
const context=vm.createContext({COST_PROMPT:'Do you want to know what your ride would cost?'});
vm.runInContext(src.slice(start,end)+'\nthis.wantsRideEstimate=wantsRideEstimate;',context);
const classify=context.wantsRideEstimate;
test('admins can request a customer estimate using conversational phrases',()=>{
 for(const q of ['I need an estimate','I want a quote','Can you give me an estimate?','Please calculate a quote','Estimate a ride','How much would a wheelchair ride cost?','Do you want to know what your ride would cost?']){
  assert.equal(classify(q),true,q);
 }
});
test('staff operational, finance and other requests retain role-aware routing',()=>{
 for(const q of ['What is on the board today?','Estimate fleet expenses','Give me payroll estimate','Show my trips','What is the revenue estimate?','How much does the board cost?','Hi']){
  assert.equal(classify(q),false,q);
 }
});
test('estimate flow routing occurs before staff dispatch fallback',()=>{
 const handler=src.slice(src.indexOf('  function handleUserText(raw) {'));
 const emergency=handler.indexOf('if (EMERGENCY_RE.test(q))');
 const wizard=handler.indexOf('if (flow)');
 const estimate=handler.indexOf('if (wantsRideEstimate(q))');
 const staff=handler.indexOf('if (staffActive) { ask(q); return; }');
 assert.ok(emergency>=0 && emergency < wizard && wizard < estimate && estimate < staff);
 assert.match(handler,/if \(wantsRideEstimate\(q\)\) \{ addMessage\(q, 'user'\); startEstimateFlow\(\); return; \}/);
});
test('staff quote followups use public repricing without changing role-gated operations',()=>{
 assert.match(src,/function ask\(question, publicEstimateFollowup\)/);
 assert.match(src,/fetch\(publicEstimateFollowup \? ENDPOINT : \(authHdr \? STAFF_ENDPOINT : ENDPOINT\)/);
 assert.match(src,/if \(lastEstimate && looksLikeFollowUp\(q\)\) \{ ask\(q, true\); return; \}/);
 assert.match(src,/if \(staffActive\) \{ ask\(q\); return; \}/);
 assert.match(src,/if \(staffActive && staffChipLabels && staffChipLabels.length\)/);
 assert.match(src,/label: 'I need an estimate'/);
});
