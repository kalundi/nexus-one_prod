const BLUESKY_API='https://bsky.social/xrpc';

function env(name){
 return String(process.env[name]||'').trim();
}

async function postToBluesky(payload){
 const identifier=env('BLUESKY_IDENTIFIER');
 const appPassword=env('BLUESKY_APP_PASSWORD');
 if(!identifier||!appPassword){
  return {status:'skipped',reason:'missing_bluesky_credentials'};
 }

 const createSessionRes=await fetch(`${BLUESKY_API}/com.atproto.server.createSession`,{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({identifier,password:appPassword})
 });
 if(!createSessionRes.ok){
  const txt=await createSessionRes.text().catch(()=>'');
  return {status:'failed',step:'createSession',code:createSessionRes.status,error:txt.slice(0,400)};
 }
 const session=await createSessionRes.json();

 const record={
  '$type':'app.bsky.feed.post',
  text:String(payload.text||'').slice(0,300),
  createdAt:new Date().toISOString()
 };

 const publishRes=await fetch(`${BLUESKY_API}/com.atproto.repo.createRecord`,{
  method:'POST',
  headers:{'content-type':'application/json',authorization:`Bearer ${session.accessJwt}`},
  body:JSON.stringify({repo:session.did,collection:'app.bsky.feed.post',record})
 });
 if(!publishRes.ok){
  const txt=await publishRes.text().catch(()=>'');
  return {status:'failed',step:'createRecord',code:publishRes.status,error:txt.slice(0,400)};
 }
 const published=await publishRes.json().catch(()=>({}));
 return {status:'published',uri:published.uri||null,cid:published.cid||null};
}

async function publishToChannel(channel,payload){
 const normalized=String(channel||'').toLowerCase();
 if(normalized==='bluesky') return postToBluesky(payload);
 if(normalized==='facebook') return {status:'skipped',reason:'facebook_not_configured'};
 if(normalized==='instagram') return {status:'skipped',reason:'instagram_not_configured'};
 if(normalized==='tiktok') return {status:'skipped',reason:'tiktok_not_configured'};
 if(normalized==='youtube-shorts') return {status:'skipped',reason:'youtube_not_configured'};
 return {status:'skipped',reason:'unsupported_channel'};
}

module.exports={publishToChannel};
