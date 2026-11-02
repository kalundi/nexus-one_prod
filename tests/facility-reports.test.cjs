const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {createHandler}=require('../netlify/functions/_shared/facility-portal.cjs');
test('reports endpoint returns facility-scoped aggregates with board-consistent matching',async()=>{
 const db=new PGlite(),manager='11111111-1111-4111-8111-111111111111',dispatcher='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
   CREATE TABLE users(id uuid PRIMARY KEY); INSERT INTO users VALUES('${manager}'),('${dispatcher}');
   CREATE TABLE facilities(facility_code text PRIMARY KEY,name text,address text,active boolean);
   INSERT INTO facilities VALUES('FC-A','Care A','100 Facility Lane',true),('FC-B','Care B','200 Facility Lane',true);
   CREATE TABLE bookings(reference text PRIMARY KEY,facility_id text,booking_source text,name text,service text,pickup text,destination text,trip_date date,trip_time time,notes text,status text,payment_status text,driver_name text,vehicle_unit text,trip_type text,return_trip_date date,return_trip_time time,created_at timestamptz,updated_at timestamptz);`);
  await db.exec(fs.readFileSync('database/migrations/094.001_facility_portal.sql','utf8'));
  await db.exec(`INSERT INTO bookings(reference,facility_id,booking_source,name,service,pickup,destination,trip_date,trip_time,status,payment_status,created_at) VALUES
   ('T1','FC-A','CUSTOMER','Report Person One','Wheelchair','100 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-03-02','08:00','COMPLETED','PAID_IN_FULL','2026-02-20T15:00:00Z'),
   ('T2','FC-A','CUSTOMER','Report Person Two','Ambulatory','100 Facility Lane','900 Hospital Road, Bethesda, MD 20814','2026-03-02','09:30','REQUESTED','UNPAID','2026-03-01T15:00:00Z'),
   ('T3','FC-A','CUSTOMER','Report Person Three','Wheelchair','100 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-03-03','08:00','CANCELLED','UNPAID','2026-03-03T12:00:00Z'),
   ('T4','FC-A','CUSTOMER','Report Person Four','Stretcher','100 Facility Lane','40 Center Street, Silver Spring, MD 20910','2026-03-09','07:15','EN_ROUTE','UNPAID','2026-02-23T15:00:00Z'),
   ('T5','FC-A','CUSTOMER','Report Person Five','Wheelchair','100 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-02-27','09:00','COMPLETED','PAID_IN_FULL','2026-02-25T15:00:00Z'),
   ('T6','FC-B','CUSTOMER','Other Facility Person','Wheelchair','200 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-03-02','08:00','COMPLETED','PAID_IN_FULL','2026-02-20T15:00:00Z'),
   ('T7','FC-A','MOCK','Mock Person','Wheelchair','100 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-03-02','08:00','COMPLETED','PAID_IN_FULL','2026-02-20T15:00:00Z'),
   ('T8','FC-A','CUSTOMER','Outside Person','Wheelchair','100 Facility Lane','1200 Clinic Way, Rockville, MD 20850','2026-04-01','08:00','COMPLETED','PAID_IN_FULL','2026-02-20T15:00:00Z');
   UPDATE bookings SET return_trip_date='2026-03-05',return_trip_time='14:00',trip_type='ROUND_TRIP' WHERE reference='T5';`);
  const users={manager:{id:manager,role:'FACILITY',scope_id:'FC-A',display_name:'Manager A'},dispatch:{id:dispatcher,role:'DISPATCHER',display_name:'Nexus Dispatch'}};
  const handler=createHandler({query:(...args)=>db.query(...args),requireUser:async token=>{if(!users[token])throw Object.assign(Error('Authentication required'),{statusCode:401});return users[token];},bearer:e=>e.headers.authorization,json:(statusCode,body)=>({statusCode,body}),parseBody:e=>JSON.parse(e.body)});
  const call=async(params={},token='manager')=>{try{return await handler({headers:{authorization:token},queryStringParameters:params,body:'{}'},['facility-portal','reports'],'GET');}catch(error){return {statusCode:error.statusCode||500,body:{error:error.message}};}};
  // The range holds T1..T5 for FC-A: T5 matches by its return date alone,
  // T6 belongs to FC-B, T7 is a mock source and T8 is outside the range.
  const report=await call({from:'2026-03-01',to:'2026-03-31'});
  assert.equal(report.statusCode,200);
  assert.equal(report.body.from,'2026-03-01');assert.equal(report.body.to,'2026-03-31');
  assert.deepEqual(report.body.totals,{trips:5,completed:2,cancelled:1,pending:1,active:1,completionRate:40,cancellationRate:20});
  // Daily series is zero-filled across the whole range and sums to the total.
  assert.equal(report.body.daily.length,31);
  assert.equal(report.body.daily.reduce((sum,day)=>sum+day.count,0),5);
  const byDate=Object.fromEntries(report.body.daily.map(day=>[day.date,day.count]));
  assert.equal(byDate['2026-03-02'],2);assert.equal(byDate['2026-03-03'],1);
  assert.equal(byDate['2026-03-05'],1,'the return-only trip counts on its return date');
  assert.equal(byDate['2026-03-09'],1);assert.equal(byDate['2026-03-04'],0);
  assert.deepEqual(report.body.byStatus,[{status:'COMPLETED',count:2},{status:'CANCELLED',count:1},{status:'EN_ROUTE',count:1},{status:'REQUESTED',count:1}]);
  assert.deepEqual(report.body.byServiceType,[{service:'Wheelchair',count:3},{service:'Ambulatory',count:1},{service:'Stretcher',count:1}]);
  assert.deepEqual(report.body.byDayOfWeek,[{day:0,count:0},{day:1,count:3},{day:2,count:1},{day:3,count:0},{day:4,count:1},{day:5,count:0},{day:6,count:0}]);
  const hours=Object.fromEntries(report.body.byHourOfDay.map(hour=>[hour.hour,hour.count]));
  assert.equal(report.body.byHourOfDay.length,24);
  assert.equal(hours[7],1);assert.equal(hours[8],2);assert.equal(hours[9],1);
  assert.equal(hours[14],1,'the return-only trip counts at its return time');
  // Destinations are locality labels only: cities, never street addresses,
  // and never passenger names anywhere in the payload.
  assert.deepEqual(report.body.topDestinations,[{name:'Rockville',count:3},{name:'Bethesda',count:1},{name:'Silver Spring',count:1}]);
  const payload=JSON.stringify(report.body);
  assert.equal(payload.includes('Clinic Way'),false);assert.equal(payload.includes('Report Person'),false);
  assert.deepEqual(report.body.leadTimeDays,[{bucket:'0',count:1},{bucket:'1',count:1},{bucket:'2',count:1},{bucket:'3-7',count:0},{bucket:'8-14',count:2},{bucket:'15+',count:0}]);
  // An empty range reports zeros, not an error.
  const empty=await call({from:'2026-05-01',to:'2026-05-31'});
  assert.equal(empty.statusCode,200);assert.equal(empty.body.totals.trips,0);
  assert.equal(empty.body.daily.length,31);assert.ok(empty.body.daily.every(day=>day.count===0));
  // Scoping matches the trips endpoint: a manager cannot name another
  // facility, and staff must select one explicitly.
  assert.equal((await call({from:'2026-03-01',to:'2026-03-31',facility:'FC-B'})).statusCode,403);
  assert.equal((await call({from:'2026-03-01',to:'2026-03-31'},'dispatch')).statusCode,409);
  const staff=await call({from:'2026-03-01',to:'2026-03-31',facility:'FC-A'},'dispatch');
  assert.equal(staff.statusCode,200);assert.deepEqual(staff.body.totals,report.body.totals);
  // Range validation mirrors the trips endpoint.
  assert.equal((await call({from:'2026-03-31',to:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-02-30',to:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-03-01'})).statusCode,400);
  assert.equal((await call({from:'2026-01-01',to:'2027-12-31'})).statusCode,400);
 }finally{await db.close();}
});
