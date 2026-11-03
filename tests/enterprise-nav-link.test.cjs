const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const adminAppsSource=fs.readFileSync('admin-apps.js','utf8');
const platformSource=fs.readFileSync('platform.js','utf8');

function launcherEntries(){
 return [...adminAppsSource.matchAll(/\[\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\]/g)]
  .map(match=>({name:match[1],description:match[2],path:match[3],role:match[4]}));
}

test('admin launcher grid lists the Enterprise Directory for administrators',()=>{
 const entries=launcherEntries(),directory=entries.find(entry=>entry.path==='enterprise.html');
 assert.ok(directory,'launcher grid has an entry for enterprise.html');
 assert.equal(directory.name,'Enterprise Directory');
 assert.equal(directory.description,'People, facilities, organizations, and business relationships');
 assert.equal(directory.role,'ADMIN','the tile switches to the ADMIN experience, the only role the directory admits');
 assert.deepEqual(entries.map(entry=>entry.path),[
  'admin.html','enterprise.html','dispatch.html','driveflex-dispatch.html','driver-app.html','facility.html',
  'patient.html','caretaker.html','booking-app.html','livecare.html','facility-demo.html','livecare-demo.html',
  'billing.html','qa.html','executive.html','fleet.html','operations.html','ai-operations.html','keymark.html',
  'secure-documents.html','training.html','admin-maintenance.html'
 ],'existing tiles keep their labels and order; the directory is added after Administration');
});

function renderLauncher(user){
 const notice={textContent:''},children=[];
 const grid={append(node){children.push(node);}};
 const document={
  getElementById(id){return id==='appNotice'?notice:id==='appGrid'?grid:null;},
  createElement(tag){return {tagName:tag.toUpperCase(),children:[],className:'',href:'',textContent:'',append(...nodes){this.children.push(...nodes);},addEventListener(){}};}
 };
 const window={NexusAuthorizedUser:user,addEventListener(){}};
 vm.runInNewContext(adminAppsSource,{window,document,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},console});
 return {notice,children};
}

test('launcher renders an Enterprise Directory tile pointing at /enterprise.html for an administrator',()=>{
 const {children}=renderLauncher({role:'ADMIN',roles:['ADMIN','PATIENT']});
 assert.equal(children.length,22);
 const tile=children[1];
 assert.equal(tile.className,'appLink');
 assert.equal(tile.href,'/enterprise.html');
 assert.equal(tile.children[0].textContent,'Enterprise Directory');
 assert.equal(tile.children[1].textContent,'People, facilities, organizations, and business relationships');
});

test('launcher renders nothing for a non-administrator',()=>{
 const {children,notice}=renderLauncher({role:'PATIENT',roles:['PATIENT']});
 assert.equal(children.length,0);
 assert.equal(notice.textContent,'');
});

test('account menu adds the Enterprise Directory link for administrators, mirroring the training link pattern',()=>{
 const gate="if(current?.role==='ADMIN'||current?.roles?.includes('ADMIN'))";
 const line=platformSource.split('\n').find(candidate=>candidate.includes(gate));
 assert.ok(line,'platform.js gates the directory link on an administrator role');
 assert.ok(line.includes("directory.href='/enterprise.html'"),'the link points at /enterprise.html');
 assert.ok(line.includes("directory.textContent='Enterprise Directory'"),'the link is labelled Enterprise Directory');
 assert.ok(line.includes("querySelector('.nexusAccountMenu')?.prepend(directory)"),'the link is added to the account menu');
 assert.ok(!line.includes('bookRideSign'),'the link is a plain menu link, not a booking sign button');
});
