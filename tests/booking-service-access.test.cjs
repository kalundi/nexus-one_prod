const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../booking-app.js'),'utf8');
function setup(role){
 const chip=(service,secondary)=>({dataset:{service},secondary,hidden:false,disabled:false,classList:{remove(){}}});
 const chips=[chip('ambulatory',false),chip('bariatric',false),chip('bls',true),chip('als1',true)];
 const fields={service:{value:'ambulatory'},specializedRideAccessHint:{hidden:true},toggleMoreRideOptions:{hidden:false,attrs:{'aria-expanded':'false'},getAttribute(key){return this.attrs[key];},setAttribute(key,value){this.attrs[key]=value;}}};
 const context=vm.createContext({currentUserRole:role,PRIVILEGED_SERVICE_ROLES:new Set(['ADMIN','DISPATCHER','FACILITY','DRIVER']),CUSTOMER_ALLOWED_SERVICES:new Set(['ambulatory','wheelchair','stretcher','bariatric']),normalizeService:s=>s,$:id=>fields[id],serviceChips:{querySelectorAll:selector=>selector==='.chip'?chips:chips.filter(c=>c.secondary)}});
 for(const [start,end] of [['  function isPrivilegedServiceRole(', '  function setLoginMessage('],['  function applyServiceVisibility(', '  function applyAuthUi('],['  function setSecondaryRideOptionsExpanded(', '  function bindServiceChips(']]){
  vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
 }
 return {context,chips,fields};
}
test('expanding ride options cannot reveal restricted ambulance services to customers',()=>{
 const {context,chips,fields}=setup('CUSTOMER');
 context.applyServiceVisibility();context.setSecondaryRideOptionsExpanded(true);
 assert.equal(chips[2].hidden,true);assert.equal(chips[2].disabled,true);
 assert.equal(fields.toggleMoreRideOptions.hidden,true);
 assert.equal(fields.specializedRideAccessHint.hidden,false);
 assert.equal(chips[1].disabled,false);
});
for(const role of ['ADMIN','DISPATCHER','FACILITY','DRIVER'])test(`${role} can expand and select BLS`,()=>{
 const {context,chips,fields}=setup(role);
 context.applyServiceVisibility();context.setSecondaryRideOptionsExpanded(true);
 assert.equal(chips[2].hidden,false);assert.equal(chips[2].disabled,false);
 assert.equal(fields.toggleMoreRideOptions.hidden,false);
 assert.equal(fields.specializedRideAccessHint.hidden,true);
});
test('signing out hides previously expanded BLS and restores access guidance',()=>{
 const {context,chips,fields}=setup('ADMIN');
 context.applyServiceVisibility();context.setSecondaryRideOptionsExpanded(true);
 context.currentUserRole='CUSTOMER';context.applyServiceVisibility();
 assert.equal(chips[2].hidden,true);assert.equal(chips[2].disabled,true);
 assert.equal(fields.toggleMoreRideOptions.getAttribute('aria-expanded'),'false');
 assert.equal(fields.specializedRideAccessHint.hidden,false);
});
