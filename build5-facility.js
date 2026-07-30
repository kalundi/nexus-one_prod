(function(){
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=n=>window.NexusCore?.money?.(n)||'$'+Number(n||0).toFixed(2);
  const trips=()=>window.NexusCore?.getTrips?.()||[];
  const saveTrips=t=>{localStorage.setItem('nexusTrips',JSON.stringify(t));window.dispatchEvent(new Event('nexus-trips-updated'))};
  const facility=window.NexusFacility;
  if(!facility) return;

  function facilityTrips(){
    const profile=facility.getProfile();
    return trips().filter(t=>!t.facilityId||t.facilityId===profile.id||String(t.facility||'').toLowerCase().includes(profile.name.toLowerCase().split(' ')[0]));
  }
  function statusClass(status){const s=String(status||'').toLowerCase();return s.includes('complete')||s.includes('paid')?'green':s.includes('route')||s.includes('transit')||s.includes('arrived')?'blue':s.includes('cancel')||s.includes('denied')?'red':'amber'}
  function renderMetrics(){
    const all=facilityTrips();
    const active=all.filter(t=>!['Completed','Billed','Paid','Cancelled'].includes(t.status)).length;
    const pending=all.filter(t=>['Requested','Quoted','Scheduled'].includes(t.status)).length;
    const completed=all.filter(t=>['Completed','Billed','Paid'].includes(t.status)).length;
    const invoiced=all.filter(t=>['Billed','Paid'].includes(t.status)).reduce((s,t)=>s+Number(t.quote?.total||t.total||0),0);
    $('#metricTrips').textContent=String(all.length);
    $('#metricPending').textContent=String(pending);
    $('#metricActive').textContent=String(active);
    $('#metricBilled').textContent=money(invoiced);
    $('#completedCount').textContent=String(completed);
  }
  function renderTrips(){
    const body=$('#facilityTripsBody'); if(!body)return;
    const all=facilityTrips().sort((a,b)=>String(a.pickupTime||a.createdAt||'').localeCompare(String(b.pickupTime||b.createdAt||'')));
    body.innerHTML=all.length?all.map(t=>`<tr><td><strong>${esc(t.patientName||t.patient||'Patient')}</strong><br><small>${esc(t.id||'—')}</small></td><td>${esc(t.pickupTime||t.scheduledPickup||'Pending')}</td><td>${esc(t.serviceLabel||t.service||'Transportation')}</td><td><span class="status ${statusClass(t.status)}">${esc(t.status||'Requested')}</span></td><td>${esc(t.eta||'Pending')}</td><td>${money(t.quote?.total||t.total||0)}</td></tr>`).join(''):`<tr><td colspan="6">No facility trips are stored yet. Use “Schedule transportation” to create one.</td></tr>`;
  }
  function renderPatients(){
    const body=$('#patientRosterBody');const select=$('#ridePatient'); if(!body||!select)return;
    const patients=facility.getPatients();
    body.innerHTML=patients.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.id)}</small></td><td>${esc(p.mobility)}</td><td>${esc(p.payer)}</td><td>${esc(p.notes||'—')}</td><td><button class="button compact secondary" data-remove-patient="${esc(p.id)}">Remove</button></td></tr>`).join('');
    select.innerHTML='<option value="">Select patient</option>'+patients.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.mobility)}</option>`).join('');
    const recurringSelect=$('#recurringPatient');if(recurringSelect) recurringSelect.innerHTML='<option value="">Select patient</option>'+patients.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.mobility)}</option>`).join('');
    $$('[data-remove-patient]').forEach(btn=>btn.addEventListener('click',()=>{facility.savePatients(patients.filter(p=>p.id!==btn.dataset.removePatient));renderPatients()}));
  }
  function renderRecurring(){
    const body=$('#recurringBody');if(!body)return;
    const records=facility.getRecurring();
    body.innerHTML=records.length?records.map(r=>`<tr><td><strong>${esc(r.patient)}</strong><br><small>${esc(r.id)}</small></td><td>${esc(r.days.join(', '))}</td><td>${esc(r.pickupTime)} / ${esc(r.returnTime||'One way')}</td><td>${esc(r.destination)}</td><td><span class="status ${r.status==='Active'?'green':'amber'}">${esc(r.status)}</span></td><td><button class="button compact secondary" data-toggle-recurring="${esc(r.id)}">${r.status==='Active'?'Pause':'Activate'}</button></td></tr>`).join(''):`<tr><td colspan="6">No recurring schedules.</td></tr>`;
    $$('[data-toggle-recurring]').forEach(btn=>btn.addEventListener('click',()=>{facility.saveRecurring(records.map(r=>r.id===btn.dataset.toggleRecurring?{...r,status:r.status==='Active'?'Paused':'Active'}:r));renderRecurring()}));
  }
  function renderAccount(){
    const p=facility.getProfile();
    $('#facilityName').textContent=p.name;$('#accountNumber').textContent=p.accountNumber;$('#billingTerms').textContent=p.terms;$('#billingType').textContent=p.billingType;$('#creditLimit').textContent=money(p.creditLimit);
  }
  function openDialog(id){const d=$(id);if(d?.showModal)d.showModal()}
  function closeDialog(dialog){dialog?.close?.()}

  $('#openPatient')?.addEventListener('click',()=>openDialog('#patientDialog'));$$('[data-open-patient]').forEach(b=>b.addEventListener('click',()=>openDialog('#patientDialog')));
  $('#openRecurring')?.addEventListener('click',()=>openDialog('#recurringDialog'));$$('[data-open-recurring]').forEach(b=>b.addEventListener('click',()=>openDialog('#recurringDialog')));
  $('#openRide')?.addEventListener('click',()=>openDialog('#rideDialog'));$$('[data-open-ride]').forEach(b=>b.addEventListener('click',()=>openDialog('#rideDialog')));
  $$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));

  $('#patientForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const list=facility.getPatients();list.push({id:facility.uid('P'),name:fd.get('name'),mobility:fd.get('mobility'),payer:fd.get('payer'),notes:fd.get('notes')});facility.savePatients(list);e.currentTarget.reset();closeDialog($('#patientDialog'));renderPatients();$('#facilityNotice').textContent='Patient profile added.'});
  $('#recurringForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const patient=facility.getPatients().find(p=>p.id===fd.get('patientId'));const days=$$('input[name="days"]:checked').map(x=>x.value);if(!patient||!days.length){$('#recurringNotice').textContent='Select a patient and at least one service day.';return}const list=facility.getRecurring();list.push({id:facility.uid('REC'),patientId:patient.id,patient:patient.name,service:fd.get('service'),days,pickupTime:fd.get('pickupTime'),returnTime:fd.get('returnTime'),pickup:fd.get('pickup'),destination:fd.get('destination'),startDate:fd.get('startDate'),status:'Active'});facility.saveRecurring(list);e.currentTarget.reset();closeDialog($('#recurringDialog'));renderRecurring();$('#facilityNotice').textContent='Recurring schedule created.'});
  $('#rideForm')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const patient=facility.getPatients().find(p=>p.id===fd.get('patientId'));if(!patient)return;const pricing=window.NexusCore?.getPricing?.()||{};const rate=pricing[fd.get('service')]||{base:95,perMile:4.25,includedMiles:10};const miles=Number(fd.get('miles')||0);const total=Number(rate.base||0)+Math.max(0,miles-Number(rate.includedMiles||0))*Number(rate.perMile||0);const profile=facility.getProfile();const all=trips();all.push({id:facility.uid('TRIP'),facilityId:profile.id,facility:profile.name,patientId:patient.id,patientName:patient.name,service:fd.get('service'),pickup:fd.get('pickup'),destination:fd.get('destination'),pickupTime:fd.get('pickupTime'),tripType:fd.get('tripType'),status:'Requested',payer:fd.get('payer'),notes:fd.get('notes'),miles,quote:{total:Number(total.toFixed(2))},createdAt:new Date().toISOString()});saveTrips(all);e.currentTarget.reset();closeDialog($('#rideDialog'));refresh();$('#facilityNotice').textContent='Transportation request submitted to Dispatch.'});
  $('#exportFacility')?.addEventListener('click',()=>{const rows=facilityTrips();const csv=['Trip ID,Patient,Pickup,Destination,Status,Amount',...rows.map(t=>[t.id,t.patientName,t.pickup,t.destination,t.status,t.quote?.total||0].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nexus-facility-transport-report.csv';a.click();URL.revokeObjectURL(a.href)});
  function refresh(){renderMetrics();renderTrips();renderPatients();renderRecurring();renderAccount()}
  window.addEventListener('storage',refresh);window.addEventListener('nexus-trips-updated',refresh);refresh();
})();

(function placeFacilityLanguageSelector(){
  function move(){
    const slot=document.getElementById('facilityLanguageSlot');
    const control=document.querySelector('.nexusLanguageControl');
    if(slot&&control&&control.parentElement!==slot){
      slot.appendChild(control);
      control.classList.add('headerLanguageGlobal');
      control.setAttribute('aria-label','Select language');
    }
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',()=>setTimeout(move,0)):setTimeout(move,0);
  window.addEventListener('load',move);
})();
