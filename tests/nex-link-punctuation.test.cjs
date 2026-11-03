'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('visitor-assistant.js','utf8');
const begin=source.indexOf('  function escapeHtml(text) {');
const end=source.indexOf('  function addMessage(text, who) {',begin);
assert.ok(begin>=0 && end>begin,'Nex widget text-rendering functions are present');
const context=vm.createContext({});
vm.runInContext(source.slice(begin,end)+'\nthis.renderText=renderText;',context);
const renderText=context.renderText;

test('booking link in estimate prose excludes trailing comma',()=>{
 const result=renderText('Get your exact quote at https://mynexusride.com, or call Nexus.');
 assert.match(result,/<a href="https:\/\/mynexusride\.com"[^>]*>mynexusride\.com<\/a>, or call Nexus\./);
 assert.doesNotMatch(result,/href="https:\/\/mynexusride\.com,"/);
});
test('booking link excludes trailing period and question mark',()=>{
 for(const suffix of ['.','?','!',':',';']){
  const result=renderText('Book online at https://mynexusride.com'+suffix);
  assert.match(result,/<a href="https:\/\/mynexusride\.com"[^>]*>mynexusride\.com<\/a>/);
  assert.ok(result.endsWith('</a>'+suffix));
 }
});
test('legitimate URL paths and query values remain clickable',()=>{
 const result=renderText('Read https://nexusmt.com/ask-nex.html?message=booking, and book.');
 assert.match(result,/href="https:\/\/nexusmt\.com\/ask-nex\.html\?message=booking"/);
 assert.match(result,/<\/a>, and book/);
});
test('estimates use the corrected shared link renderer',()=>{
 assert.match(source,/function renderEstimateText\(text, est\)\s*\{\s*var html = renderText\(text\)/);
 assert.match(source,/function fillPendingEstimate\([\s\S]*?renderEstimateText\(text, est\)/);
 assert.match(source,/function fillPending\([\s\S]*?renderText\(text\)/);
});
