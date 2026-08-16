const test=require('node:test');
const assert=require('node:assert/strict');
const {loadEvergreenFeed}=require('../netlify/functions/_shared/social-queue.cjs');
const {buildPublishPayload}=require('../netlify/functions/_shared/social-formatters.cjs');

test('forced wheelchair post is eligible for YouTube and resolves the deployed video',async()=>{
 const feed=await loadEvergreenFeed();
 const post=feed.posts.find(item=>item.id==='svc-wheelchair-001');
 assert.ok(post);
 assert.ok(post.channels.includes('youtube'));
 const payload=buildPublishPayload(post,feed,'youtube','https://nexusmt.com');
 assert.equal(payload.videoUrl,'https://nexusmt.com/assets/nexus-booking-app-walkthrough-v5-narrated.mp4');
 assert.match(payload.title,/Wheelchair transportation/i);
});

test('default YouTube short also resolves the deployed video',async()=>{
 const feed=await loadEvergreenFeed();
 const post=feed.posts.find(item=>item.id==='shorts-hook-001');
 const payload=buildPublishPayload(post,feed,'youtube','https://nexusmt.com');
 assert.equal(payload.videoUrl,'https://nexusmt.com/assets/nexus-booking-app-walkthrough-v5-narrated.mp4');
});
