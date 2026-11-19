const clean=value=>String(value??'').trim();
const {userCanAccessFacility}=require('./facility-access.cjs');
async function resolveBookingFacility(query,actor,requested){
 const scope=actor?.role==='FACILITY'?clean(actor.scope_id):'';
 const code=clean(requested)||scope;
 if(actor?.role==='FACILITY'&&!scope)throw Object.assign(Error('Your facility account needs an associated facility before booking.'),{statusCode:409});
 // A manager books for their scope facility (the fast path above) or for
 // any facility linked to their account in user_facilities; a facility
 // outside that set is the same 403 as before.
 if(scope&&code!==scope&&!(await userCanAccessFacility(query,actor,code)))throw Object.assign(Error('Choose the facility associated with your account.'),{statusCode:403});
 if(!code)return null;
 const facility=(await query('SELECT facility_code,name,address FROM facilities WHERE facility_code=$1 AND active=true',[code])).rows[0];
 if(!facility)throw Object.assign(Error('Select an active facility from the facility list.'),{statusCode:400});
 return facility;
}
module.exports={resolveBookingFacility};
