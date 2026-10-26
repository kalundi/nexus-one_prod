const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('driver-app.js','utf8');
const helpers=source.slice(source.indexOf('  function normalizeBookingStatus('),source.indexOf('  function isTerminalStatus('));
function section(name,end){const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0);const finish=source.indexOf(end,start);assert.ok(finish>start);return source.slice(start,finish);}
function context(extra={}){const ctx=vm.createContext({scheduledAvailability:null,shift:{onDuty:false,mockPractice:false},...extra});vm.runInContext(helpers,ctx);return ctx;}

test('mock identity remains review only even after a status changes',()=>{
 const ctx=context();
 for(const trip of [{bookingSource:'MOCK',status:'ASSIGNED'},{booking_source:'mock',status:'EN_ROUTE'},{ref:'MOCK-test',status:'SCHEDULED'},{status:'MOCK'}]){
  assert.equal(ctx.isMockTrip(trip),true);assert.equal(ctx.tripNeedsAcceptance(trip),false);
 }
 assert.equal(ctx.isMockTrip({ref:'NMT-real',bookingSource:'CUSTOMER',status:'ASSIGNED'}),false);
 assert.equal(ctx.tripNeedsAcceptance({ref:'NMT-real',status:'ASSIGNED'}),true);
});

test('opening a mock assignment never replaces a live dashboard or automatic route',()=>{
 const mock={ref:'MOCK-review',status:'EN_ROUTE',bookingSource:'MOCK'},live={ref:'NMT-live',status:'EN_ROUTE'};
 const ctx=context({trips:[mock,live],activeRef:mock.ref});
 vm.runInContext(section('activeTripForRoute','\n  function resetRouteAuto('),ctx);
 assert.equal(ctx.activeTripForRoute().ref,live.ref);
 ctx.trips=[mock];assert.equal(ctx.activeTripForRoute(),undefined);
});

test('manifest shows old assigned mocks separately without offering acceptance or exposing old live trips',()=>{
 const list={innerHTML:''},today=new Date().toISOString().slice(0,10);
 const ctx=context({trips:[{ref:'MOCK-old',bookingSource:'MOCK',status:'ASSIGNED',date:'2000-01-01',time:'09:00',patient:'Mock patient',pickup:'Mock A',destination:'Mock B'},{ref:'NMT-today',status:'ASSIGNED',date:today,time:'12:00',patient:'Live patient',pickup:'Live A',destination:'Live B'},{ref:'NMT-old',status:'ASSIGNED',date:'2000-01-01',time:'09:00'}],activeRef:null,manifestDays:1,$:selector=>selector==='#manifestList'?list:null,$$:()=>[],fmtDate:value=>value});
 vm.runInContext(section('renderManifest',"\n  $$('#manifestTabs"),ctx);ctx.renderManifest();
 assert.match(list.innerHTML,/Mock assignments • review only/);
 assert.match(list.innerHTML,/data-ref="MOCK-old"/);assert.doesNotMatch(list.innerHTML,/data-accept-ref="MOCK-old"/);
 assert.match(list.innerHTML,/data-accept-ref="NMT-today"/);assert.doesNotMatch(list.innerHTML,/NMT-old/);
});

test('mock details suppress workflow actions and normal trip controls return afterward',()=>{
 const nodes=new Map(['#btnAdvanceTrip','#btnMarkNoShow','#tripWorkflow','#tripStartNotice','#tripStepHints','#tripAiHelp'].map(id=>[id,{hidden:false,textContent:'',innerHTML:''}]));
 const ctx=context({$:selector=>nodes.get(selector),WORKFLOW:[{label:'En route',status:'EN_ROUTE'}],WF_STATUS:['EN_ROUTE'],wfIdx:()=>-1,nextWorkflowStep:()=>({status:'EN_ROUTE',label:'En route'}),tripStartPolicy:()=>({allowed:true}),inspectionPolicyForTripStart:()=>({allowed:true}),shift:{onDuty:true},scheduledAvailability:{available:true},stepHintsOpen:false,aiHelpOpen:false});
 vm.runInContext(section('renderTripWorkflow','\n  async function markTripNoShow('),ctx);
 ctx.renderTripWorkflow({bookingSource:'MOCK',status:'ASSIGNED'});
 assert.equal(nodes.get('#btnAdvanceTrip').hidden,true);assert.equal(nodes.get('#btnMarkNoShow').hidden,true);
 assert.match(nodes.get('#tripStartNotice').textContent,/Mock assignment • review only/);
 ctx.renderTripWorkflow({bookingSource:'CUSTOMER',status:'ASSIGNED'});
 assert.equal(nodes.get('#btnAdvanceTrip').hidden,false);assert.equal(nodes.get('#btnAdvanceTrip').disabled,false);
 assert.equal(nodes.get('#btnMarkNoShow').hidden,false);assert.equal(nodes.get('#tripStartNotice').hidden,true);
});

test('mock acceptance and automatic progression return before issuing requests',async()=>{
 let requests=0;const mock={ref:'MOCK-1',bookingSource:'MOCK',status:'ASSIGNED'};
 const ctx=context({trips:[mock],routeAuto:{updating:false},fetch:async()=>{requests++;throw Error('Unexpected live request');}});
 const acceptStart=source.indexOf('  async function acceptTrip('),acceptEnd=source.indexOf('\n  function updateBadge(',acceptStart);
 const autoStart=source.indexOf('  async function updateTripStatusAuto('),autoEnd=source.indexOf('\n  async function maybeAdvanceRouteByPosition(',autoStart);
 vm.runInContext(source.slice(acceptStart,acceptEnd)+source.slice(autoStart,autoEnd),ctx);
 await ctx.acceptTrip(mock.ref);assert.equal(await ctx.updateTripStatusAuto(mock,'EN_ROUTE'),false);assert.equal(requests,0);
});

test('eligible administrator can enter testing duty without a schedule, inspection or live GPS',()=>{
 let gpsStops=0,saved=0;
 const ctx=context({scheduledAvailability:{available:false,mockPracticeAvailable:true},shift:{onDuty:false,inspectionDone:false},routeAuto:{enabled:true},stopGPS:()=>gpsStops++,saveShift:()=>saved++,renderDash(){},dashNotice(){},Date});
 vm.runInContext(section('beginShift',"\n  $('#btnBreak')"),ctx);ctx.beginShift();
 assert.equal(ctx.shift.onDuty,true);assert.equal(ctx.shift.mockPractice,true);assert.equal(ctx.shift.vehicleUnit,'MOCK-N5289');
 assert.equal(ctx.shift.inspectionDone,false);assert.equal(ctx.routeAuto.enabled,false);assert.equal(gpsStops,1);assert.equal(saved,1);
});

test('testing duty never starts a browser position watch',()=>{
 let watched=0;
 const ctx=context({shift:{onDuty:true,mockPractice:true},navigator:{geolocation:{watchPosition(){watched++;}}},gpsId:null});
 vm.runInContext(section('startGPS','\n  function stopGPS('),ctx);ctx.startGPS();assert.equal(watched,0);
});

test('eligible mock workflow enables practice controls while preserving live shift restrictions',()=>{
 const ids=['#btnAdvanceTrip','#btnMarkNoShow','#btnResetMockTrip','#tripWorkflow','#tripStartNotice','#tripStepHints','#tripAiHelp'];
 const nodes=new Map(ids.map(id=>[id,{hidden:false,textContent:'',innerHTML:''}]));
 const ctx=context({scheduledAvailability:{available:false,mockPracticeAvailable:true},shift:{onDuty:true,mockPractice:true},$:selector=>nodes.get(selector),WORKFLOW:[{label:'En route to pickup',status:'EN_ROUTE'}],WF_STATUS:['EN_ROUTE'],wfIdx:()=>-1,nextWorkflowStep:()=>({status:'EN_ROUTE',label:'En route'}),tripStartPolicy:()=>({allowed:true}),inspectionPolicyForTripStart:()=>({allowed:true}),stepHintsOpen:false,aiHelpOpen:false});
 vm.runInContext(section('renderTripWorkflow','\n  async function updateMockWorkflow('),ctx);
 ctx.renderTripWorkflow({bookingSource:'MOCK',status:'MOCK'});
 assert.equal(nodes.get('#btnAdvanceTrip').hidden,false);assert.equal(nodes.get('#btnAdvanceTrip').disabled,false);assert.match(nodes.get('#btnAdvanceTrip').textContent,/ACCEPT MOCK/);
 assert.equal(nodes.get('#btnMarkNoShow').hidden,true);assert.equal(nodes.get('#btnResetMockTrip').hidden,false);
 ctx.renderTripWorkflow({bookingSource:'CUSTOMER',status:'ASSIGNED'});assert.equal(nodes.get('#btnAdvanceTrip').disabled,true);
 ctx.shift.onDuty=false;ctx.renderTripWorkflow({bookingSource:'MOCK',status:'MOCK'});assert.equal(nodes.get('#btnAdvanceTrip').disabled,true);
});

test('manual practice saves every step and reset only through the isolated mock API',async()=>{
 const calls=[],trip={ref:'MOCK-1',bookingSource:'MOCK',status:'MOCK'},notices=[];
 const ctx=context({scheduledAvailability:{available:false,mockPracticeAvailable:true},shift:{onDuty:true,mockPractice:true},$:()=>null,ah:()=>({}),renderTripDetailPanel(){},renderManifest(){},renderDash(){},dashNotice:message=>notices.push(message),fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return {ok:true,json:async()=>({mockOnly:true,workflow:{status:body.status==='RESET'?'MOCK':body.status,updatedAt:'now'}})};}});
 const workflowStart=source.indexOf('  const WORKFLOW='),workflowEnd=source.indexOf('  let stepHintsOpen',workflowStart);
 const updateStart=source.indexOf('  async function updateMockWorkflow('),updateEnd=source.indexOf("\n  $('#btnResetMockTrip')",updateStart);
 vm.runInContext(source.slice(workflowStart,workflowEnd)+source.slice(updateStart,updateEnd),ctx);
 const expected=['ACCEPTED','EN_ROUTE','ARRIVED_PICKUP','PATIENT_READY','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','COMPLETED'];
 for(const status of expected){assert.equal(ctx.nextMockWorkflowStep(trip).status,status);await ctx.updateMockWorkflow(trip,status);assert.equal(trip.status,'MOCK');assert.equal(trip.bookingSource,'MOCK');}
 assert.equal(ctx.nextMockWorkflowStep(trip),null);await ctx.updateMockWorkflow(trip,'RESET');assert.equal(trip.mockWorkflow.status,'MOCK');
 assert.equal(calls.length,10);assert.ok(calls.every(call=>call.url==='/api/driver/mock-trips/MOCK-1/workflow'));
 assert.deepEqual(calls.map(call=>call.body.expectedStatus),['MOCK',...expected]);assert.match(notices.at(-1),/reset/);
 ctx.scheduledAvailability.mockPracticeAvailable=false;await ctx.updateMockWorkflow(trip,'ACCEPTED');assert.equal(calls.length,10);
});
