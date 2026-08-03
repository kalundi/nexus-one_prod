const crypto=require('crypto');
const {query}=require('./db.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function safeUser(row){return {id:row.id,email:row.email,displayName:row.display_name,role:row.role,scopeId:row.scope_id||null,mustChangePassword:!!row.must_change_password}}

// Inactivity timeout: 1 hour for non-DRIVER roles, 12 hours for DRIVER
const INACTIVITY_MS = {DRIVER: 12*60*60*1000, DEFAULT: 60*60*1000};

async function requireUser(token,roles=[]){
  if(!token) throw Object.assign(new Error('Authentication required'),{statusCode:401});
  const r=await query(`SELECT u.*, s.id AS session_id, s.last_activity_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true`,[digest(token)]);
  if(!r.rows[0]) throw Object.assign(new Error('Session expired or invalid'),{statusCode:401});
  const u=r.rows[0];
  // Inactivity timeout check (skip if column not yet migrated)
  if(u.last_activity_at){
    const timeoutMs=INACTIVITY_MS[u.role]||INACTIVITY_MS.DEFAULT;
    const idle=Date.now()-new Date(u.last_activity_at).getTime();
    if(idle>timeoutMs){
      await query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[u.session_id]);
      throw Object.assign(new Error('Session expired due to inactivity'),{statusCode:401,code:'INACTIVITY_TIMEOUT'});
    }
    // Refresh last activity (fire-and-forget)
    query('UPDATE sessions SET last_activity_at=now() WHERE id=$1',[u.session_id]).catch(()=>{});
  }
  if(roles.length&&!roles.includes(u.role)) throw Object.assign(new Error('Insufficient permission'),{statusCode:403});
  return u;
}
async function audit(entityType,entityId,action,changes){await query('INSERT INTO audit_log(entity_type,entity_id,action,changes) VALUES($1,$2,$3,$4)',[entityType,String(entityId),action,changes?JSON.stringify(changes):null])}
module.exports={digest,safeUser,requireUser,audit};
