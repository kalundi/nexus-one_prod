const crypto=require('crypto');
const clean=v=>String(v??'').trim();
function codeText(value){return clean(value?.text||value?.coding?.[0]?.display||value?.coding?.[0]?.code)}
function referenceId(reference,prefix){const value=clean(reference);return value.startsWith(prefix+'/')?value.slice(prefix.length+1):''}
function mapFhirAppointment(resource,{sourceSystem='FHIR',patient={}}={}){
 if(!resource||resource.resourceType!=='Appointment')throw Object.assign(new Error('FHIR resourceType must be Appointment'),{statusCode:400});
 if(!resource.id&&!resource.identifier?.[0]?.value)throw Object.assign(new Error('FHIR Appointment requires id or identifier'),{statusCode:400});
 if(!resource.start)throw Object.assign(new Error('FHIR Appointment.start is required for KeyMark monitoring'),{statusCode:400});
 const patientParticipant=(resource.participant||[]).find(p=>clean(p?.actor?.reference).startsWith('Patient/'));
 const locationParticipant=(resource.participant||[]).find(p=>clean(p?.actor?.reference).startsWith('Location/'));
 const externalId=clean(resource.identifier?.[0]?.value||resource.id);
 const patientId=clean(patient.id||referenceId(patientParticipant?.actor?.reference,'Patient'));
 const patientName=clean(patient.name||patientParticipant?.actor?.display||`Patient ${patientId||'unresolved'}`);
 return {externalAppointmentId:externalId,sourceSystem:clean(sourceSystem).toUpperCase(),patientExternalId:patientId||null,patientName,patientPhone:clean(patient.phone)||null,patientEmail:clean(patient.email)||null,appointmentAt:resource.start,department:clean(locationParticipant?.actor?.display)||null,appointmentType:codeText(resource.appointmentType)||codeText(resource.serviceType?.[0])||clean(resource.description)||null,notes:clean(resource.comment)||null,integrationPayload:{fhirVersion:'R4',resourceId:clean(resource.id)||null,status:clean(resource.status)||null,locationReference:clean(locationParticipant?.actor?.reference)||null}};
}
function parseHl7(raw){const text=String(raw||'').replace(/\r?\n/g,'\r');const segments=text.split('\r').filter(Boolean).map(line=>line.split('|'));const byName=name=>segments.filter(s=>s[0]===name);const first=name=>byName(name)[0]||[];const msh=first('MSH'),sch=first('SCH'),pid=first('PID'),ais=first('AIS'),ail=first('AIL');if(msh[8]&&!/^SIU\^S1[2-6]/i.test(msh[8]))throw Object.assign(new Error('KeyMark accepts HL7 v2 SIU S12-S16 scheduling messages'),{statusCode:400});const ts=clean(sch[11]||ais[4]);const iso=ts?`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(8,10)||'00'}:${ts.slice(10,12)||'00'}:${ts.slice(12,14)||'00'}${ts.length>14?ts.slice(14):''}`:'';const name=clean(pid[5]).split('^');return {messageControlId:clean(msh[9]),eventType:clean(msh[8]),externalAppointmentId:clean(sch[1]||sch[2]||msh[9]),patientExternalId:clean(pid[3]).split('^')[0]||null,patientName:[name[1],name[0]].filter(Boolean).join(' ')||'Patient unresolved',patientPhone:clean(pid[13]).split('^')[0]||null,appointmentAt:iso,department:clean(ail[3]).split('^')[1]||clean(ail[3])||null,appointmentType:clean(ais[3]).split('^')[1]||clean(ais[3])||null,integrationPayload:{hl7Version:clean(msh[11]),eventType:clean(msh[8]),messageControlId:clean(msh[9])}};
}
function secureEqual(a,b){const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&left.length>0&&crypto.timingSafeEqual(left,right)}
function verifyIntegrationRequest(event){const expected=process.env.KEYMARK_INTEGRATION_API_KEY;if(!expected)throw Object.assign(new Error('KeyMark integration gateway is not configured'),{statusCode:503});const supplied=event.headers?.['x-keymark-api-key']||event.headers?.['X-Keymark-Api-Key'];if(!secureEqual(supplied,expected))throw Object.assign(new Error('Invalid KeyMark integration credential'),{statusCode:401})}
function payloadDigest(value){return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')}
module.exports={mapFhirAppointment,parseHl7,verifyIntegrationRequest,payloadDigest};
