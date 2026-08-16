const {query}=require('./db.cjs');
const {loadEvergreenFeed,normalizeChannel,choosePostForChannel}=require('./social-queue.cjs');
const {buildPublishPayload}=require('./social-formatters.cjs');
const {publishToChannel}=require('./social-clients.cjs');

const DEFAULT_CHANNELS=['facebook','instagram','bluesky','x','youtube'];

function parseChannels(raw=''){
 const value=String(raw||'').trim();
 if(!value) return DEFAULT_CHANNELS;
 return value.split(',').map(part=>normalizeChannel(part)).filter(Boolean);
}

function isDryRunValue(value,defaultValue=true){
 if(value===undefined||value===null||String(value).trim()==='') return defaultValue;
 const lowered=String(value).trim().toLowerCase();
 return !['false','0','off','no'].includes(lowered);
}

function getRunDate(){
 return new Date().toISOString().slice(0,10);
}

function siteBase(){
 return String(process.env.SITE_URL||process.env.URL||'https://nexusmt.com').replace(/\/$/,'');
}

async function ensureTables(){
 await query(`CREATE TABLE IF NOT EXISTS social_publish_history (
  id BIGSERIAL PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date,
  channel TEXT NOT NULL,
  post_id TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`).catch(()=>{});
}

async function readRecentHistory(channel,limit=12){
 const res=await query(
  `SELECT post_id, payload
   FROM social_publish_history
   WHERE channel=$1
   ORDER BY created_at DESC
   LIMIT $2`,
  [channel,limit]
 ).catch(()=>({rows:[]}));
 return (res.rows||[]).map(row=>({
  post_id:String(row.post_id||''),
  pillar:String(row.payload?.pillar||'')
 }));
}

async function writeHistory({runDate,channel,postId,status,dryRun,payload,response,errorMessage=''}){
 await query(
  `INSERT INTO social_publish_history(run_date,channel,post_id,status,dry_run,payload,response,error_message)
   VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
  [runDate,channel,postId,status,dryRun,JSON.stringify(payload||{}),JSON.stringify(response||{}),errorMessage||null]
 );
}

async function previewSocialSelection({channels=[],forcedPostId=''}={}){
 await ensureTables();
 const feed=await loadEvergreenFeed();
 const baseUrl=siteBase();
 const selected=[];
 for(const channel of channels){
  const recent=await readRecentHistory(channel);
  const requestedPost=forcedPostId?feed.posts.find(post=>post.id===forcedPostId):null;
  if(forcedPostId&&!requestedPost){
   selected.push({channel,status:'skipped',postId:forcedPostId,reason:'forced_post_not_found'});
   continue;
  }
  if(requestedPost&&!requestedPost.channels.includes(channel)){
   selected.push({channel,status:'skipped',postId:forcedPostId,pillar:requestedPost.pillar,reason:'forced_post_not_eligible_for_channel'});
   continue;
  }
  const nextPost=requestedPost||choosePostForChannel(feed.posts,channel,recent);
  if(!nextPost){
   selected.push({channel,status:'skipped',reason:'no_eligible_post'});
   continue;
  }
  const payload=buildPublishPayload(nextPost,feed,channel,baseUrl);
  selected.push({channel,status:'selected',postId:nextPost.id,pillar:nextPost.pillar,payload});
 }
 return {channels,selected};
}

async function runSocialPublish({channels=[],dryRun=true,forcedPostId=''}={}){
 await ensureTables();
 const feed=await loadEvergreenFeed();
 const baseUrl=siteBase();
 const runDate=getRunDate();
 const results=[];

 for(const channel of channels){
  const recent=await readRecentHistory(channel);
  const requestedPost=forcedPostId?feed.posts.find(post=>post.id===forcedPostId):null;
  if(forcedPostId&&!requestedPost){
   results.push({channel,status:'skipped',postId:forcedPostId,reason:'forced_post_not_found'});
   continue;
  }
  if(requestedPost&&!requestedPost.channels.includes(channel)){
   results.push({channel,status:'skipped',postId:forcedPostId,pillar:requestedPost.pillar,reason:'forced_post_not_eligible_for_channel'});
   continue;
  }
  const nextPost=requestedPost||choosePostForChannel(feed.posts,channel,recent);
  if(!nextPost){
   results.push({channel,status:'skipped',reason:'no_eligible_post'});
   continue;
  }

  const payload=buildPublishPayload(nextPost,feed,channel,baseUrl);
  if(dryRun){
   await writeHistory({runDate,channel,postId:nextPost.id,status:'dry-run',dryRun:true,payload,response:{preview:true}});
   results.push({channel,status:'dry-run',postId:nextPost.id,pillar:nextPost.pillar});
   continue;
  }

  let publishResult;
  try{publishResult=await publishToChannel(channel,payload);}catch(error){publishResult={status:'failed',error:error.message};}
  const status=String(publishResult.status||'failed');
  await writeHistory({runDate,channel,postId:nextPost.id,status,dryRun:false,payload,response:publishResult,errorMessage:publishResult.error||''});
  results.push({channel,status,postId:nextPost.id,pillar:nextPost.pillar,payload,response:publishResult});
 }

 return {runDate,dryRun,channels,results};
}

module.exports={parseChannels,isDryRunValue,previewSocialSelection,runSocialPublish};
