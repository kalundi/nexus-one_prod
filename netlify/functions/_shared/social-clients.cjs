const BLUESKY_API='https://bsky.social/xrpc';
const META_GRAPH_API='https://graph.facebook.com/v20.0';

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

async function postToFacebook(payload){
 const pageId=env('FACEBOOK_PAGE_ID');
 const accessToken=env('FACEBOOK_PAGE_ACCESS_TOKEN');
 if(!pageId||!accessToken)return {status:'skipped',reason:'missing_facebook_credentials'};
 const params=new URLSearchParams({
  message:String(payload.text||''),
  link:String(payload.link||''),
  access_token:accessToken
 });
 const res=await fetch(`${META_GRAPH_API}/${encodeURIComponent(pageId)}/feed`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)return {status:'failed',code:res.status,error:JSON.stringify(body).slice(0,400)};
 return {status:'published',id:body.id||null};
}

async function postToInstagram(payload){
 const igUserId=env('INSTAGRAM_BUSINESS_ACCOUNT_ID');
 const accessToken=env('INSTAGRAM_PAGE_ACCESS_TOKEN')||env('FACEBOOK_PAGE_ACCESS_TOKEN');
 if(!igUserId||!accessToken)return {status:'skipped',reason:'missing_instagram_credentials'};
 if(!payload.assetUrl||!/^https?:\/\//i.test(String(payload.assetUrl||'')))return {status:'skipped',reason:'missing_instagram_asset_url'};

 const createParams=new URLSearchParams({
  image_url:String(payload.assetUrl),
  caption:String(payload.text||'').slice(0,2200),
  access_token:accessToken
 });
 const createRes=await fetch(`${META_GRAPH_API}/${encodeURIComponent(igUserId)}/media`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:createParams});
 const createBody=await createRes.json().catch(()=>({}));
 if(!createRes.ok||!createBody.id)return {status:'failed',step:'create_media',code:createRes.status,error:JSON.stringify(createBody).slice(0,400)};

 const publishParams=new URLSearchParams({creation_id:String(createBody.id),access_token:accessToken});
 const publishRes=await fetch(`${META_GRAPH_API}/${encodeURIComponent(igUserId)}/media_publish`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:publishParams});
 const publishBody=await publishRes.json().catch(()=>({}));
 if(!publishRes.ok)return {status:'failed',step:'publish_media',code:publishRes.status,error:JSON.stringify(publishBody).slice(0,400)};
 return {status:'published',id:publishBody.id||null,creationId:createBody.id};
}

async function publishToChannel(channel,payload){
 const normalized=String(channel||'').toLowerCase();
 if(normalized==='bluesky') return postToBluesky(payload);
 if(normalized==='facebook') return postToFacebook(payload);
 if(normalized==='instagram') return postToInstagram(payload);
 if(normalized==='tiktok') return {status:'skipped',reason:'tiktok_not_configured'};
 if(normalized==='youtube-shorts') return {status:'skipped',reason:'youtube_not_configured'};
 return {status:'skipped',reason:'unsupported_channel'};
}

module.exports={publishToChannel};
