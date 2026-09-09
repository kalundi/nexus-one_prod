const test=require('node:test');
const assert=require('node:assert/strict');
const {createCaretakerHandler}=require('../netlify/functions/_shared/caretaker.cjs');
const id='12345678-1234-1234-1234-123456789abc';
const event=(body,method='POST')=>({httpMethod:method,headers:{authorization:'Bearer valid'},body:JSON.stringify(body)});
const valid={patientId:id,pickup:'Home',destination:'Clinic',date:'2099-12-01',time:'09:00',appointmentTime:'10:00',service:'WHEELCHAIR'};
test('unauthenticated requests cannot access storage',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>{throw Object.assign(Error('Authentication required'),{statusCode:401});},query:()=>assert.fail('Database accessed')});
 await assert.rejects(handler(event({},'GET'),['caretaker']),{statusCode:401});
});
test('reads are scoped to authenticated owner',async()=>{
 const calls=[];const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:async(sql,params)=>{calls.push([sql,params]);return {rows:[]};}});
 assert.equal((await handler(event({},'GET'),['caretaker'])).statusCode,200);
 assert.equal(calls.length,2);for(const [sql,params] of calls){assert.match(sql,/WHERE (p\.)?owner_id=\$1/);assert.deepEqual(params,['owner']);}
});
test('foreign patient cannot receive plan and body owner is ignored',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:async(sql,params)=>{assert.match(sql,/WHERE id=\$2 AND owner_id=\$1/);assert.equal(params[0],'owner');return {rows:[]};}});
 assert.equal((await handler(event({...valid,owner_id:'victim'}),['caretaker','plans'])).statusCode,404);
});
test('invalid dates, times and services rejected before insert',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:()=>assert.fail('Invalid plan inserted')});
 for(const change of [{date:'2099-02-30'},{time:'25:00'},{appointmentTime:'08:00'},{service:'ADMIN'},{notes:'a'.repeat(2001)}])await assert.rejects(handler(event({...valid,...change}),['caretaker','plans']),{statusCode:400});
});
test('patient consent is required',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:()=>assert.fail('Patient inserted without consent')});
 await assert.rejects(handler(event({name:'Patient'}),['caretaker','patients']),{statusCode:400});
});
test('delete checks owner and returns not found for foreign records',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:async(sql,params)=>{assert.match(sql,/WHERE id=\$1 AND owner_id=\$2/);assert.deepEqual(params,[id,'owner']);return {rows:[]};}});
 assert.equal((await handler(event({},'DELETE'),['caretaker','plans',id])).statusCode,404);
});
test('valid plan saves all appointment details',async()=>{
 const handler=createCaretakerHandler({requireUser:async()=>({id:'owner'}),query:async(sql,params)=>{assert.deepEqual(params,['owner',id,'Home','Clinic','2099-12-01','09:00','10:00','WHEELCHAIR','']);return {rows:[{id}]};}});
 assert.equal((await handler(event(valid),['caretaker','plans'])).statusCode,201);
});
