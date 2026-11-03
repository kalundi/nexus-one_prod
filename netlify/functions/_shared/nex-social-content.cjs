'use strict';
// Public, manually curated Nexus content: never choose search results or AI-invented links.
// Add specific videos/posts only after verifying the live URL, relevance, and permission.
const CATALOG=Object.freeze([
 {id:'booking-page',topic:'booking',kind:'guide',title:'Book a ride with Nexus',url:'https://mynexusride.com',verified:true,priority:10},
 {id:'youtube-channel',topic:'booking',kind:'social-channel',platform:'YouTube',title:'Nexus on YouTube',url:'https://www.youtube.com/@nexus_m_t',verified:true,priority:5},
 {id:'instagram-channel',topic:'booking',kind:'social-channel',platform:'Instagram',title:'Nexus on Instagram',url:'https://www.instagram.com/nexus_m_t/',verified:true,priority:4},
 {id:'wheelchair-guide',topic:'wheelchair',kind:'guide',title:'Wheelchair transportation information',url:'https://nexusmt.com/wheelchair-transportation.html',verified:true,priority:10},
 {id:'stretcher-guide',topic:'stretcher',kind:'guide',title:'Stretcher transportation information',url:'https://nexusmt.com/stretcher-transportation.html',verified:true,priority:10},
 {id:'youtube-wheelchair',topic:'wheelchair',kind:'social-channel',platform:'YouTube',title:'Nexus on YouTube',url:'https://www.youtube.com/@nexus_m_t',verified:true,priority:5},
 {id:'youtube-stretcher',topic:'stretcher',kind:'social-channel',platform:'YouTube',title:'Nexus on YouTube',url:'https://www.youtube.com/@nexus_m_t',verified:true,priority:5}
]);
// Specific post/video format for future verified publications:
// {id:'booking-video-001',topic:'booking',kind:'video',platform:'YouTube',
//  title:'How to book a Nexus ride',url:'https://www.youtube.com/watch?v=ACTUAL_ID',
//  verified:true,priority:20}
// Do not mark an item verified merely because a local source video asset exists.
const KNOWN_HOSTS=new Set(['mynexusride.com','www.mynexusride.com','nexusmt.com','www.nexusmt.com','youtube.com','www.youtube.com','youtu.be','www.instagram.com','instagram.com','tiktok.com','www.tiktok.com','facebook.com','www.facebook.com','bsky.app']);
function isTrusted(item){
 if(!item || item.verified!==true || !['video','social-post','social-channel','guide'].includes(item.kind))return false;
 if(!['booking','wheelchair','stretcher'].includes(item.topic))return false;
 if(typeof item.title!=='string'||!item.title||item.title.length>100)return false;
 try{const u=new URL(item.url);return u.protocol==='https:'&&KNOWN_HOSTS.has(u.hostname.toLowerCase())&&!(u.username||u.password);}
 catch{return false;}
}
function topicFor(question,sources=[]){
 const q=String(question||'').slice(0,500).toLowerCase();
 const refs=Array.isArray(sources)?sources:[];
 if(/\b(how (?:does|do|can|to) (?:your |the |i |we )?(?:booking|book|reserve|schedule)|booking (?:work|process|steps)|book (?:a |my |your )?ride|schedule (?:a |my )?ride)\b/.test(q))return 'booking';
 if(/\b(wheelchair)\b/.test(q) && /\b(video|show|watch|learn|how|explain)\b/.test(q))return 'wheelchair';
 if(/\b(stretcher)\b/.test(q) && /\b(video|show|watch|learn|how|explain)\b/.test(q))return 'stretcher';
 if(refs.includes('booking-how')&&/\b(book|booking|schedule|reservation)\b/.test(q))return 'booking';
 return null;
}
function relatedFor(question,sources=[],catalog=CATALOG){
 const topic=topicFor(question,sources);
 if(!topic)return [];
 const selected=catalog.filter(item=>item.topic===topic && isTrusted(item))
   .sort((a,b)=>b.priority-a.priority);
 // Specific verified content wins over generic social profiles, with one official booking/service guide.
 const targeted=selected.filter(x=>x.kind==='video'||x.kind==='social-post');
 const guide=selected.find(x=>x.kind==='guide');
 const profile=selected.find(x=>x.kind==='social-channel');
 const items=targeted.length ? [...targeted.slice(0,2),...(guide?[guide]:[])].slice(0,3)
   : [guide,profile].filter(Boolean);
 return items.map(x=>({id:x.id,kind:x.kind,platform:x.platform||null,title:x.title,url:x.url}));
}
module.exports={CATALOG,isTrusted,topicFor,relatedFor};
