'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify,store,report}=require('../netlify/functions/_shared/nex-intent-insights.cjs');
test('classifies family questions without retaining their contents',()=>{
 const text='Can u xfer my mum to NYC? Email her at example@email.com, phone 301-555-1234';
 const result=classify(text,'composed',['long-distance']);
 assert.equal(result.intent,'interstate');assert.ok(result.terms.includes('family'));
 assert.ok(result.terms.includes('transfer'));assert.ok(!JSON.stringify(result).includes('example@email'));
 assert.ok(!JSON.stringify(result).includes('301-555'));
});
test('logs only categorical fields',async()=>{
 let sql,params;await store(async(s,p)=>{sql=s;params=p;return {rows:[]}},'My grandma at 123 Main Street needs a ride to NY',{status:200,body:{mode:'composed',sources:['long-distance'],answer:'Yes'}});
 assert.match(sql,/INSERT INTO nex_intent_events/);assert.equal(params.length,4);
 assert.ok(!JSON.stringify(params).includes('123 Main'));
});
test('does not log unsuccessful responses',async()=>{
 let called=false;await store(async()=>{called=true},{},{status:500,body:{}});assert.equal(called,false);
});
test('report is limited to permitted reporting window',async()=>{
 const calls=[];const r=await report(async(s,p)=>{calls.push(p[0]);return {rows:[]}},365);
 assert.equal(r.days,90);assert.deepEqual(calls,[90,90,90,90]);
});
