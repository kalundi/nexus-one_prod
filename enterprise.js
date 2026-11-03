(function(){
 'use strict';
 const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const label=value=>({EMT:'EMT',SNF:'SNF',ALF:'ALF',QA:'QA',GENERAL:'General'})[value]||String(value).toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
 let page=0,selected='',types=[],relationships={},generation=0,authorized=false;
 let usersById=null,requestsCache=null,facilitiesCache=null,accountMsg='',dialogActorId='';
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 function clear(){authorized=false;generation++;selected='';usersById=null;requestsCache=null;facilitiesCache=null;accountMsg='';dialogActorId='';$('workspace').hidden=true;$('actorList').replaceChildren();$('details').replaceChildren();if($('actorDialog').open)$('actorDialog').close();$('actorForm').reset();if($('userDialog')?.open)$('userDialog').close();const rv=$('requestsView');if(rv)rv.hidden=true;const dg=$('directoryGrid');if(dg)dg.hidden=false;hubMessage('');}
 async function api(path='',body){
  const response=await fetch('/api/admin/actors'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token(),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(response.status===401||response.status===403)clear();
  if(!response.ok)throw Error(data.error||'Unable to update the directory.');return data;
 }
 async function apiJson(path,options={}){
  const response=await fetch(path,{method:options.method||'GET',headers:{authorization:'Bearer '+token(),...(options.body?{'content-type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(response.status===401||response.status===403)clear();
  if(!response.ok)throw Error(data.error||'The request was unable to complete.');return data;
 }
 const BASE_ROLES=[['ADMIN','Administrator'],['DISPATCHER','Dispatcher'],['FACILITY','Facility manager'],['STAFF','Staff / attendant (training)'],['DRIVER','Driver'],['BILLING','Billing'],['QA','Quality assurance'],['EXECUTIVE','Executive'],['PATIENT','Patient'],['CARETAKER','Caretaker']];
 function roleLabel(value){if(!value)return '—';if(window.NexusEmsRoles&&window.NexusEmsRoles[value])return window.NexusEmsRoles[value].label||value;const base=BASE_ROLES.find(([v])=>v===value);return base?base[1]:value;}
 function fillRoleSelect(select,includeBlank){
  select.replaceChildren();
  if(includeBlank){const blank=node('option','Select a role');blank.value='';select.append(blank);}
  for(const [value,text] of BASE_ROLES){const option=node('option',text);option.value=value;select.append(option);}
  if(window.NexusEmsRoles)for(const key of Object.keys(window.NexusEmsRoles)){const option=node('option',(window.NexusEmsRoles[key].label||key)+' — EMS title');option.value=key;select.append(option);}
 }
 async function loadUsers(force){
  if(usersById&&!force)return usersById;
  const data=await apiJson('/api/admin/users');usersById=new Map((data.users||[]).map(u=>[String(u.id),u]));return usersById;
 }
 async function loadRequests(force){
  if(requestsCache&&!force)return requestsCache;
  const data=await apiJson('/api/admin/role-requests');requestsCache=data.requests||[];renderRequestCount();return requestsCache;
 }
 async function loadFacilities(force){
  if(facilitiesCache&&!force)return facilitiesCache;
  const data=await apiJson('/api/facilities');facilitiesCache=(data.facilities||[]).filter(f=>f.active!==false);return facilitiesCache;
 }
 function renderRequestCount(){const pending=(requestsCache||[]).filter(r=>r.status==='PENDING').length;const el=$('requestCount');if(el)el.textContent=pending?` (${pending} pending)`:'';}
 function hubMessage(message){const el=$('hubResult');if(!el)return;el.textContent=message;el.hidden=!message;}
 function notice(message){$('notice').textContent=message;}
 function options(select,kind){select.replaceChildren();for(const t of types.filter(t=>!kind||t.kind===kind)){const option=node('option',`${label(t.category)} · ${label(t.subtype)}`);option.value=t.category+':'+t.subtype;select.append(option);}}
 async function load(){
  const version=++generation;
  try{
   const q=new URLSearchParams({q:$('search').value,category:$('category').value,status:$('status').value,page:String(page)}),data=await api('?'+q);
   if(version!==generation||!authorized)return;
   $('actorList').replaceChildren();
   for(const actor of data.actors){const li=node('li'),button=node('button'),name=node('strong',actor.display_name),summary=node('small',actor.classifications.map(c=>`${label(c.category)} · ${label(c.subtype)}`).join(' / ')+(actor.active===false?' · Inactive':''));button.type='button';button.dataset.id=actor.id;button.setAttribute('aria-current',String(selected===actor.id));button.append(name,summary);button.addEventListener('click',()=>show(actor.id));li.append(button);$('actorList').append(li);}
   if(!data.actors.length)$('actorList').append(node('li','No matching actors.'));
   $('pageNumber').textContent='Page '+(page+1);$('previous').disabled=page===0;$('next').disabled=!data.hasMore;notice('Directory ready.');
  }catch(e){notice(e.message);}
 }
 function manageSection(data){
  const actor=data.actor,management=data.management,section=node('div'),id=actor.id;section.className='manage';
  section.append(node('h3','Manage this actor'));
  const words={USER:'User account',EMPLOYEE:'Employee record',PATIENT:'Patient record',FACILITY:'Facility record',ORGANIZATION:'Organization record'};
  const count=management.relationshipCount;
  section.append(node('p',count===0?'This actor has no relationships recorded.':`This actor has ${count} relationship${count===1?'':'s'} recorded.`));
  section.append(node('p',management.sources.length?`It is kept in step with ${[...new Set(management.sources.map(r=>words[r.source]||'a live record'))].join(' and ')}.`:'It is a directory identity only, with no live record behind it.'));
  const actions=node('div');actions.className='manageActions';
  const stateButton=node('button',actor.active?'Deactivate actor':'Reactivate actor');stateButton.type='button';
  const removeButton=node('button','Remove actor permanently');removeButton.type='button';removeButton.className='danger';
  if(!management.canRemove){removeButton.disabled=true;removeButton.setAttribute('aria-describedby','removeReason');}
  actions.append(stateButton,removeButton);section.append(actions);
  if(!management.canRemove){const reason=node('p',management.blockers.join(' '));reason.id='removeReason';reason.className='removeReason';section.append(reason);}
  const confirm=(text,confirmLabel,danger,run)=>{
   section.querySelector('.confirmBox')?.remove();
   const box=node('div');box.className='confirmBox';box.setAttribute('role','alertdialog');box.setAttribute('aria-label',confirmLabel);
   box.append(node('p',text));
   const row=node('div');row.className='actions';
   const yes=node('button',confirmLabel);yes.type='button';if(danger)yes.className='danger';
   const no=node('button','Cancel');no.type='button';
   no.addEventListener('click',()=>{box.remove();(danger?removeButton:stateButton).focus();});
   yes.addEventListener('click',async()=>{yes.disabled=true;no.disabled=true;try{await run();}catch(e){notice(e.message);box.remove();}});
   row.append(yes,no);box.append(row);section.append(box);yes.focus();
  };
  stateButton.addEventListener('click',()=>confirm(
   actor.active?`Deactivate ${actor.display_name}? It will be hidden from the default directory list. You can reactivate it at any time.`:`Reactivate ${actor.display_name}? It will return to the default directory list.`,
   actor.active?'Deactivate':'Reactivate',false,
   async()=>{await api('/'+id+(actor.active?'/deactivate':'/reactivate'),{});await show(id);await load();notice(actor.active?`Deactivated ${actor.display_name}.`:`Reactivated ${actor.display_name}.`);}
  ));
  removeButton.addEventListener('click',()=>confirm(
   `Permanently remove ${actor.display_name}? This cannot be undone. Its classifications will be removed with it, and the removal will be recorded.`,
   'Permanently remove',true,
   async()=>{await api('/'+id+'/remove',{});selected='';$('details').replaceChildren(node('p','Select an actor to view classifications, source records, and relationships.'));await load();notice(`Removed ${actor.display_name}.`);}
  ));
  return section;
 }
 async function show(id){
  if(selected!==id)accountMsg='';
  selected=id;const version=++generation;
  try{
   const data=await api('/'+id);if(version!==generation||!authorized)return;
   const panel=$('details');panel.replaceChildren(node('h2',data.actor.display_name),node('p',`${label(data.actor.kind)} · ${data.actor.active?'Active':'Inactive'}`));
   panel.append(node('h3','Classifications'));const classes=node('ul');
   for(const c of data.classifications)classes.append(node('li',`${label(c.category)} · ${label(c.subtype)} (${c.source==='MANUAL'?'directory':c.source})`));panel.append(classes);
   panel.append(node('h3','Source records'));const records=node('ul');for(const r of data.records)records.append(node('li',`${label(r.source)} · ${r.record_id}`));if(!data.records.length)records.append(node('li','Directory identity only.'));panel.append(records);
   if(data.actor.kind==='PERSON'){const account=await accountSection(data);if(version!==generation||!authorized)return;panel.append(account);}
   panel.append(node('h3','Relationships'));const links=node('ul');for(const r of data.relationships)links.append(node('li',`${r.subject_name} → ${label(r.relationship)} → ${r.object_name}`));if(!data.relationships.length)links.append(node('li','No relationships recorded.'));panel.append(links);
   const form=node('form'),select=node('select'),field=node('label','Add a classification');options(select,data.actor.kind);field.append(select);const save=node('button','Add classification');form.append(field,save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const [category,subtype]=select.value.split(':');await api('/'+id+'/classifications',{category,subtype});await show(id);}catch(e){notice(e.message);save.disabled=false;}});panel.append(form);
   const relationForm=node('form'),relation=node('select'),target=node('select'),find=node('input'),search=node('button','Find related actor'),saveRelation=node('button','Save relationship');
   const typeLabel=node('label','Relationship');typeLabel.append(relation);const searchLabel=node('label','Find a related actor by name');find.required=true;find.maxLength=100;searchLabel.append(find);const targetLabel=node('label','Related actor');target.required=true;targetLabel.append(target);
   for(const key of Object.keys(relationships)){const option=node('option',label(key));option.value=key;relation.append(option);}
   search.type='button';search.addEventListener('click',async()=>{search.disabled=true;try{const result=await api('?q='+encodeURIComponent(find.value));target.replaceChildren();for(const a of result.actors.filter(a=>a.id!==id)){const o=node('option',a.display_name);o.value=a.id;target.append(o);}if(!target.options.length)notice('No related actors found.');}catch(e){notice(e.message);}finally{search.disabled=false;}});
   relationForm.append(typeLabel,searchLabel,search,targetLabel,saveRelation);relationForm.addEventListener('submit',async event=>{event.preventDefault();saveRelation.disabled=true;try{await api('/'+id+'/relationships',{relationship:relation.value,objectId:target.value});await show(id);}catch(e){notice(e.message);saveRelation.disabled=false;}});panel.append(relationForm);
   if(data.management)panel.append(manageSection(data));
   document.querySelectorAll('#actorList button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.id===id)));
   if(window.innerWidth<760)panel.scrollIntoView({block:'start'});
  }catch(e){notice(e.message);}
 }
 $('searchForm').addEventListener('submit',event=>{event.preventDefault();page=0;load();});$('status').addEventListener('change',()=>{page=0;load();});$('previous').addEventListener('click',()=>{page--;load();});$('next').addEventListener('click',()=>{page++;load();});
 $('addActor').addEventListener('click',()=>{$('actorError').textContent='';$('actorForm').reset();options($('actorForm').elements.classification,'PERSON');$('actorDialog').showModal();});
 $('cancelActor').addEventListener('click',()=>$('actorDialog').close());$('actorForm').elements.kind.addEventListener('change',event=>options($('actorForm').elements.classification,event.target.value));
 $('actorForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{const form=$('actorForm'),[category,subtype]=form.elements.classification.value.split(':'),data=await api('',{name:form.elements.name.value,kind:form.elements.kind.value,category,subtype});if(!authorized)return;$('actorDialog').close();$('search').value='';$('category').value='';page=0;await load();await show(data.actor.id);}catch(e){$('actorError').textContent=e.message;}finally{button.disabled=false;}
 });
 function confirmIn(section,text,confirmLabel,danger,run){
  section.querySelector('.confirmBox')?.remove();
  const box=node('div');box.className='confirmBox';box.setAttribute('role','alertdialog');box.setAttribute('aria-label',confirmLabel);
  box.append(node('p',text));
  const row=node('div');row.className='actions';
  const yes=node('button',confirmLabel);yes.type='button';if(danger)yes.className='danger';
  const no=node('button','Cancel');no.type='button';
  no.addEventListener('click',()=>box.remove());
  yes.addEventListener('click',async()=>{yes.disabled=true;no.disabled=true;try{await run();}catch(e){accountMsg=e.message;box.remove();if(selected)show(selected);}});
  row.append(yes,no);box.append(row);section.append(box);yes.focus();
 }
 function accountRow(term,value){const row=node('div');row.className='accountRow';row.append(node('strong',term),node('span',value));return row;}
 async function accountSection(data){
  const section=node('div');section.className='account';section.id='accountSection';
  section.append(node('h3','Account & access'));
  section.append(node('p','The sign-in account for this person, managed separately from the directory actor. Deactivating account access here closes only the login — it does not deactivate the actor, and deactivating the actor does not close the account.'));
  if(accountMsg){const message=node('p',accountMsg);message.className='accountMsg';message.setAttribute('role','status');section.append(message);}
  const userRecord=(data.records||[]).find(r=>r.source==='USER');
  let users,requests,facilities;
  try{[users,requests,facilities]=await Promise.all([loadUsers(),loadRequests(),loadFacilities()]);}
  catch(e){section.append(node('p','Account details could not be loaded: '+e.message));return section;}
  const user=userRecord?users.get(String(userRecord.record_id)):null;
  if(!user){
   section.append(node('p','No sign-in account is linked to this directory entry.'));
   const create=node('button','Create account');create.type='button';
   create.addEventListener('click',()=>openUserDialog({name:data.actor.display_name,actorId:data.actor.id}));
   section.append(create);
   section.append(node('p','The account is created with the same fields and temporary-password policy as user administration. It appears in the directory as its own entry, kept in step with the login.'));
   return section;
  }
  const mine=String(window.NexusAuthorizedUser?.id||'')===String(user.id);
  section.append(accountRow('Login email',user.email||'—'));
  section.append(accountRow('Nexus ID',user.userCode||'—'));
  section.append(accountRow('Account access',user.active?'Active':'Inactive — this person cannot sign in'));
  if(user.employeeActive===false)section.append(accountRow('Employee record','Inactive'));
  section.append(accountRow('Role',roleLabel(user.role)));
  section.append(accountRow('Approved roles',user.roles&&user.roles.length?user.roles.map(roleLabel).join(', '):'—'));
  if(user.scopeId)section.append(accountRow('Scope',user.scopeId));
  const pending=requests.filter(r=>String(r.userId)===String(user.id)&&r.status==='PENDING');
  section.append(accountRow('Pending role requests',pending.length?pending.map(r=>roleLabel(r.role)).join(', '):'None'));
  section.append(accountRow('Account created',user.createdAt?new Date(user.createdAt).toLocaleString():'—'));
  const controls=node('div');controls.className='accountControls';
  const roleField=node('label','Change role');const roleSelect=node('select');fillRoleSelect(roleSelect,false);
  if(user.role&&![...roleSelect.options].some(o=>o.value===user.role)){const current=node('option',roleLabel(user.role)+' (current)');current.value=user.role;roleSelect.append(current);}
  roleSelect.value=user.role||'';roleField.append(roleSelect);
  const facilityField=node('label','Assigned facility *');const facilitySelect=node('select');
  const blankFacility=node('option','Select the manager’s facility');blankFacility.value='';facilitySelect.append(blankFacility);
  for(const f of facilities){const option=node('option',`${f.name} (${f.facility_code})`);option.value=f.facility_code;facilitySelect.append(option);}
  if(user.scopeId)facilitySelect.value=user.scopeId;
  const facilityHelp=node('small','This manager can access only the selected facility.');facilityField.append(facilitySelect,facilityHelp);
  facilityField.hidden=roleSelect.value!=='FACILITY';
  roleSelect.addEventListener('change',()=>{facilityField.hidden=roleSelect.value!=='FACILITY';});
  const saveRole=node('button','Save role');saveRole.type='button';
  saveRole.addEventListener('click',async()=>{
   const role=roleSelect.value;
   if(!role||(role===user.role&&role!=='FACILITY')){accountMsg='Choose a different role to change it.';show(selected);return;}
   const body={role};
   if(role==='FACILITY'){if(!facilitySelect.value){accountMsg='Select the facility this manager is authorized to access.';show(selected);return;}body.scopeId=facilitySelect.value;}
   saveRole.disabled=true;
   try{await apiJson('/api/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body});usersById=null;accountMsg=`Role updated for ${user.email}.`;await show(selected);}
   catch(e){accountMsg=e.message;await show(selected);}
  });
  controls.append(roleField,facilityField,saveRole);section.append(controls);
  const actions=node('div');actions.className='manageActions';
  const accessButton=node('button',user.active?'Deactivate account access':'Reactivate account access');accessButton.type='button';if(user.active)accessButton.className='danger';
  if(mine){accessButton.disabled=true;}
  accessButton.addEventListener('click',()=>confirmIn(section,
   user.active?`Deactivate account access for ${user.email}? They will no longer be able to sign in and any active session ends. This closes only the sign-in account — the directory actor, its classifications, and its relationships stay as they are.`:`Reactivate account access for ${user.email}? They will be able to sign in again. This affects only the sign-in account, not the directory actor.`,
   user.active?'Deactivate account access':'Reactivate account access',!!user.active,
   async()=>{await apiJson('/api/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:{active:!user.active}});usersById=null;accountMsg=user.active?`Account access deactivated for ${user.email}.`:`Account access reactivated for ${user.email}.`;await show(selected);}
  ));
  const credButton=node('button',user.demoOnly?'Issue demo password':'Resend temporary password');credButton.type='button';
  credButton.addEventListener('click',()=>confirmIn(section,
   user.demoOnly?`Issue a demo password for ${user.email}? It will be shown here once.`:`Email a new temporary password to ${user.email}? It will expire in two hours.`,
   user.demoOnly?'Issue demo password':'Resend temporary password',false,
   async()=>{
    if(user.demoOnly){const d=await apiJson('/api/admin/users/'+encodeURIComponent(user.id)+'/demo-password',{method:'POST',body:{}});accountMsg=d.message||`Demo password for ${d.email}: ${d.password}`;}
    else{const d=await apiJson('/api/admin/users/'+encodeURIComponent(user.id)+'/resend-credentials',{method:'POST',body:{}});accountMsg=d.emailDeliveryStatus==='sent'?'Temporary login emailed. It expires in two hours.':(d.warning||'Unable to email credentials for this account.');}
    await show(selected);
   }
  ));
  actions.append(accessButton,credButton);section.append(actions);
  if(mine)section.append(node('p','This is your own account. Access changes are disabled here; another administrator must change them.'));
  const roles=user.roles||[];
  const tools=node('p');tools.className='accountTools';
  if(user.accessRole==='DRIVER'||roles.includes('DRIVER')){const link=node('a','Driver schedule (in Admin)');link.href='/admin.html#driverSchedulePanel';tools.append(link);}
  if(user.accessRole==='FACILITY'||roles.includes('FACILITY')){const link=node('a','Secure documents (in Admin)');link.href='/admin.html#documentAccessModule';tools.append(link);}
  if(tools.childNodes.length)section.append(tools);
  return section;
 }
 function openUserDialog(prefill={}){
  dialogActorId=prefill.actorId||'';
  const form=$('userForm');form.reset();$('userFormError').textContent='';
  fillRoleSelect(form.elements.role,true);
  form.elements.name.value=prefill.name||'';
  $('userDialogTitle').textContent=prefill.actorId?'Create account':'Add user';
  syncUserFacilityField();
  $('userDialog').showModal();
 }
 async function syncUserFacilityField(){
  const form=$('userForm'),field=$('userFacilityField'),select=form.elements.scopeId;
  const show=form.elements.role.value==='FACILITY';
  field.hidden=!show;
  if(show&&!select.options.length){
   try{const facilities=await loadFacilities();const blank=node('option','Select the manager’s facility');blank.value='';select.append(blank);for(const f of facilities){const option=node('option',`${f.name} (${f.facility_code})`);option.value=f.facility_code;select.append(option);}}
   catch(e){$('userFormError').textContent=e.message;}
  }
 }
 async function renderRequests(){
  const list=await loadRequests(true);
  const facilities=await loadFacilities().catch(()=>[]);
  const body=$('requestRows');body.replaceChildren();
  for(const request of list){
   const tr=node('tr');
   const who=node('td');who.append(node('strong',request.name||'—'),node('br'),node('small',(request.email||'')+(request.phone?' · '+request.phone:'')));tr.append(who);
   tr.append(node('td',roleLabel(request.role)),node('td',request.status),node('td',request.requestedAt?new Date(request.requestedAt).toLocaleString():'—'));
   const action=node('td');
   if(request.status==='PENDING'){
    let scopeControl=null;
    if(request.role==='FACILITY'){scopeControl=node('select');const blank=node('option','Select facility');blank.value='';scopeControl.append(blank);for(const f of facilities){const option=node('option',`${f.name} (${f.facility_code})`);option.value=f.facility_code;scopeControl.append(option);}action.append(scopeControl);}
    else if(request.role==='DRIVER'){scopeControl=node('input');scopeControl.placeholder='Driver scope ID';scopeControl.setAttribute('aria-label','Driver scope ID');action.append(scopeControl);}
    const approve=node('button','Approve');approve.type='button';
    const reject=node('button','Reject');reject.type='button';reject.className='secondary';
    approve.addEventListener('click',()=>decideRequest(request,'APPROVED',scopeControl));
    reject.addEventListener('click',()=>decideRequest(request,'REJECTED',scopeControl));
    action.append(approve,reject);
   }else action.append(node('span','Reviewed'));
   tr.append(action);body.append(tr);
  }
  if(!list.length){const tr=node('tr'),td=node('td','No role requests found.');td.colSpan=5;tr.append(td);body.append(tr);}
 }
 async function decideRequest(request,decision,scopeControl){
  let scopeId='';
  if(decision==='APPROVED'&&request.role==='DRIVER'){scopeId=(scopeControl?.value||'').trim();if(!scopeId){$('requestsMsg').textContent='Enter the driver scope ID required for this account.';scopeControl?.focus();return;}}
  if(decision==='APPROVED'&&request.role==='FACILITY'){scopeId=scopeControl?.value||'';if(!scopeId){$('requestsMsg').textContent='Select the facility this manager is authorized to access.';return;}}
  try{
   await apiJson('/api/admin/role-requests/'+encodeURIComponent(request.id),{method:'POST',body:{decision,scopeId}});
   requestsCache=null;usersById=null;
   $('requestsMsg').textContent=`Role request ${decision.toLowerCase()}.`;
   await renderRequests();
  }catch(e){$('requestsMsg').textContent=e.message;}
 }
 function setView(view){
  const requests=view==='requests';
  $('directoryGrid').hidden=requests;$('requestsView').hidden=!requests;
  $('hubDirectory').classList.toggle('active',!requests);$('hubDirectory').setAttribute('aria-pressed',String(!requests));
  $('hubRequests').classList.toggle('active',requests);$('hubRequests').setAttribute('aria-pressed',String(requests));
  if(requests)renderRequests().catch(e=>{$('requestsMsg').textContent=e.message;});
 }
 $('hubDirectory').addEventListener('click',()=>setView('directory'));
 $('hubRequests').addEventListener('click',()=>setView('requests'));
 $('addUserBtn').addEventListener('click',()=>openUserDialog());
 $('cancelUser').addEventListener('click',()=>$('userDialog').close());
 $('userForm').elements.role.addEventListener('change',syncUserFacilityField);
 $('userForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=$('userForm'),button=$('createUserSubmit');
  const email=form.elements.email.value.trim(),phone=form.elements.phone.value.trim(),name=form.elements.name.value.trim(),role=form.elements.role.value;
  if(!email||!phone||!name||!role){$('userFormError').textContent='All fields are required.';return;}
  const body={email,phone,name,role};
  if(role==='FACILITY'){const scopeId=form.elements.scopeId.value;if(!scopeId){$('userFormError').textContent='Select the facility this manager is authorized to access.';return;}body.scopeId=scopeId;}
  button.disabled=true;
  try{
   const data=await apiJson('/api/admin/users',{method:'POST',body});
   const expiresText=data.tempPasswordExpiresAt?new Date(data.tempPasswordExpiresAt).toLocaleString():'2 hours';
   const emailText=data.emailDeliveryStatus==='sent'?' Credential email sent to the user.':' Credential email was not sent automatically.';
   const policyText=data.warning?` ${data.warning}`:' User must change it on first sign-in.';
   const message=`User ${data.user.email} created. Nexus ID: ${data.user.userCode}.${data.user.facilityName?' Assigned facility: '+data.user.facilityName+'.':''} Temporary password: ${data.tempPassword}. Expires: ${expiresText}.${emailText}${policyText}`;
   $('userDialog').close();usersById=null;
   if(dialogActorId){accountMsg=message;const actorId=dialogActorId;dialogActorId='';await load();await show(actorId);}
   else{hubMessage(message);await load();}
  }catch(e){$('userFormError').textContent=e.message;}
  finally{button.disabled=false;}
 });
 async function start(){if(window.NexusAuthorizedUser?.role!=='ADMIN'){clear();return;}authorized=true;const version=++generation;try{const data=await api('/types');if(version!==generation||!authorized)return;types=data.types;relationships=data.relationships;$('workspace').hidden=false;await load();loadRequests().catch(()=>{});}catch(e){notice(e.message);}}
 window.addEventListener('nexus:authorized',start);window.addEventListener('nexus:logout',clear);window.addEventListener('pagehide',clear);window.addEventListener('pageshow',event=>{if(event.persisted)start();});window.addEventListener('storage',event=>{if(['nexusAccessToken','nexusUser'].includes(event.key))clear();});if(window.NexusAuthorizedUser)start();
})();
