const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {assertHttps,clientAssertion,appointmentSearchUrl,testConnection}=require('../netlify/functions/_shared/keymark-fhir-client.cjs');

test('FHIR connector rejects non-HTTPS remote endpoints',()=>{
 assert.throws(()=>assertHttps('http://ehr.example.com/fhir','FHIR base URL'),/must use HTTPS/);
 assert.doesNotThrow(()=>assertHttps('https://ehr.example.com/fhir','FHIR base URL'));
});

test('FHIR Appointment polling creates a bounded R4 search URL',()=>{
 const url=new URL(appointmentSearchUrl({base_url:'https://ehr.example.com/fhir/r4',configuration:{locationId:'LOC-4',statuses:'booked,pending',pageSize:500}},{from:'2026-08-13T00:00:00Z',to:'2026-09-13T00:00:00Z'}));
 assert.equal(url.pathname,'/fhir/r4/Appointment');assert.deepEqual(url.searchParams.getAll('date'),['ge2026-08-13T00:00:00Z','lt2026-09-13T00:00:00Z']);assert.equal(url.searchParams.get('location'),'LOC-4');assert.deepEqual(url.searchParams.getAll('status'),['booked','pending']);assert.equal(url.searchParams.get('_count'),'200');
});

test('private-key OAuth assertion is short-lived and correctly signed',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwt=clientAssertion({clientId:'keymark-client',tokenUrl:'https://ehr.example.com/oauth2/token',privateKey,algorithm:'RS384'}),parts=jwt.split('.');assert.equal(parts.length,3);
 const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.iss,'keymark-client');assert.equal(claims.aud,'https://ehr.example.com/oauth2/token');assert.ok(claims.exp-claims.iat<=300);
 assert.equal(crypto.verify('RSA-SHA384',Buffer.from(`${parts[0]}.${parts[1]}`),publicKey,Buffer.from(parts[2],'base64url')),true);
});

test('ES384 OAuth assertion uses the compact JOSE signature format',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-384'});
 const jwt=clientAssertion({clientId:'keymark-client',tokenUrl:'https://ehr.example.com/oauth2/token',privateKey:privateKey.export({type:'pkcs8',format:'pem'}),algorithm:'ES384'}),parts=jwt.split('.');
 const header=JSON.parse(Buffer.from(parts[0],'base64url'));assert.equal(header.alg,'ES384');assert.equal(Buffer.from(parts[2],'base64url').length,96);
 assert.equal(crypto.verify('sha384',Buffer.from(`${parts[0]}.${parts[1]}`),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')),true);
});

test('connection activation requires Appointment in the CapabilityStatement',async()=>{
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_TEST_CLIENT_SECRET;process.env.KEYMARK_TEST_CLIENT_SECRET='sandbox-secret';let call=0;
 global.fetch=async()=>{call++;return call===1?{ok:true,json:async()=>({access_token:'sandbox-token'})}:{ok:true,json:async()=>({resourceType:'CapabilityStatement',fhirVersion:'4.0.1',software:{name:'Sandbox EHR'},rest:[{resource:[{type:'Patient'},{type:'Appointment'}]}]})}};
 try{const result=await testConnection({base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_TEST_CLIENT_SECRET'}});assert.deepEqual(result,{fhirVersion:'4.0.1',software:'Sandbox EHR',appointmentSupported:true});assert.equal(call,2)}finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_TEST_CLIENT_SECRET;else process.env.KEYMARK_TEST_CLIENT_SECRET=previousSecret}
});

test('appointment polling resolves referenced Patient contact details',async()=>{
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_TEST_CLIENT_SECRET;process.env.KEYMARK_TEST_CLIENT_SECRET='simulated-secret';
 const appointment={resourceType:'Appointment',id:'appt-900',status:'booked',start:'2026-08-20T14:00:00-04:00',participant:[{actor:{reference:'Patient/pat-9'}},{actor:{reference:'Location/loc-1',display:'Cardiology'}}]};
 global.fetch=async url=>{
  const target=String(url);
  if(target.includes('/oauth2/token'))return {ok:true,json:async()=>({access_token:'sandbox-token'})};
  if(target.includes('/Patient/pat-9'))return {ok:true,json:async()=>({resourceType:'Patient',id:'pat-9',name:[{text:'Maria Example'}],telecom:[{system:'phone',value:'+13015550142'},{system:'email',value:'maria@example.com'}]})};
  if(target.includes('/Appointment'))return {ok:true,json:async()=>({resourceType:'Bundle',entry:[{resource:appointment}],link:[]})};
  throw new Error(`unexpected fetch ${target}`);
 };
 try{
  const {fetchAppointments}=require('../netlify/functions/_shared/keymark-fhir-client.cjs');
  const result=await fetchAppointments({base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_TEST_CLIENT_SECRET'}},{from:'2026-08-13T00:00:00Z',to:'2026-09-13T00:00:00Z'});
  assert.equal(result.resources.length,1);
  assert.deepEqual(result.patients.get('pat-9'),{id:'pat-9',name:'Maria Example',phone:'+13015550142',email:'maria@example.com'});
 }finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_TEST_CLIENT_SECRET;else process.env.KEYMARK_TEST_CLIENT_SECRET=previousSecret}
});

test('a failed Patient lookup never fails the appointment poll',async()=>{
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_TEST_CLIENT_SECRET;process.env.KEYMARK_TEST_CLIENT_SECRET='simulated-secret';
 const appointment={resourceType:'Appointment',id:'appt-901',status:'booked',start:'2026-08-20T14:00:00-04:00',participant:[{actor:{reference:'Patient/pat-404',display:'Jamie Rivera'}}]};
 global.fetch=async url=>{
  const target=String(url);
  if(target.includes('/oauth2/token'))return {ok:true,json:async()=>({access_token:'sandbox-token'})};
  if(target.includes('/Patient/pat-404'))return {ok:false,json:async()=>({})};
  if(target.includes('/Appointment'))return {ok:true,json:async()=>({resourceType:'Bundle',entry:[{resource:appointment}],link:[]})};
  throw new Error(`unexpected fetch ${target}`);
 };
 try{
  const {fetchAppointments}=require('../netlify/functions/_shared/keymark-fhir-client.cjs');
  const result=await fetchAppointments({base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_TEST_CLIENT_SECRET'}},{from:'2026-08-13T00:00:00Z',to:'2026-09-13T00:00:00Z'});
  assert.equal(result.resources.length,1);
  assert.equal(result.patients.size,0);
 }finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_TEST_CLIENT_SECRET;else process.env.KEYMARK_TEST_CLIENT_SECRET=previousSecret}
});
