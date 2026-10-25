const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../netlify/functions/_shared/facility-demo-billing.cjs'),D=require('../netlify/functions/_shared/facility-demo.cjs'),Fare=require('../nexus-fare.js');
const settings={pricing:{ambulatory:{base:40,perMile:3},wheelchair:{base:65,perMile:4},stretcher:{base:100,perMile:5}},fareRules:{cardProcessingFeePct:3,shortNoticeSurchargePct:0,fuelSurchargePerMile:.5}};
test('ten legs reconcile to shared fare engine and category totals in cents',()=>{
 const invoice=B.create(D.PATIENTS,settings);assert.equal(invoice.rows.length,10);
 for(const row of invoice.rows){const patient=D.PATIENTS.find(p=>p.id===row.patientId),expected=Fare.calculate({service:row.service.toLowerCase(),rate:settings.pricing[row.service.toLowerCase()],rules:settings.fareRules,miles:row.miles,date:B.DATE,time:row.pickup,metrics:{durationMinutes:patient.travel,trafficDurationMinutes:patient.travel}});assert.equal(row.total,Math.round(expected.total*100));assert.equal(Object.values(row.categories).reduce((a,b)=>a+b,0),row.total);assert.equal(row.categories.waiting,0);}
 assert.equal(B.view(invoice,'2026-10','month').categories.reduce((sum,c)=>sum+c.total,0),invoice.total);assert.equal(B.view(invoice,'2026-09','month').total,0);assert.equal(B.view(invoice,'2026-10-25').invoices.length,0);assert.throws(()=>B.view(invoice,'2026-02-31'));assert.throws(()=>B.view(invoice,'x','year'));
});
test('delivery waits for all returns and remains idempotent after rewind',()=>{
 const draft=B.create(D.PATIENTS,settings);assert.equal(B.finalize(draft,{metrics:{returned:4}}),draft);
 const issued=B.finalize(draft,{metrics:{returned:5},time:'3:30 PM',minute:930});assert.equal(issued.status,'issued');assert.equal(issued.delivery.recipient,D.USERNAME);assert.equal(B.finalize(issued,{metrics:{returned:0}}),issued);assert.equal(B.finalize(issued,{metrics:{returned:5}}),issued);assert.equal(issued.total,draft.total);
});
