const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const Fare=require('../nexus-fare.js');
const migration=fs.readFileSync('database/migrations/085.001_weekend_holiday_premiums.sql','utf8');
async function database(settings){
 const db=new PGlite();
 await db.exec(`CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);
 CREATE TABLE system_settings(key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE TABLE audit_log(entity_type text,entity_id text,action text,changes jsonb);`);
 if(settings)await db.query("INSERT INTO system_settings(key,value) VALUES('platform',$1)",[settings]);
 return db;
}
test('migration sets global and all service premiums to 30%, preserves other values, and saves prior percentages',async()=>{
 const before={organization:{name:'Nexus'},pricing:{wheelchair:{base:98,includedMiles:8,perMile:4.1,waitPer15:12}},fareRules:{fuelSurchargePerMile:.24,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10,servicePolicies:{wheelchair:{afterHoursSurchargePct:25,weekendSurchargePct:15,holidaySurchargePct:10,speedReductionMph:10,freeWaitMinutes:15},stretcher:{afterHoursSurchargePct:20,weekendSurchargePct:20,holidaySurchargePct:5},custom_service:{weekendSurchargePct:0,holidaySurchargePct:0}}}};
 const db=await database(before);
 try{
  await db.exec(migration);
  const after=(await db.query("SELECT value FROM system_settings WHERE key='platform'")).rows[0].value;
  assert.equal(after.fareRules.weekendSurchargePct,30);assert.equal(after.fareRules.holidaySurchargePct,30);
  for(const policy of Object.values(after.fareRules.servicePolicies)){assert.equal(policy.weekendSurchargePct,30);assert.equal(policy.holidaySurchargePct,30);}
  const expected=structuredClone(before);expected.fareRules.weekendSurchargePct=30;expected.fareRules.holidaySurchargePct=30;
  for(const policy of Object.values(expected.fareRules.servicePolicies)){policy.weekendSurchargePct=30;policy.holidaySurchargePct=30;}
  assert.deepEqual(after,expected,'only the two requested percentages may change');
  const audit=(await db.query('SELECT changes FROM audit_log')).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].changes.before.servicePolicies.wheelchair.weekendSurchargePct,15);assert.equal(audit[0].changes.before.servicePolicies.wheelchair.holidaySurchargePct,10);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE version='085.001'")).rows[0].n,1);
  const inputs={miles:28,durationMinutes:48,trafficDurationMinutes:48,stopWaitMinutes:0,deadheadSegments:[9,18],discountPct:5};
  const booking={service:'wheelchair',date:'2026-10-17',time:'13:15',createdAt:'2026-10-10T12:00:00Z',tripType:'ONE_WAY'};
  const priorFare=Fare.calculateBooking(booking,inputs,before),newFare=Fare.calculateBooking(booking,inputs,after);
  assert.equal(priorFare.discountedTotal,232.18);
  assert.equal(Math.round(newFare.premiumAmount*100)/100,56.02);assert.equal(newFare.discountedTotal,259.58);assert.equal(newFare.premiumRateReason,'weekend');
  const holiday=Fare.calculateBooking({...booking,date:'2026-11-11'},inputs,after);
  assert.equal(holiday.premiumRateReason,'holiday');assert.equal(holiday.premiumRatePct,30);
  assert.equal(Math.round(holiday.premiumAmount*100)/100,56.02);
 }finally{await db.close();}
});
test('replaying the migration preserves later Pricing Manager edits and does not duplicate the audit',async()=>{
 const db=await database({fareRules:{servicePolicies:{wheelchair:{weekendSurchargePct:15}}}});
 try{
  await db.exec(migration);
  await db.query("UPDATE system_settings SET value=jsonb_set(value,'{fareRules,servicePolicies,wheelchair,weekendSurchargePct}','17'::jsonb) WHERE key='platform'");
  await db.exec(migration);
  const value=(await db.query("SELECT value FROM system_settings WHERE key='platform'")).rows[0].value;
  assert.equal(value.fareRules.servicePolicies.wheelchair.weekendSurchargePct,17);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n,1);
 }finally{await db.close();}
});
test('empty or partial saved settings migrate without affecting other settings rows',async()=>{
 for(const settings of [{},{fareRules:{fuelSurchargePerMile:.24}},null]){
  const db=await database(settings);
  try{
   await db.query("INSERT INTO system_settings(key,value) VALUES('unrelated',$1)",[{weekendSurchargePct:5}]);
   await db.exec(migration);
   assert.deepEqual((await db.query("SELECT value FROM system_settings WHERE key='unrelated'")).rows[0].value,{weekendSurchargePct:5});
   if(settings){const rules=(await db.query("SELECT value FROM system_settings WHERE key='platform'")).rows[0].value.fareRules;assert.equal(rules.weekendSurchargePct,30);assert.equal(rules.holidaySurchargePct,30);}
  }finally{await db.close();}
 }
});
