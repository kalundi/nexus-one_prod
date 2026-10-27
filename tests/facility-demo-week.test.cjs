const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../netlify/functions/_shared/facility-demo.cjs'),B=require('../netlify/functions/_shared/facility-demo-billing.cjs'),Fare=require('../nexus-fare.js');
const settings={pricing:{ambulatory:{base:40,perMile:3,waitPer15:15},wheelchair:{base:65,perMile:4,waitPer15:20},stretcher:{base:100,perMile:5,waitPer15:30}},fareRules:{cardProcessingFeePct:3,shortNoticeSurchargePct:0,waitingPolicyVersion:2,freeWaitMinutes:15}};
test('five service dates start with five sample round trips and waits rotate over the week',()=>{
 assert.deepEqual(D.DATES,['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30']);
 const config={state:D.initialState(1000)};D.syncBilling(config,settings);
 const month=B.view(Object.values(config.invoices),'2026-10','month');assert.equal(month.invoices.length,5);assert.equal(month.invoices.flatMap(i=>i.rows).length,50);
 for(const date of D.DATES){const state=D.initialState(1000,date),day=D.project(state,1000);assert.equal(day.scenarioDate,date);assert.equal(day.patients.length,5);assert.equal(new Set(day.patients.map(p=>p.waitMinutes)).size,3);assert.equal(B.view(Object.values(config.invoices),date).invoices.length,1);}
 assert.notEqual(D.patientsFor(config.state)[0].returnPickup,D.patientsFor(config.days[D.DATES[1]])[0].returnPickup);
 const residents=D.DATES.flatMap(date=>D.patientsFor(D.initialState(1000,date)));
 assert.equal(new Set(residents.map(patient=>patient.id)).size,25);assert.equal(new Set(residents.map(patient=>patient.name)).size,25);
 assert.equal(new Set(month.invoices.flatMap(invoice=>invoice.rows.map(row=>row.patient))).size,25);
});
test('each day routes its alerts, schedule edits and trip notifications to its own residents',()=>{
 for(const date of D.DATES){const original=D.initialState(1000,date),patients=D.patientsFor(original),ids=new Set(patients.map(p=>p.id));
  const state=D.control({...original,baseMinute:patients[1].pickup+11},{action:'issue',patientId:patients[0].id},1000),snapshot=D.project(state,1000);
  assert.ok(snapshot.alerts.some(alert=>alert.patientId===patients[1].id));assert.ok(snapshot.alerts.some(alert=>alert.patientId===patients[0].id));
  for(const message of snapshot.messages){assert.ok(ids.has(message.patientId));assert.equal(message.patient,patients.find(p=>p.id===message.patientId).name);}
  const returnState={...original,baseMinute:patients[3].returnPickup+7};assert.ok(D.project(returnState,1000).alerts.some(alert=>alert.patientId===patients[3].id));
 }
});
test('legacy daily schedule edits and overrides migrate once without losing their values',()=>{
 const state={...D.initialState(1000,'2026-10-28'),rosterVersion:undefined,returnSchedules:{'FC-DEMO-01':{returnPickup:800,waitMinutes:300,vehicleWaiting:false}},overrides:[{id:'legacy-issue',patientId:'FC-DEMO-01',at:435,type:'issue',leg:'outbound',minutes:0}],scheduleChanges:[{id:'legacy-change',patientId:'FC-DEMO-01',at:435,text:'Evelyn Hart: return pickup changed.'}]};
 const migrated=D.migrateState(state);assert.equal(D.migrateState(migrated),migrated);assert.equal(migrated.returnSchedules['FC-DEMO-11'].returnPickup,800);assert.equal(migrated.returnSchedules['FC-DEMO-01'],undefined);assert.equal(migrated.overrides[0].patientId,'FC-DEMO-11');assert.match(migrated.scheduleChanges[0].text,/Clara Whitmore/);
 const projected=D.project(state,1000);assert.equal(projected.patients[0].returnPickup,800);assert.equal(projected.alerts[0].patient,'Clara Whitmore');
 const legacyInvoice=B.create(D.PATIENTS,settings,'2026-10-28');
 const config={state,days:{},invoices:{'2026-10-28':legacyInvoice}};D.syncBilling(config,settings);
 const replacement=config.invoices['2026-10-28'];assert.equal(replacement.rows[0].patient,'Clara Whitmore');assert.equal(replacement.history[0].rows[0].patient,'Evelyn Hart');assert.equal(config.state.rosterVersion,2);
 D.syncBilling(config,settings);assert.equal(config.invoices['2026-10-28'],replacement);
});
test('return edits change timetable and notifications, preserve other patients, validate input, and survive restart',()=>{
 const original=D.initialState(1000),patient=D.patientsFor(original)[0];
 const updated=D.control(original,{action:'returnSchedule',patientId:patient.id,waitHours:3,vehicleWaiting:true},1000),day=D.project(updated,1000);
 assert.equal(day.patients[0].returnPickup,patient.appointmentAt+180);assert.equal(day.patients[0].waitMinutes,180);assert.equal(day.messages.filter(m=>m.title==='Return pickup rescheduled').length,1);assert.deepEqual(day.patients.slice(1).map(p=>p.returnPickup),D.patientsFor(original).slice(1).map(p=>p.returnPickup));assert.deepEqual(D.control(updated,{action:'restart'},1000).returnSchedules,updated.returnSchedules);
 for(const input of [{waitHours:4},{returnTime:'25:00'},{returnTime:'08:00'},{returnTime:'08:30',vehicleWaiting:'yes'},{waitHours:1,date:'2026-10-30'}])assert.throws(()=>D.control(original,{action:'returnSchedule',patientId:patient.id,vehicleWaiting:true,...input},1000));
});
test('billable appointment holding follows Nexus free minutes and blocks once per round trip',()=>{
 let state=D.initialState(1000);
 for(const hours of [1,2,3]){
  state=D.control(state,{action:'returnSchedule',patientId:'FC-DEMO-01',waitHours:hours,vehicleWaiting:true},1000);
  const invoice=B.create(D.patientsFor(state),settings),rows=invoice.rows.filter(r=>r.patientId==='FC-DEMO-01');
  assert.equal(rows[0].categories.waiting,0);assert.equal(rows[1].categories.waiting,Fare.getWaitingCharge(hours*60,settings.pricing.wheelchair,settings.fareRules,'wheelchair').waitCharge*100);assert.equal(rows[1].billableWaitMinutes,hours*60-15);
 }
 const withHold=B.create(D.patientsFor(state),settings);
 state=D.control(state,{action:'returnSchedule',patientId:'FC-DEMO-01',waitHours:3,vehicleWaiting:false},1000);
 const withoutHold=B.create(D.patientsFor(state),settings);assert.ok(withoutHold.total<withHold.total);assert.equal(withoutHold.rows[1].categories.waiting,0);assert.equal(withoutHold.rows[1].waitMinutes,0);
});
test('only the edited day revises; issued invoices and legacy invoice versions remain auditable',()=>{
 const config={state:{...D.initialState(1000),baseMinute:930}};D.syncBilling(config,settings);
 const issued=config.invoices[D.DATES[0]],other=config.invoices[D.DATES[1]];assert.equal(issued.status,'issued');
 config.state=D.control(config.state,{action:'returnSchedule',patientId:'FC-DEMO-01',waitHours:3,vehicleWaiting:true},1000);D.syncBilling(config,settings);
 const revised=config.invoices[D.DATES[0]];assert.equal(revised.revision,2);assert.equal(revised.history[0].total,issued.total);assert.equal(revised.history[0].delivery.id,issued.delivery.id);assert.notEqual(revised.delivery.id,issued.delivery.id);assert.ok(revised.total>issued.total);assert.equal(config.invoices[D.DATES[1]],other);
 D.syncBilling(config,settings);assert.equal(config.invoices[D.DATES[0]],revised);
 const legacy={state:D.initialState(1000),billing:{...issued,signature:undefined}};D.syncBilling(legacy,settings);assert.equal(legacy.billing,undefined);assert.equal(legacy.invoices[D.DATES[0]].history.length,1);
});
