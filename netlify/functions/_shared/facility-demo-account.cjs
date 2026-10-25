const crypto=require('node:crypto');
const {hashPassword,verifyPassword}=require('./password.cjs');
const EMAIL='annapolis.demo@nexusmt.com',SCOPE='futurecare-annapolis-demo',KEY='demo:facility:futurecare-annapolis';
const isDemoUser=user=>String(user?.email||'').toLowerCase()===EMAIL || user?.scope_id===SCOPE;
function allowed(user){return !!user&&String(user.email).toLowerCase()===EMAIL&&user.role==='FACILITY'&&user.scope_id===SCOPE&&user.active===true;}
function signingSecret(config,user){return crypto.createHmac('sha256',config.secret).update(`${user.id}:${user.password_hash}`).digest('hex');}
function newPassword(){return crypto.randomBytes(18).toString('base64url');}
async function getAccount(query,lock=false){return (await query('SELECT * FROM users WHERE lower(email)=$1 LIMIT 1'+(lock?' FOR UPDATE':''),[EMAIL])).rows[0]||null;}
// Caller supplies a transaction. A credential is initialized only once, never on later deployments.
async function provision(query,passwordHash,baseConfig){
 let config=(await query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]?.value;
 let user=await getAccount(query,true);
 if(user&&(user.role!=='FACILITY'||user.scope_id!==SCOPE))throw Object.assign(Error('The reserved demo email belongs to another account scope. Review it before migration.'),{statusCode:409});
 if(config?.managedUserId&&user){return {user,changed:false};}
 if(!/^[a-f0-9]{64}$/.test(passwordHash))throw Error('A valid initial password hash is required.');
 if(!user){
  const org=(await query("SELECT id FROM organizations ORDER BY (name='Nexus Medical Transit') DESC,created_at LIMIT 1")).rows[0];
  if(!org)throw Error('An organization is required before creating the demo manager.');
  user=(await query(`INSERT INTO users(email,display_name,role,scope_id,password_hash,phone,active,organization_id,identity_subject,functions,must_change_password,password_reset_expires)
   VALUES($1,'FutureCare Annapolis Demo Manager','FACILITY',$2,$3,'',true,$4,$5,ARRAY['FACILITY_COORDINATION'],false,NULL) RETURNING *`,[EMAIL,SCOPE,passwordHash,org.id,crypto.randomUUID()])).rows[0];
 }else{
  user=(await query('UPDATE users SET password_hash=$2,must_change_password=false,password_reset_expires=NULL,updated_at=now() WHERE id=$1 RETURNING *',[user.id,passwordHash])).rows[0];
  await query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
 }
 config={...(config||baseConfig),authMode:'users',managedUserId:String(user.id)};
 delete config.salt;delete config.passwordHash;
 await query('INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()',[KEY,JSON.stringify(config)]);
 return {user,changed:true};
}
async function issuePassword(query,id){
 const user=await getAccount(query,true);
 if(!user||String(user.id)!==String(id))throw Object.assign(Error('Demo manager not found.'),{statusCode:404});
 if(!allowed(user))throw Object.assign(Error('Activate the demo-only account before issuing a password.'),{statusCode:409});
 const password=newPassword();
 await query('UPDATE users SET password_hash=$2,must_change_password=false,password_reset_expires=NULL,password_reset_token=NULL,password_reset_used=false,updated_at=now() WHERE id=$1',[user.id,hashPassword(password)]);
 await query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
 return {password,email:EMAIL,loginUrl:'/facility-demo.html',demoOnly:true,message:'New demo manager password issued. Previous passwords and demo sessions are invalid. Save this password now; it is not retrievable later. No email was sent.'};
}
async function revokeDemoSessions(query){await query("UPDATE system_settings SET value=jsonb_set(value,'{secret}',to_jsonb($2::text)),updated_at=now() WHERE key=$1",[KEY,crypto.randomBytes(32).toString('hex')]);}
module.exports={EMAIL,SCOPE,KEY,isDemoUser,allowed,signingSecret,newPassword,getAccount,provision,issuePassword,revokeDemoSessions,hashPassword,verifyPassword};
