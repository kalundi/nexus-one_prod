'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAssistant,composeAnswer,isBookingHowIntent}=require('../netlify/functions/_shared/visitor-assistant-core.cjs');
const {relatedFor}=require('../netlify/functions/_shared/nex-social-content.cjs');
const samples=[
 'How does booking work?',
 'How does your booking work?',
 'How do I book a ride?',
 'How can I schedule a ride?',
 'How to book a ride',
 'Booking process',
 'What are the steps to book a ride?'
];
test('natural variants of booking-how are grounded instead of the generic fallback',async()=>{
 const assistant=createAssistant({env:{},fetchImpl:async()=>{throw Error('Do not call model for deterministic FAQ')}});
 for(let i=0;i<samples.length;i++){
  const text=samples[i];
  const result=await assistant.ask(text,'booking-how-'+i);
  assert.equal(result.status,200,text);
  assert.equal(result.body.mode,'composed',text);
  assert.ok(result.body.sources.includes('booking-how'),text);
  assert.match(result.body.answer,/pickup|destination/i,text);
  assert.ok(!/I don.t have that in the information/.test(result.body.answer),text);
  const links=result.body.relatedContent||[];
  assert.ok(links.some(link=>link.id==='booking-walkthrough-v6'),text);
  assert.ok(links.some(link=>link.url==='https://mynexusride.com'),text);
 }
});
test('private ride status and price requests are not treated as booking-how FAQ',()=>{
 for(const q of ['What is the status of my booking?','How much does my trip cost?','Where is my driver?','Change my reservation']){
  assert.equal(isBookingHowIntent(q),false,q);
 }
});
test('approved booking FAQ is used in direct composition',()=>{
 const result=composeAnswer('How does booking work?');
 assert.deepEqual(result.sources,['booking-how']);
 assert.match(result.answer,/mynexusride\.com/);
 assert.equal(result.mode,'composed');
});
