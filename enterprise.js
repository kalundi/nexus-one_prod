(function(){
 'use strict';
 const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const label=value=>({EMT:'EMT',SNF:'SNF',ALF:'ALF',QA:'QA',GENERAL:'General'})[value]||String(value).toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
 let page=0,selected='',types=[],relationships={},generation=0,authorized=false;
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 function clear(){authorized=false;generation++;selected='';$('workspace').hidden=true;$('actorList').replaceChildren();$('details').replaceChildren();if($('actorDialog').open)$('actorDialog').close();$('actorForm').reset();}
 async function api(path='',body){
  const response=await fetch('/api/admin/actors'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token(),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(response.status===401||response.status===403)clear();
  if(!response.ok)throw Error(data.error||'Unable to update the directory.');return data;
 }
 function notice(message){$('notice').textContent=message;}
 function options(select,kind){select.replaceChildren();for(const t of types.filter(t=>!kind||t.kind===kind)){const option=node('option',`${label(t.category)} · ${label(t.subtype)}`);option.value=t.category+':'+t.subtype;select.append(option);}}
 async function load(){
  const version=++generation;
  try{
   const q=new URLSearchParams({q:$('search').value,category:$('category').value,page:String(page)}),data=await api('?'+q);
   if(version!==generation||!authorized)return;
   $('actorList').replaceChildren();
   for(const actor of data.actors){const li=node('li'),button=node('button'),name=node('strong',actor.display_name),summary=node('small',actor.classifications.map(c=>`${label(c.category)} · ${label(c.subtype)}`).join(' / '));button.type='button';button.dataset.id=actor.id;button.setAttribute('aria-current',String(selected===actor.id));button.append(name,summary);button.addEventListener('click',()=>show(actor.id));li.append(button);$('actorList').append(li);}
   if(!data.actors.length)$('actorList').append(node('li','No matching actors.'));
   $('pageNumber').textContent='Page '+(page+1);$('previous').disabled=page===0;$('next').disabled=!data.hasMore;notice('Directory ready.');
  }catch(e){notice(e.message);}
 }
 async function show(id){
  selected=id;const version=++generation;
  try{
   const data=await api('/'+id);if(version!==generation||!authorized)return;
   const panel=$('details');panel.replaceChildren(node('h2',data.actor.display_name),node('p',`${label(data.actor.kind)} · ${data.actor.active?'Active':'Inactive'}`));
   panel.append(node('h3','Classifications'));const classes=node('ul');
   for(const c of data.classifications)classes.append(node('li',`${label(c.category)} · ${label(c.subtype)} (${c.source==='MANUAL'?'directory':c.source})`));panel.append(classes);
   panel.append(node('h3','Source records'));const records=node('ul');for(const r of data.records)records.append(node('li',`${label(r.source)} · ${r.record_id}`));if(!data.records.length)records.append(node('li','Directory identity only.'));panel.append(records);
   panel.append(node('h3','Relationships'));const links=node('ul');for(const r of data.relationships)links.append(node('li',`${r.subject_name} → ${label(r.relationship)} → ${r.object_name}`));if(!data.relationships.length)links.append(node('li','No relationships recorded.'));panel.append(links);
   const form=node('form'),select=node('select'),field=node('label','Add a classification');options(select,data.actor.kind);field.append(select);const save=node('button','Add classification');form.append(field,save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const [category,subtype]=select.value.split(':');await api('/'+id+'/classifications',{category,subtype});await show(id);}catch(e){notice(e.message);save.disabled=false;}});panel.append(form);
   const relationForm=node('form'),relation=node('select'),target=node('select'),find=node('input'),search=node('button','Find related actor'),saveRelation=node('button','Save relationship');
   const typeLabel=node('label','Relationship');typeLabel.append(relation);const searchLabel=node('label','Find a related actor by name');find.required=true;find.maxLength=100;searchLabel.append(find);const targetLabel=node('label','Related actor');target.required=true;targetLabel.append(target);
   for(const key of Object.keys(relationships)){const option=node('option',label(key));option.value=key;relation.append(option);}
   search.type='button';search.addEventListener('click',async()=>{search.disabled=true;try{const result=await api('?q='+encodeURIComponent(find.value));target.replaceChildren();for(const a of result.actors.filter(a=>a.id!==id)){const o=node('option',a.display_name);o.value=a.id;target.append(o);}if(!target.options.length)notice('No related actors found.');}catch(e){notice(e.message);}finally{search.disabled=false;}});
   relationForm.append(typeLabel,searchLabel,search,targetLabel,saveRelation);relationForm.addEventListener('submit',async event=>{event.preventDefault();saveRelation.disabled=true;try{await api('/'+id+'/relationships',{relationship:relation.value,objectId:target.value});await show(id);}catch(e){notice(e.message);saveRelation.disabled=false;}});panel.append(relationForm);
   document.querySelectorAll('#actorList button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.id===id)));
   if(window.innerWidth<760)panel.scrollIntoView({block:'start'});
  }catch(e){notice(e.message);}
 }
 $('searchForm').addEventListener('submit',event=>{event.preventDefault();page=0;load();});$('previous').addEventListener('click',()=>{page--;load();});$('next').addEventListener('click',()=>{page++;load();});
 $('addActor').addEventListener('click',()=>{$('actorError').textContent='';$('actorForm').reset();options($('actorForm').elements.classification,'PERSON');$('actorDialog').showModal();});
 $('cancelActor').addEventListener('click',()=>$('actorDialog').close());$('actorForm').elements.kind.addEventListener('change',event=>options($('actorForm').elements.classification,event.target.value));
 $('actorForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{const form=$('actorForm'),[category,subtype]=form.elements.classification.value.split(':'),data=await api('',{name:form.elements.name.value,kind:form.elements.kind.value,category,subtype});if(!authorized)return;$('actorDialog').close();$('search').value='';$('category').value='';page=0;await load();await show(data.actor.id);}catch(e){$('actorError').textContent=e.message;}finally{button.disabled=false;}
 });
 async function start(){if(window.NexusAuthorizedUser?.role!=='ADMIN'){clear();return;}authorized=true;const version=++generation;try{const data=await api('/types');if(version!==generation||!authorized)return;types=data.types;relationships=data.relationships;$('workspace').hidden=false;await load();}catch(e){notice(e.message);}}
 window.addEventListener('nexus:authorized',start);window.addEventListener('nexus:logout',clear);window.addEventListener('pagehide',clear);window.addEventListener('pageshow',event=>{if(event.persisted)start();});window.addEventListener('storage',event=>{if(['nexusAccessToken','nexusUser'].includes(event.key))clear();});if(window.NexusAuthorizedUser)start();
})();
