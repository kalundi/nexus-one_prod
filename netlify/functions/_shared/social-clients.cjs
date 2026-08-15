const BLUESKY_API='https://bsky.social/xrpc';
const META_GRAPH_API=`https://graph.facebook.com/${String(process.env.META_GRAPH_API_VERSION||'v26.0').trim()}`;
const crypto=require('node:crypto');

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

function oauthEncode(value){
 return encodeURIComponent(String(value)).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function postToX(payload){
 const consumerKey=env('X_API_KEY');
 const consumerSecret=env('X_API_SECRET');
 const accessToken=env('X_ACCESS_TOKEN');
 const accessTokenSecret=env('X_ACCESS_TOKEN_SECRET');
 if(!consumerKey||!consumerSecret||!accessToken||!accessTokenSecret){
  return {status:'skipped',reason:'missing_x_credentials'};
 }
 const method='POST';
 const url='https://api.x.com/2/tweets';
 const oauth={
  oauth_consumer_key:consumerKey,
  oauth_nonce:crypto.randomBytes(18).toString('hex'),
  oauth_signature_method:'HMAC-SHA1',
  oauth_timestamp:String(Math.floor(Date.now()/1000)),
  oauth_token:accessToken,
  oauth_version:'1.0'
 };
 const parameterString=Object.entries(oauth).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${oauthEncode(key)}=${oauthEncode(value)}`).join('&');
 const signatureBase=`${method}&${oauthEncode(url)}&${oauthEncode(parameterString)}`;
 oauth.oauth_signature=crypto.createHmac('sha1',`${oauthEncode(consumerSecret)}&${oauthEncode(accessTokenSecret)}`).update(signatureBase).digest('base64');
 const authorization=`OAuth ${Object.entries(oauth).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${oauthEncode(key)}="${oauthEncode(value)}"`).join(', ')}`;
 const res=await fetch(url,{
  method,
  headers:{authorization,'content-type':'application/json'},
  body:JSON.stringify({text:String(payload.text||'').slice(0,280)})
 });
 const body=await res.json().catch(()=>({}));
 if(!res.ok)return {status:'failed',code:res.status,error:JSON.stringify(body).slice(0,400)};
 return {status:'published',id:body.data?.id||null};
}

async function youtubeAccessToken(){
 const clientId=env('YOUTUBE_CLIENT_ID');
 const clientSecret=env('YOUTUBE_CLIENT_SECRET');
 const refreshToken=env('YOUTUBE_REFRESH_TOKEN');
 if(!clientId||!clientSecret||!refreshToken)return null;
 const params=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
 const body=await res.json().catch(()=>({}));
 if(!res.ok||!body.access_token)throw new Error(`youtube_token_exchange_failed:${res.status}:${JSON.stringify(body).slice(0,240)}`);
 return body.access_token;
}

async function postToYouTube(payload){
 if(!payload.videoUrl||!/^https?:\/\//i.test(payload.videoUrl))return {status:'skipped',reason:'missing_youtube_video_url'};
 const token=await youtubeAccessToken();
 if(!token)return {status:'skipped',reason:'missing_youtube_credentials'};
 const videoRes=await fetch(payload.videoUrl);
 if(!videoRes.ok)return {status:'failed',step:'fetch_video',code:videoRes.status,error:'Unable to fetch video asset'};
 const contentType=videoRes.headers.get('content-type')||'video/mp4';
 if(!contentType.startsWith('video/'))return {status:'skipped',reason:'youtube_asset_is_not_video'};
 const metadata={
  snippet:{title:String(payload.title||'Nexus Medical Transit').slice(0,100),description:String(payload.text||'').slice(0,5000),categoryId:env('YOUTUBE_CATEGORY_ID')||'22'},
  status:{privacyStatus:env('YOUTUBE_DEFAULT_PRIVACY')||'private',selfDeclaredMadeForKids:false}
 };
 const initRes=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
  method:'POST',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8','x-upload-content-type':contentType},
  body:JSON.stringify(metadata)
 });
 if(!initRes.ok){
  const error=await initRes.text().catch(()=> '');
  return {status:'failed',step:'initialize_upload',code:initRes.status,error:error.slice(0,400)};
 }
 const uploadUrl=initRes.headers.get('location');
 if(!uploadUrl)return {status:'failed',step:'initialize_upload',error:'Missing resumable upload URL'};
 const uploadHeaders={'content-type':contentType};
 const contentLength=videoRes.headers.get('content-length');
 if(contentLength)uploadHeaders['content-length']=contentLength;
 const uploadRes=await fetch(uploadUrl,{method:'PUT',headers:uploadHeaders,body:videoRes.body,duplex:'half'});
 const body=await uploadRes.json().catch(()=>({}));
 if(!uploadRes.ok)return {status:'failed',step:'upload_video',code:uploadRes.status,error:JSON.stringify(body).slice(0,400)};
 return {status:'published',id:body.id||null,privacyStatus:body.status?.privacyStatus||metadata.status.privacyStatus};
}

async function publishToChannel(channel,payload){
 const normalized=String(channel||'').toLowerCase();
 if(normalized==='bluesky') return postToBluesky(payload);
 if(normalized==='facebook') return postToFacebook(payload);
 if(normalized==='instagram') return postToInstagram(payload);
 if(normalized==='x') return postToX(payload);
 if(normalized==='youtube') return postToYouTube(payload);
 if(normalized==='tiktok') return {status:'skipped',reason:'tiktok_not_configured'};
 return {status:'skipped',reason:'unsupported_channel'};
}

module.exports={publishToChannel};
