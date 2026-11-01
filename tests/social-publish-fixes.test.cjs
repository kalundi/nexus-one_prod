const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadEvergreenFeed}=require('../netlify/functions/_shared/social-queue.cjs');
const {buildPublishPayload}=require('../netlify/functions/_shared/social-formatters.cjs');
const {publishToChannel}=require('../netlify/functions/_shared/social-clients.cjs');

const ENV_KEYS=['SITE_URL','URL','INSTAGRAM_BUSINESS_ACCOUNT_ID','INSTAGRAM_PAGE_ACCESS_TOKEN','FACEBOOK_PAGE_ACCESS_TOKEN','YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN'];

function saveEnv(){
 const saved={};
 for(const key of ENV_KEYS)saved[key]=process.env[key];
 return saved;
}
function restoreEnv(saved){
 for(const key of ENV_KEYS){
  if(saved[key]===undefined)delete process.env[key];
  else process.env[key]=saved[key];
 }
}

function jsonResponse(body,{ok=true,status=200,headers={}}={}){
 return {
  ok,
  status,
  headers:{get:name=>headers[String(name).toLowerCase()]??null},
  json:async()=>body,
  text:async()=>JSON.stringify(body)
 };
}

test('instagram payload uses the JPEG/PNG instagramAsset override when the feed provides one',async()=>{
 const feed=await loadEvergreenFeed();
 const webpPost=feed.posts.find(item=>item.id==='svc-wheelchair-001');
 const payload=buildPublishPayload(webpPost,feed,'instagram','https://nexusmt.com');
 assert.match(payload.assetUrl,/\.webp$/);
 assert.equal(payload.instagramAssetUrl,'https://nexusmt.com/assets/nexus-coverage-livecare.png');
 const jpgPost=feed.posts.find(item=>item.id==='emt-recruitment-001');
 const jpgPayload=buildPublishPayload(jpgPost,feed,'instagram','https://nexusmt.com');
 assert.equal(jpgPayload.instagramAssetUrl,'https://nexusmt.com/assets/nexus-emt-recruitment.jpg');
});

test('siteBase never builds media URLs on the redirect-only alias domains',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','_shared','social-engine.cjs'),'utf8');
 const start=source.indexOf('function siteBase(){');
 assert.ok(start>=0);
 const end=source.indexOf('\n}\n',start)+3;
 const snippet=source.slice(start,end)+';globalThis.siteBase=siteBase;';
 const resolve=(env)=>{
  const context=vm.createContext({process:{env},URL});
  vm.runInContext(snippet,context);
  return context.siteBase();
 };
 assert.equal(resolve({SITE_URL:'https://mynexusride.com'}),'https://nexusmt.com');
 assert.equal(resolve({URL:'https://nexusmedicaltransit.com'}),'https://nexusmt.com');
 assert.equal(resolve({SITE_URL:'https://nexusmt.com'}),'https://nexusmt.com');
 assert.equal(resolve({}),'https://nexusmt.com');
});

test('instagram waits for the media container to finish before publishing',async()=>{
 const saved=saveEnv();
 const realFetch=globalThis.fetch;
 process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID='ig-123';
 process.env.INSTAGRAM_PAGE_ACCESS_TOKEN='token-abc';
 delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
 const calls=[];
 let statusChecks=0;
 globalThis.fetch=async(url,options={})=>{
  const href=String(url);
  const method=String(options.method||'GET').toUpperCase();
  if(href.includes('fields=status_code')){
   statusChecks++;
   calls.push('status');
   return jsonResponse({status_code:statusChecks===1?'IN_PROGRESS':'FINISHED'});
  }
  if(href.endsWith('/media_publish')){calls.push('publish');return jsonResponse({id:'media-1'});}
  if(href.endsWith('/media')&&method==='POST'){calls.push('create');return jsonResponse({id:'container-1'});}
  throw new Error(`unexpected fetch ${href}`);
 };
 try{
  const result=await publishToChannel('instagram',{text:'Hello',instagramAssetUrl:'https://nexusmt.com/assets/nexus-coverage-livecare.png'});
  assert.equal(result.status,'published');
  assert.equal(result.id,'media-1');
  assert.deepEqual(calls,['create','status','status','publish']);
 }finally{
  globalThis.fetch=realFetch;
  restoreEnv(saved);
 }
});

test('instagram rejects a WebP asset locally with the real reason instead of an opaque Meta error',async()=>{
 const saved=saveEnv();
 const realFetch=globalThis.fetch;
 process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID='ig-123';
 process.env.INSTAGRAM_PAGE_ACCESS_TOKEN='token-abc';
 let fetchCalls=0;
 globalThis.fetch=async()=>{fetchCalls++;throw new Error('fetch should not be called');};
 try{
  const result=await publishToChannel('instagram',{text:'Hello',instagramAssetUrl:'https://nexusmt.com/assets/nexus-shuttle-side.webp'});
  assert.equal(result.status,'failed');
  assert.equal(result.step,'validate_media');
  assert.match(result.error,/instagram_unsupported_image_format:webp/);
  assert.equal(fetchCalls,0);
 }finally{
  globalThis.fetch=realFetch;
  restoreEnv(saved);
 }
});

test('youtube uploads the buffered video bytes with an exact content-length',async()=>{
 const saved=saveEnv();
 const realFetch=globalThis.fetch;
 process.env.YOUTUBE_CLIENT_ID='client-1';
 process.env.YOUTUBE_CLIENT_SECRET='secret-1';
 process.env.YOUTUBE_REFRESH_TOKEN='refresh-1';
 const videoBytes=Buffer.from([0x00,0x01,0x02,0x03,0x04]);
 let putOptions=null;
 globalThis.fetch=async(url,options={})=>{
  const href=String(url);
  const method=String(options.method||'GET').toUpperCase();
  if(href==='https://oauth2.googleapis.com/token')return jsonResponse({access_token:'access-1'});
  if(href==='https://nexusmt.com/assets/test.mp4'){
   return {
    ok:true,
    status:200,
    headers:{get:name=>String(name).toLowerCase()==='content-type'?'video/mp4':null},
    arrayBuffer:async()=>videoBytes.buffer.slice(videoBytes.byteOffset,videoBytes.byteOffset+videoBytes.byteLength)
   };
  }
  if(href.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')){
   return jsonResponse({},{headers:{location:'https://upload.example.com/session'}});
  }
  if(href==='https://upload.example.com/session'&&method==='PUT'){
   putOptions=options;
   return jsonResponse({id:'video-123',status:{privacyStatus:'private'}});
  }
  throw new Error(`unexpected fetch ${href}`);
 };
 try{
  const result=await publishToChannel('youtube',{text:'Description',title:'Title',videoUrl:'https://nexusmt.com/assets/test.mp4'});
  assert.equal(result.status,'published');
  assert.equal(result.id,'video-123');
  assert.ok(Buffer.isBuffer(putOptions.body));
  assert.equal(putOptions.body.byteLength,videoBytes.byteLength);
  assert.equal(putOptions.headers['content-length'],String(videoBytes.byteLength));
 }finally{
  globalThis.fetch=realFetch;
  restoreEnv(saved);
 }
});
