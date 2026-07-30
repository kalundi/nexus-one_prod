const crypto=require('crypto');
const {query}=require('./db.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function safeUser(row){return {id:row.id,email:row.email,displayName:row.display_name,role:row.role,scopeId:row.scope_id||null}}
async function requireUser(token,roles=[]){
  if(!token) throw Object.assign(new Error('Authentication required'),{statusCode:401});
  const r=await query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true`,[digest(token)]);
  if(!r.rows[0]) throw Object.assign(new Error('Session expired or invalid'),{statusCode:401});
  if(roles.length&&!roles.includes(r.rows[0].role)) throw Object.assign(new Error('Insufficient permission'),{statusCode:403});
  return r.rows[0];
}
async function audit(entityType,entityId,action,changes){await query('INSERT INTO audit_log(entity_type,entity_id,action,changes) VALUES($1,$2,$3,$4)',[entityType,String(entityId),action,changes?JSON.stringify(changes):null])}
module.exports={digest,safeUser,requireUser,audit};
