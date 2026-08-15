const test=require('node:test');
const assert=require('node:assert/strict');
const {mapFhirAppointment,parseHl7,payloadDigest}=require('../netlify/functions/_shared/keymark-connectors.cjs');

test('maps a FHIR R4 Appointment into the KeyMark canonical model',()=>{
 const mapped=mapFhirAppointment({resourceType:'Appointment',id:'appt-42',status:'booked',start:'2026-08-20T14:00:00-04:00',appointmentType:{coding:[{code:'FOLLOWUP',display:'Follow-up'}]},participant:[{actor:{reference:'Patient/p-7',display:'Jamie Rivera'}},{actor:{reference:'Location/loc-2',display:'Cardiology'}}]},{sourceSystem:'EPIC',patient:{phone:'+12025550199'}});
 assert.equal(mapped.externalAppointmentId,'appt-42');assert.equal(mapped.sourceSystem,'EPIC');assert.equal(mapped.patientExternalId,'p-7');assert.equal(mapped.patientName,'Jamie Rivera');assert.equal(mapped.department,'Cardiology');assert.equal(mapped.appointmentType,'Follow-up');
});

test('maps an HL7 v2 SIU message into the KeyMark canonical model',()=>{
 const message=['MSH|^~\\&|EHR|HOSP|KEYMARK|NEXUS|202608131200||SIU^S12|MSG-100|P|2.5.1','SCH|APT-100||||||||||20260820140000','PID|||P-100||Rivera^Jamie||||||||2025550199','AIS|||FOLLOWUP^Follow-up visit|20260820140000','AIL|||CARD^Cardiology'].join('\r');
 const mapped=parseHl7(message);assert.equal(mapped.externalAppointmentId,'APT-100');assert.equal(mapped.patientExternalId,'P-100');assert.equal(mapped.patientName,'Jamie Rivera');assert.equal(mapped.department,'Cardiology');assert.equal(mapped.integrationPayload.hl7Version,'2.5.1');
});

test('payload digests are deterministic without retaining PHI',()=>{assert.equal(payloadDigest('same'),payloadDigest('same'));assert.notEqual(payloadDigest('same'),payloadDigest('different'))});
