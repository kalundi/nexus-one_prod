const {query}=require('./_shared/db.cjs');
const {loadEvergreenFeed,normalizeChannel,choosePostForChannel}=require('./_shared/social-queue.cjs');
const {buildPublishPayload}=require('./_shared/social-formatters.cjs');
const {publishToChannel}=require('./_shared/social-clients.cjs');

const DEFAULT_CHANNELS=['facebook','instagram','bluesky'];

function getRunDate(){
 return new Date().toISOString().slice(0,10);
}

function parseChannels(){
 const raw=String(process.env.SOCIAL_AUTOMATION_CHANNELS||'').trim();
 if(!raw) return DEFAULT_CHANNELS;
 return raw.split(',').map(v=>normalizeChannel(v)).filter(Boolean);
}

function isDryRun(){
 const raw=String(process.env.SOCIAL_AUTOMATION_DRY_RUN||'true').trim().toLowerCase();
 return !['false','0','off','no'].includes(raw);
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

exports.handler=async ()=>{
 try{
  const feed=await loadEvergreenFeed();
  const channels=parseChannels();
  const dryRun=isDryRun();
  const runDate=getRunDate();
  const results=[];

  for(const channel of channels){
   const recent=await readRecentHistory(channel);
   const nextPost=choosePostForChannel(feed.posts,channel,recent);
   if(!nextPost){
    results.push({channel,status:'skipped',reason:'no_eligible_post'});
    continue;
   }

   const payload=buildPublishPayload(nextPost,feed,channel);
   if(dryRun){
    await writeHistory({runDate,channel,postId:nextPost.id,status:'dry-run',dryRun:true,payload,response:{preview:true}});
    results.push({channel,status:'dry-run',postId:nextPost.id,pillar:nextPost.pillar});
    continue;
   }

   let publishResult;
   try{
    publishResult=await publishToChannel(channel,payload);
   }catch(error){
    publishResult={status:'failed',error:error.message};
   }

   const status=String(publishResult.status||'failed');
   await writeHistory({
    runDate,
    channel,
    postId:nextPost.id,
    status,
    dryRun:false,
    payload,
    response:publishResult,
    errorMessage:publishResult.error||''
   });
   results.push({channel,status,postId:nextPost.id,pillar:nextPost.pillar,response:publishResult});
  }

  return {
   statusCode:200,
   body:JSON.stringify({
    runDate,
    dryRun,
    channels,
    results
   })
  };
 }catch(error){
  console.error('[SOCIAL_PUBLISHER]',error.message);
  return {statusCode:500,body:JSON.stringify({error:error.message})};
 }
};
