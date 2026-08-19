const DOCUMENTS={
 'transportation-rates':{
  key:'transportation-rates',
  title:'Nexus Transportation Rates',
  description:'Current Nexus transportation rates, policies, direct-access links, and interactive example pricing.',
  asset:'transportation-rates.png',
  calculator:{type:'nexus-pricing',x:2.2,y:78.25,width:64.25,height:11.45,defaultService:'wheelchair',defaultMiles:13,defaultWaitMinutes:30},
  links:[
   {label:'Call Nexus main toll-free',href:'tel:+18886395766',x:73.05,y:35.68,width:20.51,height:3.52},
   {label:'Call Nexus customer service',href:'tel:+18887604990',x:73.05,y:40.04,width:20.51,height:3.58},
   {label:'Call Nexus regional DC',href:'tel:+12023159253',x:73.05,y:44.53,width:20.51,height:3.58},
   {label:'Call Nexus regional Maryland',href:'tel:+12403947089',x:73.05,y:48.89,width:20.51,height:3.65},
   {label:'Email Nexus',href:'mailto:contact@nexusmt.com?subject=Facility%20Transportation%20Inquiry',x:72.46,y:53.19,width:23.83,height:4.3},
   {label:'Visit Nexus Medical Transit',href:'https://nexusmt.com/',x:72.46,y:57.94,width:23.83,height:4.43},
   {label:'Nexus on YouTube',href:'https://www.youtube.com/@nexus_m_t',x:69.14,y:68.88,width:5.08,height:4.82},
   {label:'Nexus on TikTok',href:'https://www.tiktok.com/@nexus_m_t',x:75,y:68.88,width:5.08,height:4.82},
   {label:'Nexus on Instagram',href:'https://www.instagram.com/nexus_m_t/',x:80.86,y:68.88,width:5.27,height:4.82},
   {label:'Nexus on Facebook',href:'https://www.facebook.com/profile.php?id=61581462908206',x:86.82,y:68.88,width:5.27,height:4.82},
   {label:'Nexus on Bluesky',href:'https://bsky.app/profile/nexusmt.bsky.social',x:92.68,y:68.88,width:5.37,height:4.82},
   {label:'Open Nexus Booking App',href:'/booking-app.html',x:68.95,y:74.22,width:28.03,height:5.53},
   {label:'Open Nexus Patient App',href:'/patient.html',x:68.95,y:79.75,width:28.03,height:5.53},
   {label:'Visit NexusMT.com',href:'https://nexusmt.com/',x:68.95,y:85.29,width:28.03,height:5.66}
  ]
 }
};
const getSecureDocument=key=>DOCUMENTS[String(key||'').trim()]||null;
const listSecureDocuments=()=>Object.values(DOCUMENTS).map(({asset,...document})=>document);
module.exports={getSecureDocument,listSecureDocuments};
