const catalog=require('./access2care-requirements.json');
function isoDay(value){return value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10)}
function addMonths(day,months){const d=new Date(day+'T00:00:00Z'),original=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(original,last));return isoDay(d)}
function evidenceStatus(requirement,record,credentialedOn,today=isoDay(new Date())){
 if(!record||record.decision==='MISSING')return 'MISSING';
 if(requirement.confirmation&&!record.confirmation_reference)return 'NEEDS_CONFIRMATION';
 if(record.decision==='NOT_APPLICABLE')return requirement.conditional?'NOT_APPLICABLE':'NEEDS_REVIEW';
 const done=isoDay(record.completed_on),expiry=isoDay(record.expires_on),start=isoDay(credentialedOn);
 if(!done||done>today)return 'NEEDS_REVIEW';
 if(requirement.daily&&done!==today)return 'EXPIRED';
 if(requirement.expiryRequired&&!expiry)return 'NEEDS_REVIEW';
 const renewal=requirement.renewMonths?addMonths(done,requirement.renewMonths):'';
 if((expiry&&expiry<today)||(renewal&&renewal<=today))return 'EXPIRED';
 if(requirement.initialMaxAgeDays){
  if(!start)return 'NEEDS_CREDENTIALING_DATE';
  // Annual renewals after credentialing are valid; initial checks must be recent enough.
  if(done<=start&&(new Date(start)-new Date(done))/86400000>requirement.initialMaxAgeDays)return 'NEEDS_REVIEW';
 }
 return 'VERIFIED';
}
function dueDate(requirement,record,credentialedOn){
 const done=isoDay(record?.completed_on),expiry=isoDay(record?.expires_on),start=isoDay(credentialedOn);
 if(record?.decision==='NOT_APPLICABLE')return null;
 const dates=[];if(expiry)dates.push(expiry);if(done&&requirement.renewMonths)dates.push(addMonths(done,requirement.renewMonths));
 if(!done&&start&&requirement.initialDueDays){const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+requirement.initialDueDays);dates.push(isoDay(d))}
 if(requirement.daily&&done)dates.push(done);
 if(!done&&requirement.initialDeadline)dates.push(requirement.initialDeadline);
 return dates.sort()[0]||null;
}
module.exports={catalog,evidenceStatus,dueDate,isoDay,addMonths};
