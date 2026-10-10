const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Fare=require('../nexus-fare.js');
const rate={base:100,includedMiles:8,perMile:4,waitPer15:20};
for(const [minutes,charge] of [[0,0],[1,0],[15,0],[15.01,20],[16,20],[30,20],[31,40],[45,40],[46,60]])test(`waiting after 15 minutes: ${minutes} minutes costs $${charge}`,()=>{
 const result=Fare.getWaitingCharge(minutes,rate,{freeWaitMinutes:0,servicePolicies:{wheelchair:{freeWaitMinutes:0}}},'wheelchair');
 assert.equal(result.freeWaitMinutes,15,'legacy immediate-wait settings migrate');
 assert.equal(result.waitCharge,charge);
});
test('explicit current service waiting allowances override the global default',()=>{
 const rules={waitingPolicyVersion:2,freeWaitMinutes:15,servicePolicies:{wheelchair:{freeWaitMinutes:30}}};
 assert.equal(Fare.getWaitingCharge(31,rate,rules,'wheelchair').waitCharge,20);
 assert.equal(Fare.getWaitingCharge(31,rate,rules,'ambulatory').waitCharge,40);
 assert.equal(Fare.getWaitingCharge(1,rate,{...rules,servicePolicies:{wheelchair:{freeWaitMinutes:0}}},'wheelchair').waitCharge,20);
});
test('configured fuel, traffic, schedule premium, waiting, deadhead, urgency and card fee produce the hand-calculated fare',()=>{
 const rules={waitingPolicyVersion:2,freeWaitMinutes:15,fuelSurchargePerMile:.5,trafficOverageFeePerHour:60,trafficOverageGraceMinutes:10,afterHoursSurchargePct:10,deadheadRatePct:25,shortNoticeHours:12,shortNoticeSurchargePct:40,cardProcessingFeePct:4};
 const result=Fare.calculateBooking({service:'wheelchair',date:'2030-08-15',time:'18:40',createdAt:'2030-08-15T11:00:00Z',tripType:'ONE_WAY'},
 {miles:10,durationMinutes:30,trafficDurationMinutes:50,stopWaitMinutes:31,deadheadSegments:[12,2],discountPct:0},{pricing:{wheelchair:rate},fareRules:rules});
 assert.equal(result.mileageChargePerLeg,8);
 assert.equal(result.fuelChargePerLeg,5);
 assert.equal(result.trafficChargePerLeg,10);
 assert.equal(result.premiumRatePct,10);
 assert.equal(result.waitCharge,40);
 assert.equal(result.deadheadCharge,4);
 assert.equal(result.shortNoticeCharge,40);
 assert.ok(Math.abs(result.subtotal-219.3)<1e-8);
 assert.equal(result.discountedTotal,228.07);
});
test('service schedule premiums and zero fees override global percentages without stacking',()=>{
 const rules={weekendSurchargePct:10,holidaySurchargePct:15,servicePolicies:{wheelchair:{weekendSurchargePct:25,afterHoursSurchargePct:0}}};
 const calculate=(date,time)=>Fare.calculate({service:'wheelchair',miles:0,date,time,rate,rules,metrics:{bookingTime:0}});
 assert.equal(calculate('2030-08-17','20:00').subtotal,125);
 assert.equal(Fare.roundMoney(calculate('2030-07-04','10:00').subtotal),115);
 assert.equal(calculate('2030-08-15','20:00').subtotal,100);
});
test('server settings migrate old waits once and retain all fare variables after save',()=>{
 const source=fs.readFileSync('netlify/functions/api.cjs','utf8');
 const context=vm.createContext({clean:value=>String(value??'').trim(),n:(value,fallback=0)=>value==null||value===''?fallback:Number.isFinite(Number(value))?Number(value):fallback,clamp:(value,min,max)=>Math.min(max,Math.max(min,value))});
 vm.runInContext(source.slice(source.indexOf('const DEFAULT_PRICING='),source.indexOf('async function ensureSettingsTable('))+source.slice(source.indexOf('function mergePricing('),source.indexOf('async function readPlatformSettings(')),context);
 const old=context.mergePlatformSettings({fareRules:{freeWaitMinutes:0,servicePolicies:{wheelchair:{freeWaitMinutes:0}}}});
 assert.equal(old.fareRules.waitingPolicyVersion,2);
 assert.equal(old.fareRules.freeWaitMinutes,15);
 for(const policy of Object.values(old.fareRules.servicePolicies))assert.equal(policy.freeWaitMinutes,15);
 const edited=context.mergePlatformSettings({...old,fareRules:{...old.fareRules,deadheadRatePct:25,shortNoticeHours:12,shortNoticeSurchargePct:40,cardProcessingFeePct:4,servicePolicies:{...old.fareRules.servicePolicies,wheelchair:{...old.fareRules.servicePolicies.wheelchair,freeWaitMinutes:30}}}});
 assert.equal(edited.fareRules.servicePolicies.wheelchair.freeWaitMinutes,30);
 assert.equal(edited.fareRules.deadheadRatePct,25);
 assert.equal(edited.fareRules.shortNoticeHours,12);
 assert.equal(edited.fareRules.shortNoticeSurchargePct,40);
 assert.equal(edited.fareRules.cardProcessingFeePct,4);
});
