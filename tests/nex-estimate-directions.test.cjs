'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('visitor-assistant.js','utf8');
const start=code.indexOf('  function directionsMiles(maps, origin, destination) {');
const end=code.indexOf('  // -------- place-name resolution',start);
assert.ok(start>=0&&end>start,'Nex directions helper must exist');
const ctx=vm.createContext({Promise,Date,Object,String});
vm.runInContext(code.slice(start,end)+'\nthis.directionsMiles=directionsMiles;',ctx);

function maps(route){
 return {TravelMode:{DRIVING:'DRIVING'},DirectionsService:class{
   route(req,cb){route(req,cb);}
 }};
}
const fixture=()=>({routes:[{legs:[{distance:{value:1609.344*12},duration:{value:1800}}]}]});
test('normal traffic-enabled route is used with no retry',async()=>{
 const calls=[];
 const result=await ctx.directionsMiles(maps((req,cb)=>{calls.push(req);cb(fixture(),'OK');}),'A','B');
 assert.equal(calls.length,1);
 assert.equal(calls[0].drivingOptions.trafficModel,'bestguess');
 assert.equal(result.miles,12);
});
test('traffic route failure retries once without drivingOptions',async()=>{
 const calls=[];
 const result=await ctx.directionsMiles(maps((req,cb)=>{
   calls.push(req);
   if(calls.length===1)cb(null,'INVALID_REQUEST');
   else cb(fixture(),'OK');
 }),'A','B');
 assert.equal(calls.length,2);
 assert.equal(calls[1].drivingOptions,undefined);
 assert.equal(result.miles,12);
 assert.equal(result.trafficMinutes,null);
});
test('two failed routes return typed failure and do not loop',async()=>{
 let calls=0;
 await assert.rejects(ctx.directionsMiles(maps((req,cb)=>{calls++;cb(null,'ZERO_RESULTS');}),'A','B'),e=>e.code==='directions');
 assert.equal(calls,2);
});
test('empty-distance route is not sent to pricing',async()=>{
 await assert.rejects(ctx.directionsMiles(maps((req,cb)=>cb({routes:[{legs:[{distance:{value:0},duration:{value:10}}]}]},'OK')),'A','B'),e=>e.status==='EMPTY_ROUTE');
});
test('Nex distinguishes map outage from route failure without leaking raw API errors',()=>{
 assert.match(code,/reason === 'maps-unavailable'/);
 assert.match(code,/reason === 'directions'/);
 assert.match(code,/map service needed to measure driving distance/);
 assert.match(code,/Google Maps could not calculate a drivable route/);
});
