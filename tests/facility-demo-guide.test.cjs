const {test}=require('node:test'),assert=require('node:assert/strict');
const Guide=require('../facility-demo-guide.js'),Demo=require('../netlify/functions/_shared/facility-demo.cjs');
test('presentation guide follows actual trip phases, including an edited late return',()=>{
 let state=Demo.initialState();const first=Demo.project(state).patients[0];
 state=Demo.control(state,{action:'returnSchedule',patientId:first.id,returnTime:'19:00',vehicleWaiting:false});
 for(const [minute,phase,step,workspace]of [[first.pickup-20,'scheduled',0,'boardSection'],[first.pickup-10,'approach',1,'routePanel'],[first.pickup+1,'outbound',2,'routePanel'],[700,'appointment',3,'inboxSection'],[1130,'return-approach',4,'routePanel'],[1141,'return',5,'routePanel'],[1200,'complete',6,'boardSection']]){
  const snapshot=Demo.project({...state,baseMinute:minute,paused:true}),patient=snapshot.patients[0];
  assert.equal(patient.phase,phase);const cue=Guide.cueFor(snapshot,patient);assert.equal(cue.step,step);assert.equal(cue.workspace,workspace);
 }
});
test('guide surfaces selected patient alerts and supports empty manifests',()=>{
 const patient={id:'one',name:'Fictional Patient',phase:'outbound'};
 const cue=Guide.cueFor({patients:[patient],alerts:[{id:'delay',patientId:'one',title:'Delay reported',acknowledged:false}]},patient);
 assert.equal(cue.workspace,'inboxSection');assert.match(cue.title,/Delay reported/);assert.equal(cue.step,2);
 assert.equal(Guide.cueFor({patients:[]}).workspace,'boardSection');
});
