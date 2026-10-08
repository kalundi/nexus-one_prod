const assert=require('node:assert/strict');
const test=require('node:test');
const {lookupFlight}=require('../netlify/functions/_shared/flightaware.cjs');

const providerFlight={
 ident:'UAL123',
 ident_iata:'UA123',
 status:'Scheduled',
 origin:{airport_name:'Washington Dulles International Airport',code_iata:'IAD'},
 destination:{airport_name:"Chicago O'Hare International Airport",code_iata:'ORD'},
 terminal_origin:'C',
 gate_origin:'C12',
 terminal_destination:'1',
 gate_destination:'B7',
 scheduled_out:'2026-10-07T13:00:00Z',
 scheduled_in:'2026-10-07T15:00:00Z'
};

function mockFetch(payload){
 return async(url,options)=>{
  assert.equal(url.hostname,'aeroapi.flightaware.com');
  assert.equal(options.headers['x-apikey'],'test-key');
  return {ok:true,json:async()=>payload};
 };
}

test('airport pickup uses the flight arrival terminal',async()=>{
 const result=await lookupFlight({flightNumber:'UA 123',date:'2026-10-07',airportStop:'PICKUP',apiKey:'test-key',fetchImpl:mockFetch({flights:[providerFlight]})});
 assert.equal(result.flightNumber,'UA123');
 assert.equal(result.movement,'ARRIVAL');
 assert.equal(result.airport.code,'ORD');
 assert.equal(result.terminal,'1');
 assert.equal(result.gate,'B7');
});

test('airport destination uses the flight departure terminal',async()=>{
 const result=await lookupFlight({flightNumber:'UA123',date:'2026-10-07',airportStop:'DESTINATION',apiKey:'test-key',fetchImpl:mockFetch({flights:[providerFlight]})});
 assert.equal(result.movement,'DEPARTURE');
 assert.equal(result.airport.code,'IAD');
 assert.equal(result.terminal,'C');
 assert.equal(result.gate,'C12');
});

test('lookup requires a configured API key',async()=>{
 await assert.rejects(lookupFlight({flightNumber:'UA123',date:'2026-10-07',airportStop:'PICKUP',apiKey:''}),{statusCode:503});
});

test('lookup does not mistake a prior day flight for the requested date',async()=>{
 const priorDay={...providerFlight,scheduled_in:'2026-10-06T15:00:00Z'};
 const result=await lookupFlight({flightNumber:'UA123',date:'2026-10-07',airportStop:'PICKUP',apiKey:'test-key',fetchImpl:mockFetch({flights:[priorDay]})});
 assert.equal(result,null);
});

test('lookup uses the selected airport local date across UTC midnight',async()=>{
 const localArrival={...providerFlight,destination:{...providerFlight.destination,timezone:'America/Chicago'},scheduled_in:'2026-10-08T00:30:00Z'};
 const result=await lookupFlight({flightNumber:'UA123',date:'2026-10-07',airportStop:'PICKUP',apiKey:'test-key',fetchImpl:mockFetch({flights:[localArrival]})});
 assert.equal(result.airport.code,'ORD');
 assert.equal(result.terminal,'1');
});

test('airport flight migration is idempotent without Supabase roles',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {readFile}=require('node:fs/promises');
 const database=new PGlite();
 try{
  await database.exec('CREATE TABLE bookings(reference text PRIMARY KEY); CREATE TABLE schema_migrations(version varchar(64) PRIMARY KEY,description text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());');
  const migration=await readFile(new URL('../database/migrations/082.001_airport_flight_lookup.sql',`file://${__dirname.replaceAll('\\','/')}/`),'utf8');
  await database.exec(migration);
  await database.exec(migration);
  const applied=await database.query("SELECT version FROM schema_migrations WHERE version='082.001'");
  assert.equal(applied.rows.length,1);
  const roles=await database.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
  assert.equal(roles.rows.length,0);
 }finally{
  await database.close();
 }
});
