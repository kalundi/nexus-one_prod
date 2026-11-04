'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../netlify/functions/_shared/staff-assistant.cjs');

const USERS={
 admin:{id:'admin-test',role:'ADMIN',session_id:'active-1'},
 dispatch:{id:'dispatch-test',role:'DISPATCHER',session_id:'active-2'},
 driver:{id:'driver-test',role:'DRIVER',session_id:'active-3'},
 facility:{id:'facility-test',role:'FACILITY',session_id:'active-4',scope_id:'FAC-4'}
};
const handler=createHandler({
 query:async()=>({rows:[]}),
 requireUser:async token=>USERS[token]||null,
 bearer:e=>(e.headers.authorization||'').replace('Bearer ',''),
 json:(statusCode,body)=>({statusCode,body:JSON.stringify(body)}),
 parseBody:e=>JSON.parse(e.body||'{}'),
 audit:async()=>null,
 fetchImpl:async()=>{throw Error('Network must not be used for deterministic FAQ');},
 now:()=>Date.parse('2026-11-03T20:00:00Z')
});
async function ask(role,question){
 const res=await handler({
  httpMethod:'POST',headers:{authorization:'Bearer '+role},
  body:JSON.stringify({question})
 },['assistant','ask'],'POST');
 return {status:res.statusCode,...JSON.parse(res.body)};
}
test('signed-in ADMIN and DISPATCHER get the real public booking explanation without 500',async()=>{
 for(const role of ['admin','dispatch']){
  const result=await ask(role,'How does booking work?');
  assert.equal(result.status,200,role+': '+JSON.stringify(result));
  assert.match(result.answer,/book|pickup|ride/i);
  assert.ok(Array.isArray(result.relatedContent),role);
  assert.ok(result.relatedContent.some(item=>item.kind==='video'),role);
  assert.ok(result.relatedContent.some(item=>item.url==='https://mynexusride.com'),role);
  assert.equal(result.staff.role,role==='admin'?'ADMIN':'DISPATCHER');
 }
});
test('signed-in other roles inherit public FAQ answers without server error',async()=>{
 for(const role of ['driver','facility']){
  const result=await ask(role,'What services do you offer?');
  assert.equal(result.status,200);
  assert.match(result.answer,/transport|ride|wheelchair|stretcher/i);
  assert.equal(result.staff.role,role.toUpperCase());
 }
});
test('generic public question no longer invokes non-existent visitor methods',async()=>{
 const result=await ask('dispatch','What are your service areas?');
 assert.equal(result.status,200);
 assert.doesNotMatch(result.answer,/Internal server error/);
});
test('authenticated board questions stay in role-checked staff handling',async()=>{
 const result=await ask('admin',"What's on the board today?");
 assert.equal(result.status,200);
 assert.equal(result.mode,'staff');
 assert.equal(result.staff.role,'ADMIN');
});
