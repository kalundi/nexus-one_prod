'use strict';
// Public website drift monitoring only: store hashes, never raw page content.
// Changed pages generate a pending human review suggestion, not an FAQ.
const crypto=require('node:crypto');
const {SOURCES}=require('./nex-reviewed-knowledge.cjs');
const PAGES=Object.freeze([...SOURCES].sort());
const MAX_TEXT=350000;
function normalizePage(html){
 return String(html||'')
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi,' ')
  .replace(/\s+/g,' ').trim().slice(0,MAX_TEXT);
}
function digest(html){
 return crypto.createHash('sha256').update(normalizePage(html),'utf8').digest('hex');
}
async function fetchPage(path,{fetchImpl=fetch,timeoutMs=8000,baseUrl='https://nexusmt.com'}={}){
 if(!PAGES.includes(path))throw Error('Unapproved source');
 if(!['https://nexusmt.com','https://www.nexusmt.com'].includes(baseUrl.replace(/\/$/,'')))throw Error('Unapproved public origin');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetchImpl(baseUrl.replace(/\/$/,'')+'/'+path,{
   method:'GET',redirect:'manual',cache:'no-store',signal:controller.signal,
   headers:{accept:'text/html'}
  });
  if(!res.ok||res.status!==200||!/text\/html/i.test(String(res.headers?.get?.('content-type')||'')))throw Error('Page unavailable or wrong content type');
  const size=Number(res.headers?.get?.('content-length')||0);
  if(size>MAX_TEXT)throw Error('Page exceeds safe size');
  const html=await res.text();
  if(html.length>MAX_TEXT)throw Error('Page exceeds safe size');
  const value=normalizePage(html);
  if(value.length<120)throw Error('Page has insufficient public text');
  return digest(html);
 }finally{clearTimeout(timer);}
}
async function scan({queryFn,fetchImpl=fetch,baseUrl='https://nexusmt.com'}={}){
 if(typeof queryFn!=='function')throw Error('Database adapter required');
 const checks=[],changes=[];
 for(const path of PAGES){
  try{
   const hash=await fetchPage(path,{fetchImpl,baseUrl});
   const old=await queryFn('SELECT digest FROM nex_autonomy_snapshots WHERE path=$1',[path]);
   const previous=old.rows[0]?.digest||null;
   if(!previous){
    await queryFn('INSERT INTO nex_autonomy_snapshots(path,digest) VALUES($1,$2) ON CONFLICT(path) DO NOTHING',[path,hash]);
    checks.push({id:'website:'+path,ok:true,changed:false,baseline:true});
    continue;
   }
   if(previous===hash){
    await queryFn('UPDATE nex_autonomy_snapshots SET checked_at=now() WHERE path=$1',[path]);
    checks.push({id:'website:'+path,ok:true,changed:false});
    continue;
   }
   // Persist only page identity and hashes; never persist HTML or user-submitted text.
   // One CTE links a unique content revision to a pending human review item.
   const suggestion='Public website page '+path+' changed since its last checked version. Review the page against existing Nex FAQ answers, service policies and linked tutorial media. Verify facts before drafting or publishing any updates.';
   const row=await queryFn(
    "WITH changed AS (INSERT INTO nex_autonomy_changes(path,previous_digest,digest) VALUES($1,$2,$3) ON CONFLICT(path,digest) DO NOTHING RETURNING id), "+
    "review AS (INSERT INTO nex_insight_reviews(created_by,period_days,suggestion) SELECT 'nex-site-watch',7,$4 FROM changed RETURNING id), "+
    "linked AS (UPDATE nex_autonomy_changes SET review_id=(SELECT id FROM review) WHERE id=(SELECT id FROM changed) RETURNING id,review_id) "+
    "SELECT id,review_id FROM linked",
    [path,previous,hash,suggestion]);
   await queryFn('UPDATE nex_autonomy_snapshots SET digest=$2,checked_at=now(),changed_at=now() WHERE path=$1',[path,hash]);
   if(row.rows.length)changes.push({path,reviewId:row.rows[0].review_id});
   checks.push({id:'website:'+path,ok:true,changed:true});
  }catch{
   checks.push({id:'website:'+path,ok:false,changed:false});
  }
 }
 return {checks,changes,scanned:PAGES.length};
}
module.exports={PAGES,normalizePage,digest,fetchPage,scan};
