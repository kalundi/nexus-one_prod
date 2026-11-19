const clean=value=>String(value??'').trim();
async function requireActiveFacility(query,scopeId){
 const id=clean(scopeId);
 if(!id)throw Object.assign(Error('Select the facility this manager is authorized to access.'),{statusCode:400});
 const facility=(await query('SELECT facility_code,name,address FROM facilities WHERE facility_code=$1 AND active=true',[id])).rows[0];
 if(!facility)throw Object.assign(Error('Select an active facility before granting facility manager access.'),{statusCode:400});
 return facility;
}
// Multi-facility manager access. A FACILITY manager's primary facility is
// users.scope_id; user_facilities links any additional facilities the same
// manager may open (migration 101.001). These helpers are FACILITY-focused:
// for any other role they return the scope only and never consult the link
// table, so staff and patient flows keep their existing behavior.
// Ordered unique facility codes for a manager: scope_id first, then the
// linked facilities ordered by facility name.
async function facilityCodesForUser(query,user){
 const scope=clean(user?.scope_id),codes=scope?[scope]:[];
 if(user?.role!=='FACILITY'||!user?.id)return codes;
 const rows=(await query(`SELECT uf.facility_code FROM user_facilities uf JOIN facilities f ON f.facility_code=uf.facility_code WHERE uf.user_id=$1 ORDER BY f.name,uf.facility_code`,[user.id])).rows;
 for(const row of rows){const code=clean(row.facility_code);if(code&&!codes.includes(code))codes.push(code);}
 return codes;
}
// True when the code is the user's scope facility or a linked facility.
async function userCanAccessFacility(query,user,code){
 const target=clean(code);
 if(!target)return false;
 if(clean(user?.scope_id)===target)return true;
 if(!user?.id)return false;
 const rows=(await query('SELECT 1 FROM user_facilities WHERE user_id=$1 AND facility_code=$2 LIMIT 1',[user.id,target])).rows;
 return rows.length>0;
}
module.exports={requireActiveFacility,facilityCodesForUser,userCanAccessFacility};
