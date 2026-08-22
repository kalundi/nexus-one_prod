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
 assert.match(css,/Build 059: one measured header-action layout for every viewport/);
 assert.match(css,/content:attr\(data-language-label\)!important/);
 assert.match(css,/#root \.topbar \.nexusCompactLanguage\{[\s\S]*width:140px!important/);
 assert.match(css,/header \.nexusSharedCall,[\s\S]*min-width:max-content!important/);
 assert.match(js,/function nexusStableHeaderLanguage/);
 assert.match(css,/align Home dropdown hover surfaces with their labels/);
 assert.match(css,/header \.nexusHomeMenu a:after/);
 assert.match(css,/box-shadow:inset 3px 0 0 #0284c7!important/);
 assert.match(js,/nexusHomeMenuStyleLock/);
 assert.match(js,/lockHomeMenuStyles\(\);normalizeNav\(\)/);
 assert.match(css,/hard-stop the main-nav underline inside the Home dropdown/);
 assert.match(js,/function ensureCarouselRotation\(\)/);
 assert.match(js,/Date\.now\(\)-changedAt>7000/);
 assert.match(js,/roundControl\[aria-label="Next slide"\]/);
 assert.match(js,/function ensureSharedHeaderActions\(\)/);
 assert.match(js,/\[language,call,book,account,menu\]/);
 assert.match(css,/identical right-side header actions site-wide/);
 assert.match(css,/header \.nexusSharedActions/);
});
test('homepage requests the current unclipped navigation stylesheet',()=>{
 const homepage=read('__deploy_temp/index.html');
 assert.match(homepage,/platform\.css\?v=60/);
 assert.match(homepage,/platform\.js\?v=59/);
});

test('every platform navigation requests the same current stylesheet',()=>{
 const htmlFiles=[];
 const visit=folder=>fs.readdirSync(folder,{withFileTypes:true}).forEach(entry=>{
  if(['dist','node_modules','.git'].includes(entry.name))return;
  const target=path.join(folder,entry.name);
  if(entry.isDirectory())visit(target);
  else if(entry.name.endsWith('.html'))htmlFiles.push(target);
 });
 visit(root);
 const platformPages=htmlFiles.filter(file=>/platform\.css/.test(fs.readFileSync(file,'utf8')));
 assert.ok(platformPages.length>20);
 platformPages.forEach(file=>assert.doesNotMatch(fs.readFileSync(file,'utf8'),/platform\.css(?!\?v=60)/,path.relative(root,file)));
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
 const api=read('netlify/functions/api.cjs'),js=read('platform.js');
 assert.match(api,/p\[1\]==='register'/);
 assert.match(api,/b\.acceptTerms!==true/);
 assert.match(api,/password\.length<12/);
 assert.match(api,/phoneDigits=normalizeE164/);
 assert.match(api,/password_hash,phone,role,active/);
 assert.match(api,/SELECT organization_id AS id FROM users WHERE organization_id IS NOT NULL/);
 assert.match(api,/active,organization_id,identity_subject,created_at,updated_at/);
 assert.match(api,/regexp_replace\(phone/);
 assert.match(js,/name="phone" type="tel"/);
 assert.match(js,/function configureSignupTermsGate/);
 assert.match(js,/window\.open\(termsLink\.href,'nexusTermsReview'\)/);
 assert.match(js,/status\.textContent='Open Terms & Conditions'/);
 assert.match(js,/status\.addEventListener\('click',openTerms\)/);
 assert.match(js,/window\.NexusOpenLogin/);
 assert.match(js,/className='nexusInlineSignIn'/);
 assert.match(js,/function nexusPremiumLogin/);
 assert.match(js,/Date\.now\(\)-startedAt/);
 assert.match(js,/submit\.disabled=!\(reviewComplete&&consent\.checked\)/);
});

test('Livecare draggable status rail is always inset from map edges',()=>{
 const html=read('livecare.html');
 assert.match(html,/nexusLivecareStatusPanelPositionV4/);
 assert.match(html,/const safeInset = 10/);
 assert.match(html,/minLeft: safeInset/);
 assert.match(html,/shell\.clientWidth - panel\.offsetWidth - safeInset/);
 assert.match(html,/clamp\(left, b\.minLeft, b\.maxLeft\)/);
});

