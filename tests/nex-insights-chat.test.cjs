'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isInsightsQuery,daysFromQuestion,answer}=require('../netlify/functions/_shared/nex-insights-chat.cjs');

test('recognizes everyday questions about Nex performance',()=>{
 for(const q of ['Nex, show unanswered customer questions from the past seven days','How is Nex doing?','Show chatbot analytics this week','What are the top Nex conversation topics?']){
   assert.equal(isInsightsQuery(q),true,q);
 }
 assert.equal(isInsightsQuery('Can you transfer my mum to New York?'),false);
 assert.equal(isInsightsQuery('How much for wheelchair transport?'),false);
});
test('reporting date windows are bounded and conversational',()=>{
 assert.equal(daysFromQuestion('Show Nex analytics from the past 7 days'),7);
 assert.equal(daysFromQuestion('Show unanswered customer questions from the past seven days'),7);
 assert.equal(daysFromQuestion('Show Nex stats over ninety days'),90);
 assert.equal(daysFromQuestion('Report for the past thirty days'),30);
 assert.equal(daysFromQuestion('How many customer questions today?'),1);
 assert.equal(daysFromQuestion('Show Nex stats over 100 days'),90);
 assert.equal(daysFromQuestion('Any recent insights?'),30);
});
test('nonadmins cannot read metrics and never query the database',async()=>{
 let calls=0;
 const reply=await answer({role:'DISPATCHER'},'How many customer questions has Nex had?',async()=>{calls++;throw Error('not allowed');});
 assert.match(reply,/restricted to Nexus administrators/);
 assert.equal(calls,0);
});
test('admin gets only aggregated counts from the existing reporter',async()=>{
 const seen=[];
 const db=async(sql,args=[])=>{
   seen.push({sql,args});
   if(sql.includes('to_regclass'))return {rows:[{table_name:'nex_intent_events'}]};
   if(sql.includes('has_table_privilege'))return {rows:[{total:22,latest_at:null,can_insert:true}]};
   if(sql.includes('FILTER'))return {rows:[{total:22,unanswered:5,emergencies:2}]};
   if(sql.includes('GROUP BY intent'))return {rows:[{intent:'booking',count:12},{intent:'pricing',count:4}]};
   return {rows:[]};
 };
 const response=await answer({role:'ADMIN'},'Nex, show the customer questions report for the past 7 days',db);
 assert.match(response,/past 7 days/);
 assert.match(response,/22 questions/);
 assert.match(response,/5 unanswered/);
 assert.match(response,/booking: 12/);
 assert.doesNotMatch(response,/patient|123 Main Street/);
 assert.equal(seen.length,6);
 assert.ok(seen.every(x=>/SELECT/i.test(x.sql)));
});
test('missing migration is explained without querying absent analytics table',async()=>{
 let calls=0;
 const response=await answer({role:'ADMIN'},'Show Nex unanswered questions',async()=>{calls++;return {rows:[{table_name:null}]};});
 assert.match(response,/database migration is missing/);
 assert.equal(calls,1);
});
