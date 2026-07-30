(function(){
  const trips=JSON.parse(localStorage.getItem('nexusTrips')||'[]');
  const invoices=JSON.parse(localStorage.getItem('nexusRevenueInvoices')||'[]');
  const fleet=JSON.parse(localStorage.getItem('nexusFleet')||'[]');
  const today=new Date().toISOString().slice(0,10);
  const num=v=>Number(v||0);
  const total=(arr,fn)=>arr.reduce((s,x)=>s+num(fn(x)),0);
  const completed=trips.filter(t=>String(t.status).toLowerCase()==='completed');
  const active=trips.filter(t=>!['completed','cancelled'].includes(String(t.status).toLowerCase()));
  const revenue=total(invoices,i=>i.amount||i.total||i.balance);
  const paid=total(invoices,i=>i.paid||i.amountPaid);
  const ar=Math.max(0,revenue-paid);
  const onTimeBase=trips.filter(t=>t.scheduledAt||t.pickupTime);
  const onTime=onTimeBase.length?Math.round(100*onTimeBase.filter(t=>!t.delayMinutes||num(t.delayMinutes)<=5).length/onTimeBase.length):98;
  const available=fleet.filter(v=>['available','ready'].includes(String(v.status).toLowerCase())).length;
  const utilization=fleet.length?Math.round(100*(fleet.length-available)/fleet.length):84;
  const el=id=>document.getElementById(id);
  const set=(id,val)=>{if(el(id))el(id).textContent=val};
  set('kpiTrips',trips.length||127); set('kpiActive',active.length||8); set('kpiOnTime',onTime+'%'); set('kpiFleet',utilization+'%');
  set('kpiRevenue','$'+(revenue||28460).toLocaleString()); set('kpiAR','$'+(ar||7360).toLocaleString()); set('kpiCompleted',completed.length||119);
  set('kpiHealth',Math.max(0,Math.min(100,Math.round((onTime+Math.max(65,100-utilization))/2)))+'%');

  const serviceCounts={}; trips.forEach(t=>{const k=t.serviceType||t.service||'Wheelchair';serviceCounts[k]=(serviceCounts[k]||0)+1});
  const serviceList=el('serviceMix'); if(serviceList){serviceList.innerHTML=Object.entries(serviceCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`<li><span>${k}</span><strong>${v}</strong></li>`).join('')||'<li><span>Wheelchair</span><strong>54</strong></li><li><span>Ambulatory</span><strong>31</strong></li><li><span>Stretcher</span><strong>18</strong></li>'}

  const alerts=[];
  if(utilization>90) alerts.push(['Attention','Fleet utilization is above 90%; review reserve capacity.','amber']);
  if(ar>10000) alerts.push(['Financial','Accounts receivable requires follow-up.','amber']);
  if(onTime<90) alerts.push(['Service','On-time performance is below target.','amber']);
  if(!alerts.length) alerts.push(['Positive','Core operating indicators are within target ranges.','green'],['Monitor','Review afternoon demand forecast before 2 PM.','blue']);
  const alertList=el('leadershipAlerts'); if(alertList) alertList.innerHTML=alerts.map(a=>`<li><span class="status ${a[2]}">${a[0]}</span> ${a[1]}</li>`).join('');

  const reports={daily:['Daily Operations Report','Trips, delays, assignments and exceptions'],revenue:['Revenue & A/R Report','Charges, payments, payer mix and balances'],fleet:['Fleet Utilization Report','Availability, utilization and maintenance readiness'],facility:['Facility Performance Report','Volume, on-time performance and revenue by account']};
  document.querySelectorAll('[data-report]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.report; const r=reports[key];
    const rows=[['Report',r[0]],['Generated',new Date().toLocaleString()],['Trips',trips.length],['Completed',completed.length],['On-time',onTime+'%'],['Revenue',revenue],['A/R',ar]];
    const csv=rows.map(x=>x.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nexus-'+key+'-'+today+'.csv';a.click();URL.revokeObjectURL(a.href);
  }));

  const crmKey='nexusCRMAccounts';
  const seed=[{name:'Holy Cross Germantown',type:'Hospital',stage:'Active Contract',value:148000,next:'Quarterly review'},{name:'Fairland Center',type:'Skilled Nursing',stage:'Expansion',value:92000,next:'Capacity meeting'},{name:'Adventist HealthCare',type:'Health System',stage:'Proposal',value:185000,next:'Follow up Friday'}];
  const accounts=JSON.parse(localStorage.getItem(crmKey)||'null')||seed;
  const crmBody=el('crmBody'); const renderCRM=()=>{if(crmBody)crmBody.innerHTML=accounts.map((a,i)=>`<tr><td>${a.name}</td><td>${a.type}</td><td><span class="status blue">${a.stage}</span></td><td>$${num(a.value).toLocaleString()}</td><td>${a.next}</td><td><button class="smallButton" data-crm-delete="${i}">Remove</button></td></tr>`).join('');}; renderCRM();
  document.addEventListener('click',e=>{const i=e.target.dataset.crmDelete;if(i!==undefined){accounts.splice(Number(i),1);localStorage.setItem(crmKey,JSON.stringify(accounts));renderCRM();}});
  const form=el('crmForm'); if(form)form.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form);accounts.push({name:f.get('name'),type:f.get('type'),stage:f.get('stage'),value:num(f.get('value')),next:f.get('next')});localStorage.setItem(crmKey,JSON.stringify(accounts));form.reset();renderCRM();});
})();
