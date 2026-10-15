const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const {createDriveflexMarketplace,validateUpload,encryptFile,decryptFile}=require('../netlify/functions/_shared/driveflex-marketplace.cjs');
const {requirements,summarize}=require('../netlify/functions/_shared/driveflex-checklist.cjs');
test('training requests and expired credentials cannot satisfy readiness',()=>{
 const records=requirements.map(r=>({requirement_key:r.key,status:'APPROVED'}));
 assert.equal(summarize(records).ready,true);records[0].status='TRAINING_REQUESTED';assert.equal(summarize(records).readyForReview,false);
 records[0].status='APPROVED';records[0].expires_on='2020-01-01';assert.equal(summarize(records).ready,false);
});
test('uploads validate contents and encryption binds files to their application',()=>{
 const previous=process.env.DRIVEFLEX_DOCUMENT_KEY;process.env.DRIVEFLEX_DOCUMENT_KEY=Buffer.alloc(32,7).toString('base64');
 try{const data=Buffer.from('%PDF-1.7 test');assert.throws(()=>validateUpload({name:'fake.png',mimeType:'image/png',dataBase64:data.toString('base64')}));
 const file=validateUpload({name:'document.pdf',mimeType:'application/pdf',dataBase64:data.toString('base64')});const encrypted=encryptFile(file.data,'application:license');const row={encrypted_data:encrypted.data,file_iv:encrypted.iv,file_tag:encrypted.tag};assert.deepEqual(decryptFile(row,'application:license'),data);assert.throws(()=>decryptFile(row,'other:license'));
 }finally{if(previous===undefined)delete process.env.DRIVEFLEX_DOCUMENT_KEY;else process.env.DRIVEFLEX_DOCUMENT_KEY=previous;}
});
test('marketplace SQL supports publishing, requesting, selecting and payment guards',async()=>{
 const db=new PGlite();const admin='11111111-1111-4111-8111-111111111111',driver='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec('CREATE TABLE users(id uuid PRIMARY KEY,email text,display_name text,active boolean); CREATE TABLE employees(user_id uuid,role text,active boolean); CREATE TABLE bookings(reference text PRIMARY KEY,status text); CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);');
 await db.exec(fs.readFileSync('database/migrations/092.001_driveflex_marketplace.sql','utf8'));
 await db.query("INSERT INTO users VALUES($1,'admin@test','Admin',true),($2,'driver@test','Driver',true)",[admin,driver]);await db.query("INSERT INTO employees VALUES($1,'DRIVER',true)",[driver]);await db.exec("INSERT INTO bookings VALUES('TEST','CONFIRMED')");
 let user={id:admin,role:'ADMIN'};const query=db.query.bind(db);const api=createDriveflexMarketplace({query,getPool:()=>({connect:async()=>({query,release(){}})}),requireUser:async(_,roles)=>{if(!roles.includes(user.role))throw Object.assign(Error('Forbidden'),{statusCode:403});return user;},audit:async()=>{},sendEmail:async()=>{},siteBase:()=> 'https://example.test'});
 const call=(path,method='GET',body={})=>api.handle({headers:{},body:JSON.stringify(body)},path.split('/'),method);
 await call('driveflex/manage/trips','POST',{bookingReference:'TEST',pickupArea:'Rockville',destinationArea:'Bethesda',serviceLevel:'AMBULATORY',startAt:'2099-12-01T14:00:00Z',endAt:'2099-12-01T16:00:00Z',payout:'75.50'});
 const trip=JSON.parse((await call('driveflex/trips')).body).trips[0];assert.equal(trip.payout_cents,7550);assert.equal(trip.booking_reference,undefined);
 user={id:driver,role:'DRIVER'};await call(`driveflex/trips/${trip.id}/request`,'POST');await assert.rejects(call(`driveflex/trips/${trip.id}/request`,'POST'),{statusCode:409});
 const request=JSON.parse((await call('driveflex/trips/mine')).body).requests[0];user={id:admin,role:'ADMIN'};
 await assert.rejects(call(`driveflex/manage/requests/${request.request_id}`,'POST',{action:'select'}),{statusCode:400});
 await call(`driveflex/manage/requests/${request.request_id}`,'POST',{action:'select',confirmChecks:true});
 await assert.rejects(call(`driveflex/manage/trips/${trip.id}/close`,'POST'),{statusCode:409});
 await assert.rejects(call(`driveflex/manage/requests/${request.request_id}`,'POST',{action:'paid',paymentReference:'PAY-1'}),{statusCode:409});
 await db.exec("UPDATE bookings SET status='COMPLETED'");await call(`driveflex/manage/requests/${request.request_id}`,'POST',{action:'paid',paymentReference:'PAY-1'});
 await assert.rejects(call(`driveflex/manage/requests/${request.request_id}`,'POST',{action:'paid',paymentReference:'PAY-1'}),{statusCode:409});
 user={id:driver,role:'DRIVER'};await assert.rejects(call('driveflex/manage/applications'),{statusCode:403});
 }finally{await db.close();}
});
