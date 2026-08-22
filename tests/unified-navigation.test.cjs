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
