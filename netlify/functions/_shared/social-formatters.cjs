function uniq(values=[]){
 const seen=new Set();
 const out=[];
 for(const value of values){
  const v=String(value||'').trim();
  if(!v||seen.has(v)) continue;
  seen.add(v);
  out.push(v);
 }
 return out;
}

function formatHashtags(post,feed){
 const postTags=Array.isArray(post.hashtags)?post.hashtags:[];
 const defaultTags=Array.isArray(feed.defaultHashtags)?feed.defaultHashtags:[];
 return uniq([...postTags,...defaultTags]).join(' ');
}

function buildPostText(post,feed,channel){
 const brand=String(feed.brand||'Nexus Medical Transit');
 const headline=String(post.headline||'').trim();
 const baseCaption=String(post.caption||post.shortCaption||'').trim();
 const cta=String(post.cta||'Learn more').trim();
 const link=String(post.url||'https://nexusmt.com/').trim();
 const phone=String(feed.primaryPhone||'(888) 639-5766').trim();
 const hashtags=formatHashtags(post,feed);

 if(channel==='instagram'){
  return `${headline}\n\n${post.shortCaption||baseCaption}\n\n${cta}: ${link}\n${hashtags}`.trim();
 }
 if(channel==='bluesky'){
  return `${post.shortCaption||headline}\n${link}\n${hashtags}`.trim();
 }
 if(channel==='facebook'){
  return `${headline}\n\n${baseCaption}\n\n${cta}: ${link}\nCall ${phone}\n${hashtags}`.trim();
 }
 return `${brand}: ${headline}\n${baseCaption}\n${link}\n${hashtags}`.trim();
}

function toAbsoluteAssetUrl(assetPath,baseUrl){
 const asset=String(assetPath||'').trim();
 if(!asset) return '';
 if(/^https?:\/\//i.test(asset)) return asset;
 const base=String(baseUrl||'https://nexusmt.com').replace(/\/$/,'');
 const rel=asset.startsWith('/')?asset:`/${asset}`;
 return `${base}${rel}`;
}

function buildPublishPayload(post,feed,channel,baseUrl='https://nexusmt.com'){
 return {
  channel,
  postId:post.id,
  pillar:post.pillar,
  asset:String(post.asset||''),
    assetUrl:toAbsoluteAssetUrl(post.asset,baseUrl),
  altText:String(post.altText||''),
  text:buildPostText(post,feed,channel),
  link:String(post.url||'https://nexusmt.com/'),
  hashtags:formatHashtags(post,feed)
 };
}

module.exports={buildPublishPayload};
