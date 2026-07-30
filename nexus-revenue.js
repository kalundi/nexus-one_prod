(function(){
 const CLAIMS_KEY='nexusClaims',PAYMENTS_KEY='nexusPayments';
 const get=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}};
 const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
 const normalizePayer=(value='Self-pay')=>{
  const v=String(value).toLowerCase();
  if(v.includes('medicaid')) return 'Medicaid';
  if(v.includes('medicare')) return 'Medicare';
  if(v.includes('worker')) return 'Workers Compensation';
  if(v.includes('facility')) return 'Facility Account';
  if(v.includes('insurance')) return 'Commercial Insurance';
  return 'Self-pay';
 };
 const claimType=(payer)=>payer==='Self-pay'?'Invoice':payer==='Facility Account'?'Facility Invoice':'CMS-1500 Draft';
 const makeClaim=(trip)=>{
  const payer=normalizePayer(trip.payer);
  const amount=Number(trip.quote?.total)||0;
  return {
   id:`CLM-${String(trip.reference||Date.now()).replace(/[^A-Za-z0-9]/g,'').slice(-10)}`,
   tripId:trip.reference||trip.id,
   patient:trip.patientName||trip.name||'Patient',
   payer,
   type:claimType(payer),
   amount,
   paid:0,
   balance:amount,
   status:payer==='Self-pay'?'Ready to invoice':'Draft',
   createdAt:new Date().toISOString(),
   serviceDate:trip.date||trip.pickupDate||'',
   service:trip.service||'Transportation',
   pickup:trip.pickup||'',destination:trip.destination||'',
   diagnosis:trip.diagnosis||'',memberId:trip.memberId||'',authorization:trip.authorization||''
  };
 };
 function syncClaims(trips){
  const existing=get(CLAIMS_KEY),byTrip=new Map(existing.map(c=>[c.tripId,c]));
  trips.forEach(t=>{if(!byTrip.has(t.reference||t.id)){const c=makeClaim(t);existing.unshift(c);byTrip.set(c.tripId,c)}});
  save(CLAIMS_KEY,existing);return existing;
 }
 function updateClaim(id,patch){const claims=get(CLAIMS_KEY),i=claims.findIndex(c=>c.id===id);if(i<0)return null;claims[i]={...claims[i],...patch,updatedAt:new Date().toISOString()};claims[i].balance=Math.max(0,(Number(claims[i].amount)||0)-(Number(claims[i].paid)||0));save(CLAIMS_KEY,claims);return claims[i]}
 function recordPayment({claimId,amount,method='Manual',reference=''}){
  const claims=get(CLAIMS_KEY),claim=claims.find(c=>c.id===claimId);if(!claim)throw new Error('Claim not found');
  const value=Math.max(0,Number(amount)||0);const paid=Math.min((Number(claim.paid)||0)+value,Number(claim.amount)||0);
  updateClaim(claimId,{paid,status:paid>=claim.amount?'Paid':'Partially paid'});
  const payments=get(PAYMENTS_KEY);payments.unshift({id:`PMT-${Date.now()}`,claimId,tripId:claim.tripId,amount:value,method,reference,postedAt:new Date().toISOString()});save(PAYMENTS_KEY,payments);return payments[0]
 }
 const getClaims=()=>get(CLAIMS_KEY),getPayments=()=>get(PAYMENTS_KEY);
 function printDocument(claim){
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const win=window.open('','_blank','noopener,noreferrer');if(!win)return false;
  win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(claim.type)} ${esc(claim.id)}</title><style>body{font:14px Arial;margin:32px;color:#102236}header{border-bottom:4px solid #082f49;padding-bottom:16px}h1{color:#082f49}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:10px;border:1px solid #aaa;text-align:left}.total{font-size:22px;font-weight:bold}.note{margin-top:24px;padding:12px;background:#f3f7fa}@media print{button{display:none}}</style></head><body><header><h1>Nexus Medical Transit LLC</h1><p>Revenue Cycle Document — ${esc(claim.type)}</p></header><h2>${esc(claim.id)}</h2><table><tr><th>Trip reference</th><td>${esc(claim.tripId)}</td><th>Service date</th><td>${esc(claim.serviceDate||'Not entered')}</td></tr><tr><th>Patient</th><td>${esc(claim.patient)}</td><th>Payer</th><td>${esc(claim.payer)}</td></tr><tr><th>Service</th><td>${esc(claim.service)}</td><th>Status</th><td>${esc(claim.status)}</td></tr><tr><th>Pickup</th><td>${esc(claim.pickup)}</td><th>Destination</th><td>${esc(claim.destination)}</td></tr><tr><th>Member ID</th><td>${esc(claim.memberId||'Not entered')}</td><th>Authorization</th><td>${esc(claim.authorization||'Not entered')}</td></tr><tr><th>Diagnosis</th><td>${esc(claim.diagnosis||'Not entered')}</td><th>Amount</th><td class="total">${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(claim.amount)}</td></tr></table><p class="note">Prototype draft for operational review. Validate payer rules, coding, signatures, medical necessity documentation and clearinghouse requirements before submission.</p><button onclick="window.print()">Print / Save PDF</button></body></html>`);win.document.close();return true
 }
 window.NexusRevenue={syncClaims,getClaims,getPayments,updateClaim,recordPayment,printDocument,normalizePayer};
})();
