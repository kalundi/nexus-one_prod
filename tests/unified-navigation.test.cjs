const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('shared navigation creates ordered Home group and compact actions',()=>{
 const js=read('platform.js'),css=read('platform.css');
 assert.match(js,/\['Services','services'\],\['Experience','patient-experience'\],\['Coverage','coverage'\],\['Facilities','facilities'\]/);
 assert.match(js,/className='nexusHomeGroup'/);
 assert.match(js,/textContent='Sign Up'/);
 assert.match(js,/Sign In/);
 assert.match(js,/\.globalActions,\.navRight/);
 assert.match(js,/nexusMenuDismiss/);
 assert.match(js,/if\(!group\.contains\(event\.target\)\)group\.removeAttribute\('open'\)/);
 assert.match(css,/\.topbar #primary-navigation\{display:flex/);
 assert.match(css,/\.topbar \.navRight>\.livecareLink\{display:none!important\}/);
 assert.match(css,/#root \.heroGrid\{min-height:560px!important;padding-top:34px!important/);
 assert.match(css,/\.nexusCompactLanguage select\{min-width:54px/);
 assert.match(css,/\.globalNav,\.nav\{min-height:68px/);
});

test('homepage sections receive a return-to-hero control',()=>{
 const js=read('platform.js');
 assert.match(js,/className='nexusBackHero'/);
 assert.match(js,/link\.href='#home-hero'/);
 assert.match(js,/link\.textContent='Back to top'/);
});

test('patient sign up creates only a PATIENT account with consent',()=>{
 const api=read('netlify/functions/api.cjs');
 assert.match(api,/p\[1\]==='register'/);
 assert.match(api,/b\.acceptTerms!==true/);
 assert.match(api,/password\.length<12/);
 assert.match(api,/VALUES\(\$1,\$2,\$3,'PATIENT',true\)/);
});
