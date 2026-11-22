'use strict';
// Non-invasive VPS readiness inspection. Does not launch a browser or log secrets.
const fs=require('node:fs');
const {validateConfig}=require('../filters.cjs');

function inspect({
 env=process.env,
 uid=typeof process.getuid==='function'?process.getuid():null,
 nodeVersion=process.version,
 statPath=fs.statSync,
 service=false,
}={}){
 const issues=[];
 const match=String(nodeVersion).match(/^v?(\d+)\.(\d+)/);
 if(!match||Number(match[1])<20||(Number(match[1])===20&&Number(match[2])<20))
  issues.push('Node.js 20.20 or later is required');
 if(uid===0||uid===null)issues.push('Bridge must run as a known non-root Linux service account');
 if(service&&env.NEX_GROUP_DISCOVERY_MODE==='true')
  issues.push('Discovery mode cannot be started as a background service');
 if(service&&env.NEX_GROUP_BRIDGE_ENABLED!=='true')
  issues.push('Background service must remain stopped until monitoring is intentionally enabled');
 try{
  validateConfig(env,!service&&env.NEX_GROUP_BRIDGE_ENABLED!=='true');
 }catch{issues.push('WhatsApp account confirmation, allowlist, URL or safety configuration is incomplete');}
 const dir=env.NEX_GROUP_AUTH_DIR;
 if(dir){
  try{
   const info=statPath(dir);
   if(!info.isDirectory())issues.push('Auth storage path is not a directory');
   if((info.mode&0o077)!==0)issues.push('Auth storage permissions must be 0700');
   if(uid!==null&&info.uid!==uid)issues.push('Auth storage must belong to the non-root service user');
  }catch{issues.push('Auth storage directory does not exist or is inaccessible');}
 }
 return {ok:issues.length===0,issues};
}
if(require.main===module){
 const service=process.argv.includes('--service');
 const result=inspect({service});
 console.log('Nex WhatsApp VPS preflight: '+(result.ok?'PASS':'BLOCKED'));
 for(const issue of result.issues)console.error(' - '+issue);
 console.log('This check never connects to WhatsApp, forwards messages or displays secrets.');
 process.exitCode=result.ok?0:2;
}
module.exports={inspect};
