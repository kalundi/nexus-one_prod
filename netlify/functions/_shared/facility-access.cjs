async function requireActiveFacility(query,scopeId){
 const id=String(scopeId||'').trim();
 if(!id)throw Object.assign(Error('Select the facility this manager is authorized to access.'),{statusCode:400});
 const facility=(await query('SELECT facility_code,name,address FROM facilities WHERE facility_code=$1 AND active=true',[id])).rows[0];
 if(!facility)throw Object.assign(Error('Select an active facility before granting facility manager access.'),{statusCode:400});
 return facility;
}
module.exports={requireActiveFacility};
