'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSummary,suggest,extractText}=require('../netlify/functions/_shared/nex-ai-suggestions.cjs');
const report={
 days:30,summary:{total:18,unanswered:5},
 gaps:[{terms:['family','transfer','interstate'],count:4},{terms:['insurance'],count:1}],
 intents:[{intent:'interstate',count:8},{intent:'booking',count:2}]
};
test('minimum aggregate threshold protects sparse questions',async()=>{
 assert.equal(buildSummary({summary:{total:2}}),null);
 const out=await suggest({summary:{total:2}});
 assert.equal(out.status,'insufficient-data');
});
test('only recurring anonymous groups are shared for AI review',()=>{
 const summary=buildSummary(report);
 assert.equal(summary.total,18);
 assert.deepEqual(summary.groups,[{terms:['family','transfer','interstate'],count:4}]);
 assert.deepEqual(summary.intents,[{intent:'interstate',count:8}]);
});
test('server-side AI call stores nothing and sends only aggregate counts',async()=>{
 let observed;
 const result=await suggest(report,{
   env:{OPENAI_API_KEY:'placeholder-key',OPENAI_MODEL:'test-model'},
   fetchImpl:async(url,init)=>{
     observed={url,init};
     return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Consider reviewing interstate synonym matching.'}]}]})};
   }
 });
 assert.equal(result.status,'review-required');
 const request=JSON.parse(observed.init.body);
 assert.equal(request.store,false);
 assert.equal(request.model,'test-model');
 assert.doesNotMatch(observed.init.body,/patient name|123 Main Street|personal email/i);
 assert.doesNotMatch(observed.init.body,/placeholder-key/);
 assert.match(result.suggestions,/interstate/);
 assert.ok(observed.init.headers.authorization.startsWith('Bearer '));
});
test('missing API config never calls external service',async()=>{
 const out=await suggest(report,{env:{},fetchImpl:async()=>{throw Error('Should not call');}});
 assert.equal(out.status,'unconfigured');
});
test('responses API text extraction',()=>{
 assert.equal(extractText({output:[{type:'message',content:[{type:'output_text',text:'Review only'}]}]}),'Review only');
});
