'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('visitor-assistant.js','utf8');
test('outside pointer taps close the Nex panel without cancelling underlying click',()=>{
 assert.match(source,/document\.addEventListener\('pointerdown', function \(event\)/);
 assert.match(source,/if \(!panel\.classList\.contains\('open'\)\) return;/);
 assert.match(source,/panel\.contains\(target\) \|\| tab\.contains\(target\) \|\| bubble\.contains\(target\)/);
 assert.match(source,/closePanel\(false\)/);
 const listener=source.slice(source.indexOf("document.addEventListener('pointerdown'"),source.indexOf("document.addEventListener('keydown'"));
 assert.doesNotMatch(listener,/preventDefault|stopPropagation|log\.replaceChildren|flow\s*=\s*null|staffActive\s*=\s*false/);
});
test('closing the panel keeps chat transcript, session and active quote state',()=>{
 const begin=source.indexOf('  function closePanel(restoreFocusOverride) {');
 const end=source.indexOf('  function eventInsideHostModal(target) {',begin);
 const block=source.slice(begin,end);
 assert.match(block,/setOpen\(false\)/);
 assert.doesNotMatch(block,/log\.replaceChildren|sessionStorage\.removeItem|lastEstimate\s*=\s*null|flow\s*=\s*null|staffState\s*=\s*null/);
});
test('full narrated booking video remains mounted on Nex panel close/reopen',()=>{
 assert.match(source,/renderRelatedNexContent\(pending, d\.relatedContent\)/);
 assert.match(source,/player\.controls = true/);
 assert.match(source,/player\.playsInline = true/);
 const toggle=source.slice(source.indexOf('  function setOpen(open) {'),source.indexOf('  function eventInsideHostModal(target) {'));
 assert.match(toggle,/panel\.classList\.toggle\('open', open\)/);
 assert.doesNotMatch(toggle,/log\.innerHTML\s*=\s*''|log\.replaceChildren/);
});
