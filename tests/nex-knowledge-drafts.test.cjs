'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const drafts=require('../netlify/functions/_shared/nex-knowledge-drafts.cjs');
const source='wheelchair-transportation.html';
const question='Can Nexus provide wheelchair transportation for appointments?';
const answer='Nexus provides wheelchair-accessible transportation. Visit our wheelchair transportation page for service details and contact the Nexus team for booking assistance.';

test('FAQ editor uses the same runtime-approved entry validator',()=>{
 const item=drafts.candidate(question,answer,source,'admin-1');
 assert.match(item.id,/^web-[a-f0-9]{16}$/);
 assert.equal(item.review_status,'approved');
 assert.equal(item.source,source);
 assert.equal(item.keywords.length,0);
 assert.throws(()=>drafts.candidate(question,'The fare is $500.',source,'admin-1'),/approved-knowledge rules/);
 assert.throws(()=>drafts.candidate(question,answer,'unapproved-source.html','admin-1'),/approved-knowledge rules/);
 assert.throws(()=>drafts.candidate(question,answer+' https://suspicious.example.com',source,'admin-1'),/approved-knowledge rules/);
});
test('creation is tied to a reviewed recommendation, with revision history',async()=>{
 let statement;
 const saved=await drafts.save(async(sql,args)=>{
   statement=sql;
   assert.equal(args[0],'7');
   return {rows:[{id:'42',review_id:'7',state:'draft',revision:1}]};
 },{reviewId:'7',question,answer,source,actor:'admin-1'});
 assert.equal(saved.state,'draft');
 assert.match(statement,/status='reviewed'/);
 assert.match(statement,/nex_knowledge_draft_history/);
});
test('editing requires a matching revision and draft state',async()=>{
 let statement;
 const item=await drafts.revise(async(sql,args)=>{
  statement=sql;assert.equal(args[1],1);return {rows:[{id:42,revision:2,state:'draft'}]};
 },{id:'42',revision:1,question,answer,source,actor:'admin-1'});
 assert.equal(item.revision,2);
 assert.match(statement,/revision=\$2 AND state='draft'/);
 assert.match(statement,/nex_knowledge_draft_history/);
});
test('approval requires a current draft revision, and does not publish',async()=>{
 const queries=[];
 const row={id:'42',revision:2,question,answer,source,state:'draft'};
 const res=await drafts.transition(async(sql,args)=>{
   queries.push(sql);
   if(sql.includes('SELECT id,review_id'))return {rows:[row]};
   return {rows:[{...row,revision:3,state:'approved',approved_by:'admin-1',approved_at:'2026-11-03T15:00:00Z'}]};
 },{id:42,revision:2,action:'approve',actor:'admin-1'});
 assert.equal(res.state,'approved');
 assert.match(queries[1],/nex_knowledge_draft_history/);
 assert.doesNotMatch(queries.join('\n'),/nex-approved-knowledge\.json|INSERT INTO visitor_knowledge/i);
});
test('export is restricted to approved entries and preserves approver',()=>{
 assert.throws(()=>drafts.exportEntry({state:'draft'}),/Only approved/);
 const exported=drafts.exportEntry({state:'approved',approved_at:'2026-11-03T15:00:00Z',approved_by:'admin-1',question,answer,source},'other-user');
 assert.equal(exported.approved_by,'admin-1');
 assert.equal(exported.questions[0],question);
});
test('existing deployed Nex knowledge remains file-reviewed and unchanged',()=>{
 const loader=fs.readFileSync('netlify/functions/_shared/nex-reviewed-knowledge.cjs','utf8');
 assert.match(loader,/require\('\.\/nex-approved-knowledge\.json'\)/);
 assert.doesNotMatch(loader,/nex_knowledge_drafts/);
 const endpoint=fs.readFileSync('netlify/functions/nex-knowledge-drafts.cjs','utf8');
 assert.match(endpoint,/requireUser\(bearer\(event\),\['ADMIN'\]\)/);
 assert.match(endpoint,/sourceVerified!==true/);
 assert.match(endpoint,/manual-github-review-required/);
});
