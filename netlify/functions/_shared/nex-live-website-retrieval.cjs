'use strict';
// Bounded, read-only public web retrieval for Nex. Source pages are hard
// allowlisted, and untrusted HTML is NEVER interpreted as instructions.
const {CATALOG}=require('./nex-social-content.cjs');
const SITE_PAGES=Object.freeze([
 'about-nexus-medical-transit.html',
 'contact-service-areas.html',
 'non-emergency-medical-transportation.html',
 'wheelchair-transportation.html',
 'stretcher-transportation.html',
 'accessibility.html',
 'booking-app.html'
]);
const STOP=new Set('a an and are as at be by can do does for from has have how i in is it me my nexus of on or our the their there to us was we what where which who why will with would you your this that any website'.split(' '));
const SENSITIVE=/\b(?:my|our) (?:ride|trip|booking|reservation|driver|invoice|account|payment|medical|health|patient|shift|schedule)\b|\b(?:cancel|reschedule|refund|charge|pay|diagnos|symptoms|emergency|911|price|pricing|quote|estimate|cost|fare|rate|how much)\b/i;
function words(text){
 return [...new Set(String(text||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.endsWith('s')&&w.length>5?w.slice(0,-1):w))];
}
function decode(text){
 return String(text||'').replace(/&(?:nbsp|amp|quot|apos|lt|gt|#39);/gi,x=>({
  '&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&#39;':"'"
 }[x.toLowerCase()]||' ')).replace(/&#(\d{2,5});/g,(_,n)=>String.fromCodePoint(Math.min(65533,Number(n))));
}
function passages(html){
 const source=String(html||'').slice(0,180000)
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(?:script|style|noscript|svg|head|nav|footer|form)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|head|nav|footer|form)\s*>/gi,' ');
 const blocks=[...source.matchAll(/<(?:p|li|h[1-4]|section)\b[^>]*>([\s\S]{0,2500}?)<\/(?:p|li|h[1-4]|section)>/gi)];
 return blocks.map(x=>decode(x[1].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).trim())
  .filter(x=>x.length>=48&&x.length<=700).slice(0,180);
}
function allowedSiteUrl(url){
 try{
  const u=new URL(url);
  return u.protocol==='https:' && !u.username&&!u.password&&
   (u.hostname==='nexusmt.com'||u.hostname==='www.nexusmt.com') &&
   SITE_PAGES.includes(u.pathname.slice(1)) && !u.search && !u.hash;
 }catch{return false;}
}
async function fetchPage(path,{fetchImpl=fetch,timeoutMs=3000}={}){
 const url='https://nexusmt.com/'+path;
 if(!allowedSiteUrl(url))throw Error('Not an approved public page');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetchImpl(url,{method:'GET',headers:{accept:'text/html'},redirect:'manual',signal:controller.signal});
  if(r.status!==200||!/text\/html/i.test(String(r.headers?.get?.('content-type')||'')))return [];
  if(Number(r.headers?.get?.('content-length')||0)>180000)return [];
  const body=await r.text();
  if(body.length>180000)return [];
  return passages(body);
 }finally{clearTimeout(timer);}
}
function socialAnswer(question){
 const q=String(question||'');
 if(!/\b(?:social(?: media)?|facebook|instagram|you ?tube|tiktok|bluesky|follow (?:nexus|you|us)|social account)\b/i.test(q))return null;
 const channels=[
  ['YouTube','youtube.com'],['Instagram','instagram.com'],['TikTok','tiktok.com'],
  ['Facebook','facebook.com'],['Bluesky','bsky.app']
 ];
 // First-party approved channels are declared in the editorial site catalog
 // or in the official Nexus social profile manifest, never model-invented.
 const approved=CATALOG.filter(x=>x.kind==='social-channel');
 const feed={
  TikTok:'https://www.tiktok.com/@nexus_m_t',
  Facebook:'https://www.facebook.com/profile.php?id=61581462908206',
  Bluesky:'https://bsky.app/profile/nexusmt.bsky.social'
 };
 const links=channels.map(([name,host])=>{
  const item=approved.find(x=>x.platform===name&&new URL(x.url).hostname.includes(host));
  const url=item?.url||feed[name];
  return url?name+': '+url:null;
 }).filter(Boolean);
 return {answer:'Yes. Nexus Medical Transit has official social media channels. You can follow Nexus here:\n'+links.join('\n'),mode:'website-social',sources:['official-social-channels']};
}
function score(questionTokens,text){
 const content=new Set(words(text));
 return questionTokens.filter(w=>content.has(w)).length;
}
async function answerFromWebsite(question,{fetchImpl=fetch}={}){
 const social=socialAnswer(question);
 if(social)return social;
 const q=String(question||'').slice(0,500);
 // Never use public web snippets for private, medical, emergency or price decisions.
 if(SENSITIVE.test(q))return null;
 const w=words(q);
 if(w.length<2)return null;
 const scored=[];
 // fixed, bounded public endpoints; no user-supplied URLs or unrestricted crawl.
 await Promise.all(SITE_PAGES.map(async path=>{
  try{
   const sections=await fetchPage(path,{fetchImpl});
   for(const text of sections){
    const n=score(w,text);
    if(n>=2 && n>=Math.min(w.length,3))scored.push({path,text,score:n});
   }
  }catch{ /* unavailable site page: keep safe normal fallback */ }
 }));
 scored.sort((a,b)=>b.score-a.score||a.text.length-b.text.length);
 const top=scored[0];
 if(!top)return null;
 return {
  mode:'website-retrieval',
  sources:['website:'+top.path],
  answer:'Here is what Nexus publishes on its website: '+top.text+
   '\n\nSource: https://nexusmt.com/'+top.path
 };
}
module.exports={SITE_PAGES,words,passages,allowedSiteUrl,fetchPage,socialAnswer,answerFromWebsite};
