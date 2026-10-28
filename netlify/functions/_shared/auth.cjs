const crypto=require('crypto');
const {query}=require('./db.cjs');
const {getFallbackSession}=require('./fallback-auth.cjs');
const {isDemoUser}=require('./facility-demo-account.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const EMS_ROLES=Object.keys(require('../../../nexus-ems-roles.js'));
const EMS=require('../../../nexus-ems-roles.js');
const EXPERIENCE_ROLES=['ADMIN','DISPATCHER','DRIVER','FACILITY','BILLING','QA','EXECUTIVE','PATIENT','CARETAKER','STAFF',...EMS_ROLES];
function resolveSessionRoles(user,roleRows=[]){
  const baseRole=String(user.role||'PATIENT').toUpperCase();
  const approved=new Map(roleRows.map(row=>[String(row.role).toUpperCase(),row.scope_id||null]));
  approved.set(baseRole,user.scope_id||null);
  if(user.access_title&&EMS.access[user.access_title]?.role===baseRole)approved.set(user.access_title,user.scope_id||null);
  approved.set('PATIENT',null);
  if(approved.has('ADMIN'))for(const role of EXPERIENCE_ROLES)if(!approved.has(role))approved.set(role,null);
  const requested=String(user.active_role||baseRole).toUpperCase();
  const role=approved.has(requested)?requested:baseRole;
  const title=EMS.access[role]?role:(role===baseRole&&EMS.access[user.access_title]?.role===baseRole?user.access_title:null);
  return {...user,role:EMS.access[role]?.role||role,access_title:title||null,scope_id:approved.get(role)||null,available_roles:[...approved.keys()]};
}
function safeUser(row){const title=EMS.access[row.access_title]?.role===row.role?row.access_title:(EMS.access[row.role]?row.role:null),role=EMS.access[title]?.role||row.role;return {id:row.id,userCode:row.user_code||null,email:row.email,phone:row.phone||'',displayName:row.display_name,role,accessRole:role,titleRole:title,titleLabel:EMS[title]||null,workspaceUrl:EMS.access[title]?.url||null,roles:Array.isArray(row.available_roles)?row.available_roles:[row.role],functions:row.functions||[],scopeId:row.scope_id||null,serviceType:row.service_type||row.serviceType||row.default_service_type||null,mustChangePassword:!!row.must_change_password}}

// Inactivity timeout: 1 hour for non-DRIVER roles, 12 hours for DRIVER
const INACTIVITY_MS = {DRIVER: 12*60*60*1000, DEFAULT: 60*60*1000};

async function requireUser(token,roles=[]){
  if(!token) throw Object.assign(new Error('Authentication required'),{statusCode:401});
  // Try enhanced query with session activity columns; fall back if migration not yet run
  let r;
  try{
    r=await query(`SELECT u.*, s.id AS session_id, s.last_activity_at, s.active_role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true`,[digest(token)]);
  }catch(e){
    // last_activity_at column may not exist yet — use safe fallback query
    r=await query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true`,[digest(token)]);
  }
  let u=r.rows[0]||null;
  if(!u){
    const fallbackSession=getFallbackSession(token);
    if(fallbackSession?.user){
      u=fallbackSession.user;
    }
  }
  if(!u) throw Object.assign(new Error('Session expired or invalid'),{statusCode:401});
  if(isDemoUser(u))throw Object.assign(new Error('This account is limited to the Annapolis facility demo.'),{statusCode:403});
  if(u.session_id){
    const roleRows=await query("SELECT role,scope_id FROM user_role_requests WHERE user_id=$1 AND status='APPROVED'",[u.id]).catch(()=>({rows:[]}));
    u=resolveSessionRoles(u,roleRows.rows||[]);
  }
  // Inactivity timeout — only when the column exists in the result
  if(u.last_activity_at&&u.session_id){
    const timeoutMs=INACTIVITY_MS[u.role]||INACTIVITY_MS.DEFAULT;
    const idle=Date.now()-new Date(u.last_activity_at).getTime();
    if(idle>timeoutMs){
      await query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[u.session_id]);
      throw Object.assign(new Error('Session expired due to inactivity'),{statusCode:401,code:'INACTIVITY_TIMEOUT'});
    }
    query('UPDATE sessions SET last_activity_at=now() WHERE id=$1',[u.session_id]).catch(()=>{});
  }
  if(EMS.access[u.role])u={...u,access_title:u.role,role:EMS.access[u.role].role};
  if(roles.length&&!roles.includes(u.role)) throw Object.assign(new Error('Insufficient permission'),{statusCode:403});
  return u;
}
async function audit(entityType,entityId,action,changes){
  try{
    await query('INSERT INTO audit_log(entity_type,entity_id,action,changes) VALUES($1,$2,$3,$4)',[entityType,String(entityId),action,changes?JSON.stringify(changes):null]);
  }catch(error){
    console.warn('[AUDIT] Non-blocking audit failure:', error?.message||error);
  }
}
module.exports={digest,safeUser,requireUser,audit,resolveSessionRoles};
