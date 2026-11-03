'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Review=require('../netlify/functions/_shared/nex-insight-reviews.cjs');

test('save stores only model-generated recommendations with actor id and pending status',async()=>{
 let args;
 const item=await Review.save(async(sql,params)=>{args=params;assert.match(sql,/INSERT INTO nex_insight_reviews/);return {rows:[{id:'12',status:'pending'}]};},'admin-1',30,'Review approved transportation FAQ coverage');
 assert.equal(item.status,'pending');
 assert.deepEqual(args,['admin-1',30,'Review approved transportation FAQ coverage']);
});
test('review changes require pending status and parameterized queries',async()=>{
 let sql,args;
 const result=await Review.setStatus(async(s,p)=>{sql=s;args=p;return {rows:[{id:'12',status:'reviewed'}]};},12,'reviewed','admin-1');
 assert.equal(result.status,'reviewed');
 assert.match(sql,/WHERE id=\$1 AND status='pending'/);
 assert.deepEqual(args,['12','reviewed','admin-1']);
 await assert.rejects(()=>Review.setStatus(()=>{},12,'approved','admin-1'),/Invalid review action/);
});
test('read listing and lookup have strict bounded identifiers',async()=>{
 let called=0;
 const invalid=await Review.get(async()=>{called++;},'12 OR 1=1');
 assert.equal(invalid,null);assert.equal(called,0);
 const rows=await Review.list(async(sql,args)=>{assert.match(sql,/ORDER BY id DESC/);assert.equal(args[0],50);return {rows:[]};},10000);
 assert.deepEqual(rows,[]);
});
test('recommendations remain separate from runtime knowledge',()=>{
 const knowledge=fs.readFileSync('netlify/functions/_shared/nex-reviewed-knowledge.cjs','utf8');
 assert.doesNotMatch(knowledge,/nex_insight_reviews|nex-insight-reviews/);
 const staff=fs.readFileSync('netlify/functions/_shared/staff-assistant.cjs','utf8');
 assert.match(staff,/user\.role!=='ADMIN'/);
 assert.match(staff,/issueProposal\(user,\{kind:'nex-review'/);
 assert.match(staff,/entry\.kind==='nex-review'/);
 assert.match(staff,/if\(action==='cancel'\)/);
 const dashboard=fs.readFileSync('nex-insights.html','utf8');
 assert.match(dashboard,/id="reviewItems"/);
});
