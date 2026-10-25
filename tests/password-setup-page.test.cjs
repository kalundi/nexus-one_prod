const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('set-password.html','utf8');
function page(search='',response={ok:true,json:async()=>({})}){
 const nodes=Object.fromEntries(['status','saveBtn','password','confirmPassword'].map(id=>[id,{textContent:'',value:'',disabled:false,addEventListener(type,callback){this[type]=callback;}}]));
 const requests=[];
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{URLSearchParams,location:{search,pathname:'/set-password.html'},history:{replaceState(){}},document:{getElementById:id=>nodes[id]},fetch:async(...args)=>{requests.push(args);return response;}});
 return {nodes,requests};
}
test('public password setup page is visible and explains incomplete invitation links',()=>{
 assert.doesNotMatch(html,/(?:html|body)\s*\{[^}]*visibility\s*:\s*hidden/);
 const {nodes}=page();assert.equal(nodes.saveBtn.disabled,true);assert.match(nodes.status.textContent,/missing its secure token/);
});
test('valid invitation submits to password setup and displays expired-link errors',async()=>{
 const {nodes,requests}=page('?token=fixture-token',{ok:false,json:async()=>({error:'This setup link is invalid or expired'})});
 nodes.password.value=nodes.confirmPassword.value='fixture-password-123';
 await nodes.saveBtn.click();assert.equal(requests[0][0],'/api/auth/password-setup');
 assert.equal(JSON.parse(requests[0][1].body).token,'fixture-token');
 assert.equal(nodes.status.textContent,'This setup link is invalid or expired');assert.equal(nodes.saveBtn.disabled,false);
});
