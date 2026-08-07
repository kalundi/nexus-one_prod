const fs=require('node:fs/promises');
const path=require('node:path');

const FEED_FILE=path.join(__dirname,'..','..','..','social','evergreen-posts.json');

const CHANNEL_ALIASES={
 'instagram-reels':'instagram',
 'linkedin-alt':'facebook'
};

function normalizeChannel(channel){
 return CHANNEL_ALIASES[String(channel||'').trim().toLowerCase()]||String(channel||'').trim().toLowerCase();
}

async function loadEvergreenFeed(){
 const raw=await fs.readFile(FEED_FILE,'utf8');
 const parsed=JSON.parse(raw);
 const posts=Array.isArray(parsed.posts)?parsed.posts:[];
 return {
  brand:String(parsed.brand||'Nexus Medical Transit'),
  primaryPhone:String(parsed.primaryPhone||'(888) 639-5766'),
  publishTimeZone:String(parsed.publishTimeZone||'America/New_York'),
  defaultHashtags:Array.isArray(parsed.defaultHashtags)?parsed.defaultHashtags:[],
  posts:posts.map((post,index)=>({
   ...post,
   id:String(post.id||`post-${index+1}`),
   pillar:String(post.pillar||'general'),
   channels:(Array.isArray(post.channels)?post.channels:[]).map(normalizeChannel)
  }))
 };
}

function getUsedPostIds(historyRows){
 return new Set((historyRows||[]).map(row=>String(row.post_id||'')));
}

function getRecentPillars(historyRows){
 return (historyRows||[]).map(row=>String(row.pillar||'')).filter(Boolean);
}

function choosePostForChannel(posts,channel,historyRows=[]){
 const normalized=normalizeChannel(channel);
 const eligible=posts.filter(post=>Array.isArray(post.channels)&&post.channels.includes(normalized));
 if(!eligible.length) return null;

 const used=getUsedPostIds(historyRows);
 const recentPillars=getRecentPillars(historyRows);
 const recentSet=new Set(recentPillars.slice(0,3));

 const fresh=eligible.filter(post=>!used.has(post.id));
 const pool=fresh.length?fresh:eligible;

 const notRecentPillar=pool.filter(post=>!recentSet.has(String(post.pillar||'')));
 const sorted=(notRecentPillar.length?notRecentPillar:pool).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return sorted[0]||null;
}

module.exports={loadEvergreenFeed,normalizeChannel,choosePostForChannel};
