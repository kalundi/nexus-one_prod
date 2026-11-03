'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('nex-insights.html','utf8');
const guard=fs.readFileSync('auth-guard.js','utf8');

test('Nex insights is registered as an administrator-only protected route',()=>{
 assert.match(guard,/['"]\/nex-insights\.html['"]\s*:\s*\[['"]ADMIN['"]\]/);
 assert.match(html,/src="\/auth-guard\.js"/);
});
test('Nex dashboard cannot remain blank due to unconditional CSS visibility',()=>{
 assert.doesNotMatch(html,/<style>\s*html\s*\{\s*visibility\s*:\s*hidden/i);
 assert.match(guard,/root\.style\.visibility\s*=\s*['"]visible['"]/);
});
test('dashboard returns to the existing admin apps page',()=>{
 assert.match(html,/href="\/apps\.html"/);
 assert.doesNotMatch(html,/href="\/admin-apps\.html"/);
});
test('unauthenticated dashboard redirects to sign-in rather than staying blank',()=>{
 let redirected=null;
 const sessionStorage={getItem:()=>null};
 const location={pathname:'/nex-insights.html',search:'',replace:url=>{redirected=url;}};
 const root={style:{},dataset:{}};
 const ctx={location,sessionStorage,document:{documentElement:root},URLSearchParams,console};
 vm.runInNewContext(guard,ctx);
 assert.ok(redirected?.startsWith('/livecare.html?login=1&redirect='));
 assert.equal(root.style.visibility,'hidden');
});
