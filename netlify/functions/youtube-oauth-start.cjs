const crypto=require('node:crypto');

function env(name){return String(process.env[name]||'').trim();}
function base64url(value){return Buffer.from(value).toString('base64url');}

exports.handler=async()=>{
 const clientId=env('YOUTUBE_CLIENT_ID');
 const stateSecret=env('SOCIAL_OAUTH_STATE_SECRET');
 if(!clientId||!stateSecret)return {statusCode:503,body:'YouTube OAuth is not configured.'};
 const issuedAt=Date.now();
 const nonce=crypto.randomBytes(18).toString('hex');
 const data=`${issuedAt}.${nonce}`;
 const signature=crypto.createHmac('sha256',stateSecret).update(data).digest('base64url');
 const state=base64url(`${data}.${signature}`);
 const redirectUri='https://nexusmt.com/.netlify/functions/youtube-oauth-callback';
 const params=new URLSearchParams({
  client_id:clientId,
  redirect_uri:redirectUri,
  response_type:'code',
  scope:'https://www.googleapis.com/auth/youtube.upload',
  access_type:'offline',
  prompt:'consent',
  include_granted_scopes:'true',
  state
 });
 return {statusCode:302,headers:{location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`},body:''};
};
