(()=>{'use strict';
 const $=id=>document.getElementById(id);
 function field(id){const wrapper=document.createElement('div');wrapper.className='formField';wrapper.hidden=true;const label=document.createElement('label');label.htmlFor=id;label.textContent='Assigned facility *';const select=document.createElement('select');select.id=id;const help=document.createElement('small');help.textContent='This manager can access only the selected facility.';wrapper.append(label,select,help);return {wrapper,select,help};}
 const create=field('newUserFacility'),edit=field('editUserFacility');
 $('newRole').closest('.formField').after(create.wrapper);$('editUserScope').closest('.formField').after(edit.wrapper);
 let pending;
 async function load(select,selected=''){
  select.disabled=true;select.replaceChildren(new Option('Loading active facilities…',''));
  try{
   if(!pending)pending=fetch('/api/facilities',{headers:{authorization:'Bearer '+(sessionStorage.getItem('nexusAccessToken')||'')},cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load facilities.');return (data.facilities||[]).filter(f=>f.active===true);}).finally(()=>{pending=null;});
   const facilities=await pending;select.replaceChildren(new Option(facilities.length?'Select the manager’s facility':'No active facilities available',''));
   facilities.forEach(f=>select.add(new Option(f.name+' — '+f.facility_code+(f.address?' · '+f.address:''),f.facility_code)));
   if(facilities.some(f=>f.facility_code===selected))select.value=selected;
   else if(selected){const missing=new Option('Previous facility unavailable — select an active facility','');missing.selected=true;select.add(missing);}
  }catch(error){select.replaceChildren(new Option(error.message+' Reopen to retry.',''));}finally{select.disabled=false;}
 }
 function syncCreate(){const facility=$('newRole').value==='FACILITY';create.wrapper.hidden=!facility;create.select.required=facility;if(facility)load(create.select,create.select.value);else create.select.value='';}
 function syncEdit(demoOnly=false){const facility=$('editUserRole').value==='FACILITY'&&!demoOnly;edit.wrapper.hidden=!facility;edit.select.required=facility;$('editUserScope').closest('.formField').hidden=facility;if(facility)load(edit.select,$('editUserScope').value);}
 $('newRole').addEventListener('change',syncCreate);$('editUserRole').addEventListener('change',()=>syncEdit(false));
 const dialog=document.createElement('dialog');dialog.className='userDialog';dialog.setAttribute('aria-labelledby','approveFacilityTitle');dialog.innerHTML='<form method="dialog"><h3 id="approveFacilityTitle">Approve facility manager access</h3><p>Select the facility this manager is authorized to access.</p><div class="formField"><label for="approveUserFacility">Assigned facility *</label><select id="approveUserFacility" required></select></div><p class="scheduleHelp">Access is limited to this facility.</p><div class="userDialogActions"><button type="button" class="button secondary" id="cancelFacilityApproval">Cancel</button><button class="button primary" value="approve">Approve selected facility</button></div></form>';document.body.append(dialog);
 $('cancelFacilityApproval').addEventListener('click',()=>dialog.close('cancel'));
 async function choose(){await load($('approveUserFacility'));dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='approve'?$('approveUserFacility').value:''),{once:true}));}
 window.NexusAdminFacilityAccess={syncEdit,reset:syncCreate,newScope:()=>create.select.value,editScope:()=>$('editUserRole').value==='FACILITY'&&!edit.wrapper.hidden?edit.select.value:$('editUserScope').value.trim(),choose};
})();
