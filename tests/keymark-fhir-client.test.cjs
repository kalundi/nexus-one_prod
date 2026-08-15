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

test('connection activation requires Appointment in the CapabilityStatement',async()=>{
 const previousFetch=global.fetch,previousSecret=process.env.KEYMARK_TEST_CLIENT_SECRET;process.env.KEYMARK_TEST_CLIENT_SECRET='sandbox-secret';let call=0;
 global.fetch=async()=>{call++;return call===1?{ok:true,json:async()=>({access_token:'sandbox-token'})}:{ok:true,json:async()=>({resourceType:'CapabilityStatement',fhirVersion:'4.0.1',software:{name:'Sandbox EHR'},rest:[{resource:[{type:'Patient'},{type:'Appointment'}]}]})}};
 try{const result=await testConnection({base_url:'https://ehr.example.com/fhir/r4',auth_type:'CLIENT_SECRET',configuration:{tokenUrl:'https://ehr.example.com/oauth2/token',clientId:'keymark',clientSecretEnvVar:'KEYMARK_TEST_CLIENT_SECRET'}});assert.deepEqual(result,{fhirVersion:'4.0.1',software:'Sandbox EHR',appointmentSupported:true});assert.equal(call,2)}finally{global.fetch=previousFetch;if(previousSecret===undefined)delete process.env.KEYMARK_TEST_CLIENT_SECRET;else process.env.KEYMARK_TEST_CLIENT_SECRET=previousSecret}
});
