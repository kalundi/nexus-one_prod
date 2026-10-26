const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('driver-app.js','utf8');
const helpers=source.slice(source.indexOf('  function normalizeBookingStatus('),source.indexOf('  function isTerminalStatus('));
function section(name,end){const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0);const finish=source.indexOf(end,start);assert.ok(finish>start);return source.slice(start,finish);}
function context(extra={}){const ctx=vm.createContext(extra);vm.runInContext(helpers,ctx);return ctx;}

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
