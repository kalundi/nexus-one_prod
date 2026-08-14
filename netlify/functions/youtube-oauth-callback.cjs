const crypto=require('node:crypto');

function env(name){return String(process.env[name]||'').trim();}
function htmlEscape(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function response(statusCode,title,message){
 return {statusCode,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:`<!doctype html><html><head><meta name="robots" content="noindex"><title>${htmlEscape(title)}</title></head><body style="font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px"><h1>${htmlEscape(title)}</h1>${message}</body></html>`};
}
function validState(encoded,secret){
 try{
  const decoded=Buffer.from(String(encoded||''),'base64url').toString('utf8');
  const [issuedAt,nonce,signature]=decoded.split('.');
  if(!issuedAt||!nonce||!signature||Date.now()-Number(issuedAt)>10*60*1000)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${issuedAt}.${nonce}`).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
 }catch{return false;}
}

exports.handler=async event=>{
 const clientId=env('YOUTUBE_CLIENT_ID');
 const clientSecret=env('YOUTUBE_CLIENT_SECRET');
 const stateSecret=env('SOCIAL_OAUTH_STATE_SECRET');
 const params=event.queryStringParameters||{};
 if(!clientId||!clientSecret||!stateSecret)return response(503,'YouTube authorization unavailable','<p>Required server configuration is missing.</p>');
 if(!validState(params.state,stateSecret))return response(400,'Authorization rejected','<p>The authorization state is invalid or expired. Start again from the authorization link.</p>');
 if(!params.code)return response(400,'Authorization rejected',`<p>${htmlEscape(params.error||'Google did not return an authorization code.')}</p>`);
 const redirectUri='https://nexusmt.com/.netlify/functions/youtube-oauth-callback';
 const tokenRes=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code:params.code,grant_type:'authorization_code',redirect_uri:redirectUri})
 });
 const tokens=await tokenRes.json().catch(()=>({}));
 if(!tokenRes.ok||!tokens.refresh_token)return response(400,'YouTube authorization failed',`<p>${htmlEscape(tokens.error_description||tokens.error||'No refresh token was returned. Revoke the app grant and try again.')}</p>`);
 return response(200,'YouTube authorization complete',`<p>Copy the value below into Netlify as <strong>YOUTUBE_REFRESH_TOKEN</strong>, then close this page. Do not share it in chat.</p><textarea readonly style="width:100%;min-height:140px">${htmlEscape(tokens.refresh_token)}</textarea>`);
};
