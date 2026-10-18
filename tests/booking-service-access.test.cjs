const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(require.resolve('../booking-app.js'),'utf8');
function extract(startMarker,endMarker){
  const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
  assert.notEqual(start,-1,`missing ${startMarker}`);assert.ok(end>start,`missing ${endMarker}`);
  return source.slice(start,end);
}
function setup(role){
  const services=['ambulatory','wheelchair','broda','stretcher','bariatric','bls','als1','als2','facility_transfer','facility_transfer_critical'];
  const chips=services.map(service=>({dataset:{service},hidden:false,disabled:false,classList:{remove(){}}}));
  const options=services.map(service=>({value:service,dataset:{optionService:service},hidden:false,disabled:false}));
  const fields={service:{value:'ambulatory'},serviceTypeSelect:{value:'ambulatory',querySelectorAll:()=>options},specializedRideAccessHint:{hidden:true},toggleMoreRideOptions:{hidden:false,attrs:{'aria-expanded':'false'},getAttribute(key){return this.attrs[key];},setAttribute(key,value){this.attrs[key]=value;}}};
  const context=vm.createContext({currentUserRole:role,CUSTOMER_ALLOWED_SERVICES:new Set(['ambulatory','wheelchair','broda','stretcher','bariatric']),normalizeService:value=>value,$:id=>fields[id],serviceChips:{querySelectorAll:()=>chips}});
  context.selectService=(service)=>{fields.service.value=service;fields.serviceTypeSelect.value=service;};
  vm.runInContext(extract('  function normalizeRole(', '  function setServiceValidationError('),context);
  vm.runInContext(extract('  function applyServiceVisibility(', '  function applyAuthUi('),context);
  vm.runInContext(extract('  function setSecondaryRideOptionsExpanded(', '  function bindServiceChips('),context);
  return {context,chips,fields};
}

for(const role of ['ADMIN','Administrator','DISPATCH','Dispatcher','FACILITY','Facility Manager','Tester','TESTER','TEST_ACCOUNT','QA']){
  test(`${role} can access the complete service catalogue`,()=>{
    const {context,chips,fields}=setup(role);context.applyServiceVisibility();context.setSecondaryRideOptionsExpanded(true);
    assert.ok(chips.every(chip=>!chip.hidden&&!chip.disabled));
    assert.ok(fields.serviceTypeSelect.querySelectorAll().every(option=>!option.hidden&&!option.disabled));
  });
}

for(const role of ['CUSTOMER','PATIENT','RIDER','DRIVER','BILLING','EXECUTIVE','STAFF']){
  test(`${role} can access only ambulatory, wheelchair, Broda, stretcher, and bariatric`,()=>{
    const {context,chips,fields}=setup(role);context.applyServiceVisibility();context.setSecondaryRideOptionsExpanded(true);
    for(const chip of chips){const allowed=['ambulatory','wheelchair','broda','stretcher','bariatric'].includes(chip.dataset.service);assert.equal(chip.hidden,!allowed,chip.dataset.service);assert.equal(chip.disabled,!allowed,chip.dataset.service);}
    for(const option of fields.serviceTypeSelect.querySelectorAll()){const allowed=['ambulatory','wheelchair','broda','stretcher','bariatric'].includes(option.value);assert.equal(option.hidden,!allowed,option.value);assert.equal(option.disabled,!allowed,option.value);}
  });
}

test('changing from privileged to restricted role clears a now disallowed selection',()=>{
  const {context,chips,fields}=setup('ADMIN');fields.service.value='bls';context.applyServiceVisibility();
  context.currentUserRole='DRIVER';context.applyServiceVisibility();
  assert.equal(fields.service.value,'');assert.equal(chips.find(chip=>chip.dataset.service==='bls').hidden,true);
});

test('legacy Additional Capacity values normalize to bariatric',()=>{
  vm.runInNewContext(extract('  function normalizeService(', '  function getRequestedServiceFromUrl('),globalThis);
  assert.equal(globalThis.normalizeService('Additional Capacity'),'bariatric');
  delete globalThis.normalizeService;});
