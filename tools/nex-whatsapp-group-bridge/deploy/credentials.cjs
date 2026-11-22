'use strict';
// Sensitive credentials are supplied as protected systemd files, not env values
// in unit files or EnvironmentFile. No secrets or phone numbers are logged.
const fs=require('node:fs');
const path=require('node:path');
function loadRuntimeConfig(env=process.env,{readFile=fs.readFileSync}={}){
 const dir=String(env.CREDENTIALS_DIRECTORY||'');
 if(!path.isAbsolute(dir)||dir==='/')throw Error('Protected systemd credentials are required');
 const read=(name)=>String(readFile(path.join(dir,name),'utf8')).trim();
 const secret=read('nex-shared-secret');
 const expected=read('nex-expected-number');
 if(secret.length<32||!/^\+[1-9][0-9]{7,14}$/.test(expected))
  throw Error('Protected systemd credentials are invalid');
 // Returns a process-local object. This does not place secrets in process.env.
 return {...env,NEX_GROUP_SHARED_SECRET:secret,NEX_GROUP_EXPECTED_PHONE_E164:expected};
}
module.exports={loadRuntimeConfig};
