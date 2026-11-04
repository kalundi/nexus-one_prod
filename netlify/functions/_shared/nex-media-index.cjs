'use strict';
// Build a privacy-safe index of FIRST-PARTY media declared by the Nexus
// editorial social feed. No external scraping and no guessed social URLs.
const feed=require('../../../social/evergreen-posts.json');
const SAFE=/^\/assets\/[a-z0-9-]+\.(?:mp4|webp|jpg|jpeg|png)$/i;
function topicFor(post){
 const text=String(post.id||'')+' '+String(post.pillar||'')+' '+String(post.url||'');
 if(/booking|walkthrough/i.test(text))return 'booking';
 if(/wheelchair|accessible|mobility/i.test(text))return 'wheelchair';
 if(/stretcher/i.test(text))return 'stretcher';
 if(/livecare|tracking/i.test(text))return 'tracking';
 if(/emt|recruitment/i.test(text))return 'recruitment';
 return 'general';
}
function index(posts=feed.posts){
 const found=new Set();
 return (Array.isArray(posts)?posts:[]).flatMap(post=>{
  if(!post||typeof post.id!=='string')return [];
  return ['videoAsset','asset'].flatMap(key=>{
   const pathname=post[key];
   if(typeof pathname!=='string'||!SAFE.test(pathname))return [];
   if(found.has(pathname))return [];
   found.add(pathname);
   return [{
    id:'media:'+post.id+':'+key,
    topic:topicFor(post),
    kind:/\.mp4$/i.test(pathname)?'video':'image',
    url:'https://nexusmt.com'+pathname,
    title:String(post.youtubeTitle||post.headline||post.id).slice(0,100),
    sourcePost:post.id,
    platform:'Nexus'
   }];
  });
 });
}
function recommendations(topic,limit=2){
 return index().filter(x=>x.topic===topic && x.kind==='video').slice(0,Math.max(0,Math.min(3,limit)));
}
module.exports={index,recommendations,topicFor};
