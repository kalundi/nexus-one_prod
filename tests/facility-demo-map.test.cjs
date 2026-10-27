const test=require('node:test'),assert=require('node:assert/strict'),MapView=require('../facility-demo-map.js');
function point(lat,lng){return {lat:()=>lat,lng:()=>lng};}
function scene(){return {date:'2026-10-26',mode:'all',selectedId:'P1',leg:'outbound',facility:{name:'FutureCare',address:'Facility'},patients:Array.from({length:5},(_,index)=>({id:`P${index+1}`,name:`Resident ${index+1}`,destination:{name:`Center ${index+1}`,address:`Clinic ${index+1}`},phase:'scheduled',progress:0,driver:`Driver ${index+1}`,unit:`Unit ${index+1}`}))};}
function fixture(routeFn){
 const lines=[],markers=[],mapsCreated=[],calls=[],statuses=[],selections=[];let active=true;
 class Overlay{constructor(options){this.options=options;this.map=options.map;this.listeners={};}setMap(map){this.map=map;}addListener(name,fn){this.listeners[name]=fn;}setPosition(position){this.options.position=position;}}
 const maps={Map:class{constructor(){this.fits=0;mapsCreated.push(this);}fitBounds(){this.fits++;}},Polyline:class extends Overlay{constructor(options){super(options);lines.push(this);}},Marker:class extends Overlay{constructor(options){super(options);markers.push(this);}},LatLngBounds:class{extend(){return this;}union(){return this;}},SymbolPath:{CIRCLE:'circle'},DirectionsService:class{route(options){calls.push(options);return routeFn?routeFn(options):Promise.resolve(road(options));}},event:{trigger(){},clearInstanceListeners(item){item.listeners={};}}};
 const view=MapView.create({loadMaps:async()=>maps,element:{},onSelect:id=>selections.push(id),onStatus:status=>statuses.push(status),isActive:()=>active});
 return {view,lines,markers,calls,statuses,selections,mapsCreated,deactivate(){active=false;},visibleLines:()=>lines.filter(line=>line.map),visibleMarkers:()=>markers.filter(marker=>marker.map)};
}
function road({origin,destination}){const n=Number((origin+destination).match(/\d/)?.[0]||1);return {routes:[{overview_path:[point(39,-76.5),point(39+n/100,-76.4)],copyrights:'Map provider attribution',warnings:[]}]};}
test('overview draws ten dotted road routes with patient-selectable destinations and reuses address routes across days',async()=>{
 const f=fixture(),data=scene();await f.view.show(data);assert.equal(f.calls.length,10);assert.equal(f.visibleLines().length,10);assert.equal(f.visibleMarkers().length,6);
 for(const line of f.visibleLines()){assert.equal(line.options.strokeOpacity,0);assert.equal(line.options.icons[0].repeat,'14px');}
 f.visibleLines()[0].listeners.click();assert.deepEqual(f.selections,['P1']);assert.equal(f.statuses.at(-1).available,10);assert.match(f.statuses.at(-1).attribution,/provider/);
 await f.view.show({...data,date:'2026-10-27'});assert.equal(f.calls.length,10);assert.equal(f.visibleLines().length,10);
});
test('selecting a patient removes every other route and marker and polling preserves the viewport',async()=>{
 const f=fixture(),data=scene();await f.view.show(data);data.mode='selected';data.selectedId='P2';data.patients[1].phase='outbound';data.patients[1].progress=.5;await f.view.show(data);
 assert.equal(f.visibleLines().length,1);assert.equal(f.visibleLines()[0].options.strokeOpacity,.95);assert.deepEqual(f.visibleMarkers().map(m=>m.options.label).sort(),['A','B','D']);assert.match(f.visibleMarkers().find(m=>m.options.label==='D').options.title,/Resident 2/);
 const fits=f.mapsCreated[0].fits;data.patients[1].progress=.7;await f.view.show(data);assert.equal(f.mapsCreated[0].fits,fits);assert.equal(f.calls.length,10);f.view.resize();assert.equal(f.mapsCreated[0].fits,fits+1);
 data.leg='return';await f.view.show(data);assert.equal(f.visibleLines().length,1);assert.deepEqual(f.visibleMarkers().map(m=>m.options.label).sort(),['A','B']);
});
test('overview shows drivers on their current outbound or return leg',async()=>{
 const f=fixture(),data=scene();data.patients[0].phase='outbound';data.patients[0].progress=.4;data.patients[2].phase='return';data.patients[2].progress=.7;await f.view.show(data);
 assert.deepEqual(f.visibleMarkers().filter(marker=>marker.options.label.startsWith('D')).map(marker=>marker.options.label).sort(),['D1','D3']);
 assert.match(f.visibleMarkers().find(marker=>marker.options.label==='D3').options.title,/Resident 3/);
});
test('a late overview response cannot overwrite a newer patient selection',async()=>{
 const pending=[],f=fixture(options=>new Promise(resolve=>pending.push({options,resolve}))),data=scene();
 const overview=f.view.show(data);assert.equal(f.view.show(data),overview);await new Promise(setImmediate);assert.equal(pending.length,2);
 const selected=f.view.show({...data,mode:'selected',selectedId:'P5'});await new Promise(setImmediate);assert.equal(pending.length,3);
 pending[2].resolve(road(pending[2].options));await selected;assert.equal(f.visibleLines().length,1);assert.match(f.statuses.at(-1).message,/Resident 5/);
 pending[0].resolve(road(pending[0].options));pending[1].resolve(road(pending[1].options));await overview;assert.equal(f.visibleLines().length,1);assert.match(f.statuses.at(-1).message,/Resident 5/);assert.equal(f.calls.length,3);
});
test('partial routing failures preserve available routes and explicit retry only fetches missing directions',async()=>{
 let failed=false;const f=fixture(options=>{if(options.destination==='Clinic 2'&&!failed){failed=true;return Promise.reject(Error('Unavailable'));}return Promise.resolve(road(options));});
 await f.view.show(scene());assert.equal(f.visibleLines().length,9);assert.equal(f.statuses.at(-1).available,9);assert.match(f.statuses.at(-1).message,/Resident 2 outbound/);
 f.view.retry();await f.view.show(scene());assert.equal(f.visibleLines().length,10);assert.equal(f.calls.length,11);
});
test('logout cancels pending drawing and clears every overlay',async()=>{
 const f=fixture();await f.view.show(scene());f.deactivate();f.view.clear();assert.equal(f.visibleLines().length,0);assert.equal(f.visibleMarkers().length,0);
 let resolve;const pending=fixture(options=>new Promise(done=>{resolve=()=>done(road(options));}));const task=pending.view.show({...scene(),mode:'selected'});await new Promise(setImmediate);pending.deactivate();pending.view.clear();resolve();await task;assert.equal(pending.visibleLines().length,0);
});
test('driver interpolation clamps to route endpoints',()=>{
 const points=[point(39,-76),point(40,-75)];assert.deepEqual(MapView.pathPoint(points,-1),{lat:39,lng:-76});assert.deepEqual(MapView.pathPoint(points,2),{lat:40,lng:-75});assert.equal(MapView.pathPoint([],0),null);
});
test('one-way custom pickups route through ordered stops and completed trips stay on the outbound map',async()=>{
 const f=fixture(),data=scene();data.mode='selected';data.leg='outbound';Object.assign(data.patients[0],{tripType:'ONE_WAY',phase:'complete',origin:{name:'Custom pickup',address:'Custom origin'},stops:[{name:'Lab',address:'Lab stop'},{name:'Pharmacy',address:'Pharmacy stop'}]});
 await f.view.show(data);assert.equal(f.calls.length,1);assert.equal(f.calls[0].origin,'Custom origin');assert.deepEqual(f.calls[0].waypoints.map(stop=>stop.location),['Lab stop','Pharmacy stop']);assert.equal(f.calls[0].optimizeWaypoints,false);assert.equal(MapView.legFor(data.patients[0]),'outbound');assert.equal(f.visibleLines().length,1);
 data.patients[0].stops.reverse();await f.view.show(data);assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].waypoints.map(stop=>stop.location),['Pharmacy stop','Lab stop']);
 data.mode='all';await f.view.show(data);assert.equal(f.visibleLines().length,9);assert.ok(f.visibleMarkers().some(marker=>marker.options.label==='A1'));
});
test('the overview and selected map support more than five patients with valid repeated route colors',async()=>{
 const f=fixture(),data=scene();data.patients=Array.from({length:17},(_,index)=>({...data.patients[index%5],id:'MANY-'+index,name:'Demo Resident '+index,destination:{name:'Clinic '+index,address:'Clinic address '+index}}));
 await f.view.show(data);assert.equal(f.visibleLines().length,34);assert.ok(f.visibleLines().every(line=>MapView.COLORS.includes(line.options.strokeColor)));assert.match(f.statuses.at(-1).message,/34 of 34/);assert.doesNotMatch(f.statuses.at(-1).message,/1–5/);
 await f.view.show({...data,mode:'selected',selectedId:'MANY-16'});assert.equal(f.visibleLines().length,1);assert.deepEqual(f.visibleMarkers().map(marker=>marker.options.label).sort(),['A','B']);
});
