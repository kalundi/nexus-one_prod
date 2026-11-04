'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CATALOG,isTrusted,relatedFor,topicFor}=require('../netlify/functions/_shared/nex-social-content.cjs');
const {createAssistant}=require('../netlify/functions/_shared/visitor-assistant-core.cjs');
test('booking wording picks relevant official resources, not unrelated accounts',()=>{
 for(const question of ['How does your booking work?', 'How do I book a ride?', 'How can I schedule a ride?']){
  assert.equal(topicFor(question,['booking-how']),'booking',question);
  const items=relatedFor(question,['booking-how']);
  assert.ok(items.some(i=>i.url==='https://mynexusride.com'),question);
  assert.ok(items.some(i=>i.platform==='YouTube'),question);
  assert.ok(items.every(i=>!i.title.includes('Wheelchair transportation')));
 }
});
test('no fabricated video is shown; only explicitly approved direct posts/videos qualify',()=>{
 assert.equal(CATALOG.filter(x=>x.kind==='video').length,1);
 const bookingVideo=CATALOG.find(x=>x.id==='booking-walkthrough-v6');
 assert.equal(bookingVideo.url,'https://nexusmt.com/assets/nexus-booking-app-walkthrough-v6-narrated.mp4');
 assert.ok(bookingVideo.verified);
 assert.ok(relatedFor('How does your booking work?',['booking-how'])[0].kind==='video');
 const items=relatedFor('How does your booking work?',['booking-how'],[
   {id:'fake',topic:'booking',kind:'video',title:'Booking walkthrough',url:'https://www.youtube.com/watch?v=fake',priority:40,verified:false},
   ...CATALOG
 ]);
 assert.ok(!items.some(x=>x.id==='fake'));
 assert.ok(items.some(x=>x.kind==='guide' && x.url==='https://mynexusride.com'));
 assert.ok(items.some(x=>x.platform==='YouTube'));
 assert.equal(items[0].steps.length,5);
 const vetted={id:'published-booking-tutorial',topic:'booking',kind:'video',title:'How to book',url:'https://www.youtube.com/watch?v=verified-by-admin',priority:20,verified:true};
 assert.equal(relatedFor('How does your booking work?',['booking-how'],[vetted,...CATALOG])[0].kind,'video');
});
test('unsafe hosts and links are rejected, including lookalike domains',()=>{
 for(const url of ['https://youtube.com.evil.tld/watch?v=a','javascript:alert(1)','http://youtube.com/watch?v=a','https://evil.com/video','https://user:pass@youtube.com/watch?v=a']){
  assert.equal(isTrusted({id:'bad',topic:'booking',kind:'video',title:'Video',url,verified:true}),false,url);
 }
});
test('unrelated questions and emergency response never recommend social links',async()=>{
 assert.deepEqual(relatedFor('What is your phone number?',['contact']),[]);
 const assistant=createAssistant({env:{},fetchImpl:async()=>{throw Error('Unexpected model request');}});
 const result=await assistant.ask('Someone is having a heart attack, send an ambulance now','test-social-media-emergency');
 assert.equal(result.body.mode,'safety');
 assert.equal(result.body.relatedContent,undefined);
});
test('core booking answer includes curated links but no raw social post text',async()=>{
 const assistant=createAssistant({env:{},fetchImpl:async()=>{throw Error('Unexpected model request');}});
 const result=await assistant.ask('How does your booking work?','test-social-media-booking');
 assert.equal(result.status,200);
 assert.match(result.body.answer,/book/i);
 assert.ok(result.body.relatedContent?.some(x=>x.url==='https://mynexusride.com'));
 assert.ok(result.body.relatedContent?.every(x=>x.url.startsWith('https://')));
});


test('Nex booking video is sourced from the official social feed and exists in the repo',()=>{
 const feed=require('../social/evergreen-posts.json');
 const post=feed.posts.find(p=>p.videoAsset==='/assets/nexus-booking-app-walkthrough-v6-narrated.mp4');
 assert.ok(post,'The video must be a pre-existing Nexus social asset');
 const video=CATALOG.find(x=>x.id==='booking-walkthrough-v6');
 assert.equal(video.url,'https://nexusmt.com'+post.videoAsset);
});
test('inline video is click-to-play, accessible and never an arbitrary iframe',()=>{
 const widget=require('node:fs').readFileSync('visitor-assistant.js','utf8');
 const page=require('node:fs').readFileSync('ask-nex.html','utf8');
 for(const code of [widget,page]){
   assert.match(code,/playsInline = true|playsInline=true/);
   assert.match(code,/preload = 'none'|preload='none'/);
   assert.match(code,/video\/mp4/);
   assert.match(code,/addEventListener\('error'/);
   assert.match(code,/aria-label/);
   assert.match(code,/\\.mp4/);
 }
});
