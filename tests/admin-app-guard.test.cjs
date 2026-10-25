const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function check(user){
 const calls=[],root={dataset:{},style:{}},storage=new Map([['nexusAccessToken','verified-session']]);
 const context={location:{pathname:'/apps.html',search:'',replace:()=>{}},document:{documentElement:root,body:null},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{dispatchEvent(){}},CustomEvent:class{},URLSearchParams,AbortController,setTimeout,clearTimeout,console,
 fetch:async(path,options)=>{calls.push([path,options]);return {ok:true,json:async()=>path==='/api/auth/switch-role'?{user:{...user,role:'ADMIN'}}:path==='/api/auth/me'?{user}:{trips:[]}};}};
 vm.runInNewContext(fs.readFileSync('auth-guard.js','utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return {calls,root};
}
test('app hub restores a server-approved administrator experience after switching roles',async()=>{
 const {calls,root}=await check({role:'PATIENT',roles:['ADMIN','PATIENT']});
 assert.equal(root.dataset.authState,'authorized');assert.equal(root.dataset.authorizedRole,'ADMIN');
 assert.equal(calls.filter(([path])=>path==='/api/auth/switch-role').length,1);
});
test('patient account cannot request administrator restoration or enter the app hub',async()=>{
 const {calls,root}=await check({role:'PATIENT',roles:['PATIENT']});
 assert.equal(root.dataset.authState,'denied');assert.equal(calls.some(([path])=>path==='/api/auth/switch-role'),false);
});
