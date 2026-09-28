(()=>{'use strict';
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=v=>v?new Date(v).toLocaleString():'—',label=v=>String(v).replaceAll('_',' ').toLowerCase();
 let assignments=[],records=[],selected=null,verifyId=null,blobUrl=null,ackText='';
 async function api(path,body){
  const response=await fetch('/api/training'+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${sessionStorage.getItem('nexusAccessToken')||''}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  if(response.status===401||response.status===403){$('#workspace').hidden=true;$('#learningDialog').close();$('#verifyDialog').close();if(blobUrl)URL.revokeObjectURL(blobUrl);$('#resource').replaceChildren();}
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Unable to complete request')}
  return response.headers.get('content-type')?.includes('application/pdf')?response.blob():response.json();
 }
 async function load(){
  try{const data=await api('');assignments=data.assignments;ackText=data.acknowledgment;$('#workspace').hidden=false;$('#administration').hidden=!data.isAdmin;$('#adminLink').hidden=!data.isAdmin;
   document.querySelector('nav a').href=({ADMIN:'/admin.html',DRIVER:'/driver-app.html',DISPATCHER:'/dispatch.html',BILLING:'/billing.html',QA:'/qa.html',EXECUTIVE:'/executive.html',STAFF:'/training.html'})[document.documentElement.dataset.authorizedRole]||'/';
   $('#summary').innerHTML=[['Assigned',assignments.length],['Complete',assignments.filter(a=>a.status==='COMPLETE').length],['Overdue',assignments.filter(a=>a.status==='OVERDUE').length],['Awaiting verification',assignments.filter(a=>a.status==='AWAITING_VERIFICATION').length]].map(([name,count])=>`<div class="metric"><strong>${count}</strong><span>${name}</span></div>`).join('');
   $('#assignmentList').innerHTML=assignments.length?assignments.map(a=>`<article class="assignment"><span class="badge ${esc(a.status)}">${esc(label(a.status))}</span><h3>${esc(a.title)}</h3><p>${esc(a.kind)} · Version ${esc(a.version)} · ${esc(a.cycle)}</p><p>Due ${esc(date(a.due_at))}</p>${a.acknowledged_at?`<p>Acknowledged ${esc(date(a.acknowledged_at))}</p>`:''}<button data-open="${esc(a.id)}">${a.acknowledged_at?'Review material':'Open assignment'}</button></article>`).join(''):'<p class="empty">No training has been assigned to you yet. Your administrator will assign the policies and training required for your role.</p>';
   $('#message').textContent='';if(data.isAdmin)await loadAdmin();
  }catch(error){$('#message').textContent=error.message}
 }
 async function loadAdmin(){
  const [materials,staff,report]=await Promise.all([api('/admin/materials'),api('/admin/staff'),api('/admin/report')]);
  const form=$('#assignForm'),prior=form.elements.materialId.value;
  form.elements.materialId.innerHTML='<option value="">Choose a material</option>'+materials.materials.map(m=>`<option value="${esc(m.id)}">${esc(m.title)} — ${esc(m.version)}</option>`).join('');if(prior)form.elements.materialId.value=prior;
  const chosen=new Set([...form.elements.userIds.selectedOptions].map(o=>o.value));
  form.elements.userIds.innerHTML=staff.staff.map(u=>`<option value="${esc(u.id)}" ${chosen.has(u.id)?'selected':''}>${esc(u.display_name||u.email)} (${esc(u.role)})</option>`).join('');records=report.records;renderReport();await window.loadContractWorkspace();
 }
 function renderReport(){const term=$('#reportFilter').value.trim().toLowerCase();const filtered=records.filter(r=>[r.display_name,r.email,r.title,r.status,r.cycle].join(' ').toLowerCase().includes(term));
  $('#reportRows').innerHTML=filtered.length?filtered.map(r=>`<tr><td>${esc(r.display_name||r.email)}<small>${esc(r.email)}${r.active?'':' · inactive'}</small></td><td>${esc(r.title)}<small>Version ${esc(r.version)} · ${esc(r.cycle)}</small></td><td>${esc(date(r.due_at))}</td><td><span class="badge ${esc(r.status)}">${esc(label(r.status))}</span></td><td>${esc(date(r.acknowledged_at))}<small>${esc(r.acknowledged_name||'')}</small></td><td>${r.verified_at?`${esc(date(r.verified_at))}<small>${esc(r.verified_by_name)}: ${esc(r.verification_notes)}</small>`:r.status==='AWAITING_VERIFICATION'?`<button data-verify="${esc(r.id)}">Verify</button>`:r.requires_verification?'Required':'Not required'}</td></tr>`).join(''):'<tr><td colspan="6">No matching training records.</td></tr>';
 }
 async function openAssignment(id){selected=assignments.find(a=>a.id===id);if(!selected)return;
  $('#learningTitle').textContent=selected.title+' · '+selected.version;$('#learningDescription').textContent=selected.description;$('#resource').textContent='Loading material…';$('#ackForm').hidden=true;$('#ackForm').reset();$('#ackForm .formStatus').textContent='';$('#recorded').textContent='';$('#learningDialog').showModal();
  try{const data=await api(`/assignments/${id}/open`,{});if(selected?.id!==id||!$('#learningDialog').open)return;if(blobUrl)URL.revokeObjectURL(blobUrl);
   if(data.resourceUrl){$('#resource').innerHTML=`<a href="${esc(data.resourceUrl)}" target="_blank" rel="noopener noreferrer">Open assigned reading or video in a new tab ↗</a>`;}
   else{const blob=await api(`/assignments/${id}/file`);if(selected?.id!==id||!$('#learningDialog').open)return;blobUrl=URL.createObjectURL(blob);$('#resource').innerHTML=`<iframe title="Assigned policy PDF" src="${blobUrl}"></iframe><a href="${blobUrl}" target="_blank" rel="noopener">Open PDF in a new tab</a>`;}
   $('#ackText').textContent=ackText;$('#ackForm').hidden=Boolean(selected.acknowledged_at);$('#recorded').textContent=selected.acknowledged_at?`Acknowledged by ${selected.acknowledged_name} on ${date(selected.acknowledged_at)}.`:'';
  }catch(error){$('#resource').textContent=error.message}
 }
 function submit(form,work){form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('[type=submit]'),status=form.querySelector('.formStatus');button.disabled=true;status.textContent='Saving…';try{status.textContent=await work(form)}catch(error){status.textContent=error.message}finally{button.disabled=false}})}
 submit($('#ackForm'),async form=>{await api(`/assignments/${selected.id}/acknowledge`,{name:form.elements.name.value,accepted:form.elements.accepted.checked});$('#ackForm').hidden=true;$('#recorded').textContent=selected.requires_verification?'Your submission has been recorded and is awaiting administrator approval.':'Your acknowledgment has been recorded.';await load();return ''});
 submit($('#materialForm'),async form=>{const b=Object.fromEntries(new FormData(form));delete b.file;b.requiresExternalEvidence=form.elements.requiresExternalEvidence.checked;const file=form.elements.file.files[0];if(file){if(file.size>4*1024*1024)throw Error('PDF must be at most 4 MB');b.dataBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Unable to read PDF'));reader.readAsDataURL(file)})}await api('/admin/materials',b);form.reset();await loadAdmin();return 'Material saved. Assign it to the appropriate staff.'});
 submit($('#assignForm'),async form=>{const data=await api('/admin/assignments',{materialId:form.elements.materialId.value,userIds:[...form.elements.userIds.selectedOptions].map(o=>o.value),cycle:form.elements.cycle.value,dueAt:new Date(form.elements.dueAt.value+'T23:59:59').toISOString(),requiresVerification:form.elements.requiresVerification.checked});await load();return `${data.assigned} assignments created. Existing assignments in this cycle were preserved.`});
 submit($('#verifyForm'),async form=>{await api(`/admin/verify/${verifyId}`,{notes:form.elements.notes.value});$('#verifyDialog').close();await load();return ''});
 $('#selectAll').onclick=()=>{for(const option of $('#assignForm').elements.userIds.options)option.selected=true};
 $('#assignmentList').onclick=event=>{const b=event.target.closest('[data-open]');if(b)openAssignment(b.dataset.open)};
 $('#reportRows').onclick=event=>{const b=event.target.closest('[data-verify]');if(b){verifyId=b.dataset.verify;$('#verifyForm').reset();$('#verifyForm .formStatus').textContent='';$('#verifyDialog').showModal()}};
 $('#cancelVerify').onclick=()=>$('#verifyDialog').close();$('#closeLearning').onclick=()=>$('#learningDialog').close();$('#learningDialog').addEventListener('close',()=>{if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}$('#resource').replaceChildren()});
 $('#reportFilter').oninput=renderReport;$('#refresh').onclick=load;
 $('#export').onclick=()=>{const fields=['id','user_id','display_name','email','role','active','title','policy_key','version','content_hash','cycle','assigned_at','assigned_by','due_at','status','opened_at','acknowledged_at','acknowledged_name','acknowledgment_text','requires_verification','verified_at','verified_by','verified_by_name','verification_notes'];const csvCell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const csv=[fields,...records.map(r=>fields.map(k=>r[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='nexus-training-records.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 if(document.documentElement.dataset.authState==='authorized')load();else window.addEventListener('nexus:authorized',load,{once:true});
})();
