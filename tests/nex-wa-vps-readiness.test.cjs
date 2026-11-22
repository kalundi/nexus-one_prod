'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inspect}=require('../tools/nex-whatsapp-group-bridge/deploy/preflight.cjs');
const {loadRuntimeConfig}=require('../tools/nex-whatsapp-group-bridge/deploy/credentials.cjs');

const env={
 NEX_GROUP_ACCOUNT_MODE:'existing_business',
 NEX_GROUP_EXISTING_BUSINESS_OWNER_AUTHORIZED:'true',
 NEX_GROUP_EXISTING_BUSINESS_RISK_ACKNOWLEDGED:'true',
 NEX_GROUP_OTHER_CHAT_SYNC_RISK_ACKNOWLEDGED:'true',
 NEX_GROUP_EXPECTED_PHONE_E164:'+15551234567',
 NEX_GROUP_AUTH_DIR:'/var/lib/nex-wa/session',
 NEX_GROUP_SHARED_SECRET:'faked-test-key-32-characters-and-more',
 NEX_GROUP_DISCOVERY_MODE:'true',
 NEX_GROUP_BRIDGE_ENABLED:'false',
 NEX_GROUP_NOTICE_CONFIRMED:'false',
 NEX_GROUP_ALLOWLIST:'',
 NEX_GROUP_INGEST_URL:'https://nexusmt.com/.netlify/functions/nex-group-ingest'
};
const secureStat=()=>({uid:1200,mode:0o40700,isDirectory:()=>true});
const options={env,uid:1200,nodeVersion:'v22.16.0',statPath:secureStat};

test('discovery readiness does not attempt linking and accepts a secured non-root setup',()=>{
 const result=inspect(options);
 assert.equal(result.ok,true);
 assert.deepEqual(result.issues,[]);
});
test('rejects root, old Node and open authentication file permissions',()=>{
 assert.equal(inspect({...options,uid:0}).ok,false);
 assert.equal(inspect({...options,nodeVersion:'v18.20.0'}).ok,false);
 assert.equal(inspect({...options,nodeVersion:'v20.19.0'}).ok,false);
 assert.equal(inspect({...options,statPath:()=>({uid:1200,mode:0o40755,isDirectory:()=>true})}).ok,false);
 assert.equal(inspect({...options,statPath:()=>{throw Error('missing')}}).ok,false);
});
test('service mode blocks disabled, incomplete or discovery configurations',()=>{
 assert.equal(inspect({...options,service:true}).ok,false);
 const active={...env,NEX_GROUP_BRIDGE_ENABLED:'true',NEX_GROUP_DISCOVERY_MODE:'false',
  NEX_GROUP_NOTICE_CONFIRMED:'true',NEX_GROUP_ALLOWLIST:'120363333333333@g.us'};
 assert.equal(inspect({...options,env:active,service:true}).ok,true);
 assert.equal(inspect({...options,env:{...active,NEX_GROUP_EXPECTED_PHONE_E164:''},service:true}).ok,false);
 assert.equal(inspect({...options,env:{...active,NEX_GROUP_NOTICE_CONFIRMED:'false'},service:true}).ok,false);
 assert.equal(inspect({...options,env:{...active,NEX_GROUP_DISCOVERY_MODE:'true'},service:true}).ok,false);
});
test('runtime credentials only load from protected systemd files',()=>{
 const original={CREDENTIALS_DIRECTORY:'/run/credentials/test.service',NEX_GROUP_ACCOUNT_MODE:'existing_business'};
 const expected=new Map([
  ['/run/credentials/test.service/nex-shared-secret','this-is-a-test-key-longer-than-32-characters'],
  ['/run/credentials/test.service/nex-expected-number','+15551234567']
 ]);
 const readFile=filename=>{if(!expected.has(filename))throw Error('missing');return expected.get(filename)};
 const config=loadRuntimeConfig(original,{readFile});
 assert.equal(config.NEX_GROUP_EXPECTED_PHONE_E164,'+15551234567');
 assert.equal(config.NEX_GROUP_SHARED_SECRET,'this-is-a-test-key-longer-than-32-characters');
 assert.equal(original.NEX_GROUP_SHARED_SECRET,undefined);
 assert.equal(original.NEX_GROUP_EXPECTED_PHONE_E164,undefined);
 assert.throws(()=>loadRuntimeConfig({}, {readFile}));
 assert.throws(()=>loadRuntimeConfig({CREDENTIALS_DIRECTORY:'relative/path'},{readFile}));
 assert.throws(()=>loadRuntimeConfig(original,{readFile:()=>'+1555'}));
});
test('unit stays stopped by default and never stores real account details',()=>{
 const root=path.resolve(__dirname,'..');
 const unit=fs.readFileSync(path.join(root,'tools/nex-whatsapp-group-bridge/deploy/nex-wa-bridge.service'),'utf8');
 const template=fs.readFileSync(path.join(root,'tools/nex-whatsapp-group-bridge/deploy/bridge.env.example'),'utf8');
 assert.match(unit,/User=nex-wa/);
 assert.match(unit,/NoNewPrivileges=true/);
 assert.match(unit,/ProtectSystem=strict/);
 assert.match(unit,/ExecStartPre=.*preflight\.cjs --service/);
 assert.match(unit,/LoadCredential=nex-shared-secret:/);
 assert.match(unit,/LoadCredential=nex-expected-number:/);
 assert.ok(!template.includes('NEX_GROUP_SHARED_SECRET='));
 assert.ok(!template.includes('NEX_GROUP_EXPECTED_PHONE_E164='));
 assert.match(template,/NEX_GROUP_BRIDGE_ENABLED=false/);
 assert.match(template,/NEX_GROUP_EXISTING_BUSINESS_RISK_ACKNOWLEDGED=false/);
});
