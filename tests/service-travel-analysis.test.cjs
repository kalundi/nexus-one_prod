const {test}=require('node:test');
const assert=require('node:assert/strict');
const {drivingWindows,summarize,readAnalysis}=require('../netlify/functions/_shared/service-travel-analysis.cjs');
const end=Date.parse('2026-10-10T20:00:00Z'),start=end-90*86400000;
const settings={pricing:{ambulatory:{label:'Ambulatory'},wheelchair:{label:'Wheelchair'},stretcher:{label:'Stretcher'}},fareRules:{}};
const event=(status,time)=>({status,at:`2026-10-10T${time}:00Z`});
const booking=(reference,extra={})=>({reference,service:'wheelchair',status:'COMPLETED',booking_source:'REAL',vehicle_unit:'WC-1',history:[event('ARRIVED_PICKUP','12:00'),event('DEPARTED','12:10'),event('ARRIVED_DESTINATION','12:40'),event('DELIVERED','12:45')],...extra});
const validTrack=window=>({id:window.id,points:91,first_at:window.start_at,last_at:window.end_at,max_gap_seconds:20,bad_segments:0,miles:20});

test('loaded windows exclude mocks and deadhead while separating boarding and handoff',()=>{
 const histories=[booking('REAL-1',{history:[event('EN_ROUTE','11:00'),event('ARRIVED_PICKUP','12:00'),event('ARRIVED_PICKUP','12:05'),event('DEPARTED','12:10'),event('DEPARTED','12:15'),event('ARRIVED_DESTINATION','12:40'),event('DELIVERED','12:45')]}),booking('MOCK-1'),booking('REAL-2',{booking_source:'MOCK'}),booking('REAL-3',{status:'CANCELLED'}),booking('REAL-4',{history:[event('ARRIVED_DESTINATION','12:40')]})];
 const windows=drivingWindows(histories,start,end);
 assert.equal(windows.length,1);assert.equal(windows[0].drivingMinutes,30);assert.equal(windows[0].boardingMinutes,10);assert.equal(windows[0].handoffMinutes,5);
});

test('a round trip contributes two driving legs and one trip without appointment waiting',()=>{
 const windows=drivingWindows([booking('REAL-1',{history:[event('ARRIVED_PICKUP','12:00'),event('DEPARTED','12:10'),event('ARRIVED_DESTINATION','12:40'),event('DELIVERED','12:45'),event('ARRIVED_PICKUP','16:00'),event('DEPARTED','16:20'),event('ARRIVED_DESTINATION','16:50'),event('DELIVERED','17:05')]})],start,end);
 const result=summarize(windows,windows.map(validTrack),settings,{start,end,days:90});
 const wheelchair=result.services.find(row=>row.service==='wheelchair');
 assert.equal(wheelchair.tripCount,1);assert.equal(wheelchair.legCount,2);assert.equal(wheelchair.observedAverageMph,40);
 assert.equal(wheelchair.boardingMedianMinutes,15);assert.equal(wheelchair.handoffMedianMinutes,10);assert.equal(wheelchair.evidenceStatus,'LIMITED_SAMPLE');
 assert.equal(wheelchair.speedReductionMph,10);
});

test('GPS gaps, missing endpoints, impossible motion and incomplete coverage cannot become an average',()=>{
 const windows=drivingWindows(Array.from({length:7},(_,index)=>booking(`REAL-${index}`)),start,end);
 const tracks=windows.map(validTrack);
 tracks[0].points=2;tracks[1].max_gap_seconds=181;tracks[2].bad_segments=1;tracks[3].first_at='2026-10-10T12:15:00Z';tracks[4].last_at='2026-10-10T12:35:00Z';tracks[5].miles=50;tracks[6].miles=0;
 const result=summarize(windows,tracks,settings,{start,end,days:90});
 assert.equal(result.verifiedLegs,0);assert.equal(result.excludedLegs,7);
 for(const row of result.services){assert.equal(row.observedAverageMph,null);assert.equal(row.boardingMedianMinutes,null);assert.equal(row.evidenceStatus,'NO_DATA');}
});

test('the average weights distance and elapsed driving instead of averaging GPS speeds',()=>{
 const windows=drivingWindows([booking('REAL-1'),booking('REAL-2',{history:[event('DEPARTED','13:00'),event('ARRIVED_DESTINATION','14:00')]})],start,end);
 const tracks=windows.map(validTrack);tracks[1].miles=10;
 const row=summarize(windows,tracks,settings,{start,end,days:90}).services.find(row=>row.service==='wheelchair');
 assert.equal(row.observedAverageMph,20);assert.equal(row.boardingSamples,1);assert.equal(row.handoffSamples,1);
});

test('thirty separate completed trips permit review but do not alter configured service speeds',()=>{
 const windows=drivingWindows(Array.from({length:30},(_,index)=>booking(`REAL-${index}`)),start,end);
 const custom={...settings,fareRules:{servicePolicies:{wheelchair:{speedReductionMph:7}}}};
 const row=summarize(windows,windows.map(validTrack),custom,{start,end,days:90}).services.find(row=>row.service==='wheelchair');
 assert.equal(row.tripCount,30);assert.equal(row.evidenceStatus,'REVIEW_READY');assert.equal(row.speedReductionMph,7);
 assert.equal(custom.fareRules.servicePolicies.wheelchair.speedReductionMph,7);
});

test('the report uses a bounded, parameterized window and skips GPS work when no driving stages exist',async()=>{
 const calls=[];
 const report=await readAnalysis(async(sql,params)=>{calls.push({sql,params});return {rows:[]};},settings,{days:'invalid',now:end});
 assert.equal(calls.length,1);assert.deepEqual(calls[0].params,[new Date(start).toISOString(),new Date(end).toISOString()]);
 assert.equal(report.days,90);assert.equal(report.verifiedLegs,0);assert.equal(report.services[1].observedAverageMph,null);
 assert.ok(!JSON.stringify(report).includes('reference'));
});

test('the reporting endpoint authenticates admin and dispatch before reading measurements',async()=>{
 const source=require('node:fs').readFileSync('netlify/functions/api.cjs','utf8');
 const body=source.slice(source.indexOf("  if(p[0]==='admin'&&p[1]==='service-travel-analysis'"),source.indexOf("  if(p[0]==='admin'&&p[1]==='settings'&&method==='GET')"));
 const run=new Function('p','method','event','requireUser','bearer','readPlatformSettings','ServiceTravelAnalysis','query','json',`return (async()=>{${body}})()`);
 let reads=0;
 const dependencies=[['admin','service-travel-analysis'],'GET',{queryStringParameters:{days:'30'}},async(token,roles)=>{assert.deepEqual(roles,['ADMIN','DISPATCHER']);if(token==='patient')throw Error('Insufficient permission');},event=>event.token||'patient',async()=>settings,{readAnalysis:async()=>{reads++;return {services:[]};}},()=>{},(status,body)=>({status,body})];
 await assert.rejects(run(...dependencies),/Insufficient permission/);assert.equal(reads,0);
 dependencies[2].token='admin';const result=await run(...dependencies);assert.equal(result.status,200);assert.equal(reads,1);
});

test('the full PostgreSQL report measures both loaded directions from GPS and excludes mock records',async()=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 try{
  await db.exec(`
   CREATE TABLE bookings(reference text,service text,status text,booking_source text,vehicle_unit text,trip_date date,notes text);
   CREATE TABLE trip_status_history(booking_reference text,status text,created_at timestamptz);
   CREATE TABLE gps_positions(id serial,booking_reference text,vehicle_unit text,recorded_at timestamptz,latitude double precision,longitude double precision,accuracy_m double precision);
   INSERT INTO bookings VALUES ('REAL-1','wheelchair','COMPLETED','REAL','WC-1','2026-10-10',''),('MOCK-1','wheelchair','COMPLETED','MOCK','WC-1','2026-10-10','MOCK TRIP');
  `);
  const history=[event('ARRIVED_PICKUP','12:00'),event('DEPARTED','12:10'),event('ARRIVED_DESTINATION','12:40'),event('DELIVERED','12:45'),event('ARRIVED_PICKUP','16:00'),event('DEPARTED','16:20'),event('ARRIVED_DESTINATION','16:50'),event('DELIVERED','17:05')];
  for(const record of history){
   for(const reference of ['REAL-1','MOCK-1'])await db.query('INSERT INTO trip_status_history VALUES($1,$2,$3)',[reference,record.status,record.at]);
  }
  const latitude=38,milesPerDegree=3958.7613*Math.PI/180*Math.cos(latitude*Math.PI/180),step=(20/15)/milesPerDegree;
  for(const [direction,departure] of [[1,'12:10'],[-1,'16:20']]){
   for(let point=0;point<=15;point++){
    const at=new Date(Date.parse(event('DEPARTED',departure).at)+point*120000).toISOString();
    await db.query('INSERT INTO gps_positions(booking_reference,vehicle_unit,recorded_at,latitude,longitude,accuracy_m) VALUES($1,$2,$3,$4,$5,$6)',['REAL-1','WC-1',at,latitude,-77+(direction===1?point:15-point)*step,10]);
    if(point===7){
     // Unrelated bookings and inaccurate fixes cannot distort distance.
     await db.query('INSERT INTO gps_positions(booking_reference,vehicle_unit,recorded_at,latitude,longitude,accuracy_m) VALUES($1,$2,$3,$4,$5,$6)',['MOCK-1','WC-1',at,latitude,-70,10]);
     await db.query('INSERT INTO gps_positions(booking_reference,vehicle_unit,recorded_at,latitude,longitude,accuracy_m) VALUES($1,$2,$3,$4,$5,$6)',['REAL-1','WC-1',at,latitude,-70,100]);
    }
   }
  }
  const report=await readAnalysis((sql,params)=>db.query(sql,params),settings,{days:90,now:end});
  assert.equal(report.candidateTrips,1);assert.equal(report.verifiedLegs,2);assert.equal(report.excludedLegs,0);
  const row=report.services.find(service=>service.service==='wheelchair');
  assert.equal(row.observedAverageMph,40);assert.equal(row.tripCount,1);assert.equal(row.legCount,2);
  assert.equal(row.boardingMedianMinutes,15);assert.equal(row.handoffMedianMinutes,10);
  assert.equal(row.speedReductionMph,10);assert.ok(!JSON.stringify(report).includes('REAL-1'));
 }finally{await db.close();}
});
