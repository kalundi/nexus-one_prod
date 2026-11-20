(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const LIST_STYLE='max-height:150px;overflow:auto;border:1px solid #d7e3f0;border-radius:8px;padding:6px;display:grid;gap:4px';
 const ROW_STYLE='display:flex;gap:6px;align-items:center;font-weight:400';
 const HELP='This manager can access the primary facility and any additional facilities selected.';
 let facilitiesCache=null;
 function checkedCodes(list){return [...list.querySelectorAll('input:checked')].map(box=>box.value);}
 function buildAdditional(list,primary,checked=[]){
  list.replaceChildren();
  for(const f of facilitiesCache||[]){
   if(f.facility_code===primary)continue;
   const row=document.createElement('label');row.style.cssText=ROW_STYLE;
   const box=document.createElement('input');box.type='checkbox';box.value=f.facility_code;box.checked=checked.includes(f.facility_code);
   row.append(box,document.createTextNode(` ${f.name} (${f.facility_code})`));list.append(row);
  }
  if(!list.childNodes.length){const span=document.createElement('span');span.textContent='No other active facilities.';list.append(span);}
 }
 function field(id,additionalId){
  const wrapper=document.createElement('div');wrapper.className='formField';wrapper.hidden=true;
  const label=document.createElement('label');label.htmlFor=id;label.textContent='Primary facility *';
  const select=document.createElement('select');select.id=id;
  const help=document.createElement('small');help.textContent=HELP;
  wrapper.append(label,select,help);
  const additionalWrapper=document.createElement('div');additionalWrapper.className='formField';additionalWrapper.hidden=true;
  const additionalLabel=document.createElement('label');additionalLabel.htmlFor=additionalId;additionalLabel.textContent='Additional facilities';
  const additionalList=document.createElement('div');additionalList.id=additionalId;additionalList.style.cssText=LIST_STYLE;
  additionalWrapper.append(additionalLabel,additionalList);
  const api={wrapper,select,help,additionalWrapper,additionalList};
  select.addEventListener('change',()=>{if(!wrapper.hidden)buildAdditional(additionalList,select.value,checkedCodes(additionalList));});
  return api;
 }
 const create=field('newUserFacility','newUserAdditionalFacilities'),edit=field('editUserFacility','editUserAdditionalFacilities');
 $('newRole').closest('.formField').after(create.wrapper,create.additionalWrapper);$('editUserScope').closest('.formField').after(edit.wrapper,edit.additionalWrapper);
 let pending;
 async function load(select,selected=''){
  select.disabled=true;select.replaceChildren(new Option('Loading active facilities…',''));
  try{
   if(!pending)pending=fetch('/api/facilities',{headers:{authorization:'Bearer '+(sessionStorage.getItem('nexusAccessToken')||'')},cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load facilities.');return (data.facilities||[]).filter(f=>f.active===true);}).finally(()=>{pending=null;});
   const facilities=await pending;facilitiesCache=facilities;
   select.replaceChildren(new Option(facilities.length?'Select the manager’s facility':'No active facilities available',''));
   facilities.forEach(f=>select.add(new Option(f.name+' — '+f.facility_code+(f.address?' · '+f.address:''),f.facility_code)));
   if(facilities.some(f=>f.facility_code===selected))select.value=selected;
   else if(selected){const missing=new Option('Previous facility unavailable — select an active facility','');missing.selected=true;select.add(missing);}
  }catch(error){select.replaceChildren(new Option(error.message+' Reopen to retry.',''));}finally{select.disabled=false;}
 }
 async function syncCreate(){const facility=$('newRole').value==='FACILITY';create.wrapper.hidden=!facility;create.additionalWrapper.hidden=!facility;create.select.required=facility;if(facility){await load(create.select,create.select.value);buildAdditional(create.additionalList,create.select.value,checkedCodes(create.additionalList));}else create.select.value='';}
 async function syncEdit(demoOnly=false,facilityCodes=null){const facility=$('editUserRole').value==='FACILITY'&&!demoOnly;edit.wrapper.hidden=!facility;edit.additionalWrapper.hidden=!facility;edit.select.required=facility;$('editUserScope').closest('.formField').hidden=facility;if(facility){await load(edit.select,$('editUserScope').value);buildAdditional(edit.additionalList,edit.select.value,facilityCodes?facilityCodes.filter(code=>code!==edit.select.value):checkedCodes(edit.additionalList));}}
 $('newRole').addEventListener('change',syncCreate);$('editUserRole').addEventListener('change',()=>syncEdit(false));
 const dialog=document.createElement('dialog');dialog.className='userDialog';dialog.setAttribute('aria-labelledby','approveFacilityTitle');dialog.innerHTML='<form method="dialog"><h3 id="approveFacilityTitle">Approve facility manager access</h3><p>Select the facilities this manager is authorized to access.</p><div class="formField"><label for="approveUserFacility">Primary facility *</label><select id="approveUserFacility" required></select></div><div class="formField"><label>Additional facilities</label><div id="approveUserAdditionalFacilities" style="'+LIST_STYLE+'"></div></div><p class="scheduleHelp">Access covers the primary facility and any additional facilities selected.</p><div class="userDialogActions"><button type="button" class="button secondary" id="cancelFacilityApproval">Cancel</button><button class="button primary" value="approve">Approve selected facilities</button></div></form>';document.body.append(dialog);
 $('cancelFacilityApproval').addEventListener('click',()=>dialog.close('cancel'));
 $('approveUserFacility').addEventListener('change',()=>buildAdditional($('approveUserAdditionalFacilities'),$('approveUserFacility').value,checkedCodes($('approveUserAdditionalFacilities'))));
 async function choose(){await load($('approveUserFacility'));buildAdditional($('approveUserAdditionalFacilities'),$('approveUserFacility').value,[]);dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='approve'?{scopeId:$('approveUserFacility').value,additionalFacilityCodes:checkedCodes($('approveUserAdditionalFacilities'))}:''),{once:true}));}
 window.NexusAdminFacilityAccess={syncEdit,reset:syncCreate,newScope:()=>create.select.value,newAdditional:()=>$('newRole').value==='FACILITY'&&!create.wrapper.hidden?checkedCodes(create.additionalList):[],editScope:()=>$('editUserRole').value==='FACILITY'&&!edit.wrapper.hidden?edit.select.value:$('editUserScope').value.trim(),editAdditional:()=>$('editUserRole').value==='FACILITY'&&!edit.wrapper.hidden?checkedCodes(edit.additionalList):[],choose};
})();
