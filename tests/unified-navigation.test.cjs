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
 assert.match(css,/width:min\(1240px,calc\(100% - 48px\)\)!important/);
 assert.match(css,/height:84px!important/);
 assert.match(css,/#root \.hero \.shell\.heroGrid/);
 assert.match(css,/#root \.hero \.shell\.serviceStrip/);
 assert.match(css,/height:94px!important;min-height:94px!important/);
 assert.match(css,/\.nexusCompactLanguage select\{width:62px!important;min-width:62px!important/);
 assert.match(css,/high-contrast homepage service titles/);
 assert.match(css,/serviceStrip>button b/);
 assert.match(css,/color:#075985!important/);
 assert.match(css,/#root \.serviceStrip>button p>b/);
 assert.match(css,/-webkit-text-fill-color:#b42318!important/);
 assert.match(css,/header \.nexusCompactLanguage select/);
 assert.match(css,/width:108px!important/);
 assert.match(css,/header \.globalBrand \.logo/);
 assert.match(css,/width:195px!important/);
 assert.match(css,/transform:translateX\(-50%\)!important/);
 assert.match(css,/never truncate the selected language/);
 assert.match(css,/flex:0 0 142px!important/);
 assert.match(css,/width:128px!important/);
 assert.match(css,/align Home dropdown hover surfaces with their labels/);
 assert.match(css,/header \.nexusHomeMenu a:after/);
 assert.match(css,/box-shadow:inset 3px 0 0 #0284c7!important/);
});

test('homepage sections receive a return-to-hero control',()=>{
 const js=read('platform.js');
 assert.match(js,/className='nexusBackHero'/);
 assert.match(js,/document\.getElementById\('home'\)/);
 assert.match(js,/link\.href='#'\+hero\.id/);
 assert.match(js,/aria-label','Back to homepage hero'/);
 assert.match(js,/IntersectionObserver/);
 assert.match(js,/is-section-active/);
});

test('patient sign up creates only a PATIENT account with consent',()=>{
 const api=read('netlify/functions/api.cjs');
 assert.match(api,/p\[1\]==='register'/);
 assert.match(api,/b\.acceptTerms!==true/);
 assert.match(api,/password\.length<12/);
 assert.match(api,/VALUES\(\$1,\$2,\$3,'PATIENT',true\)/);
});
