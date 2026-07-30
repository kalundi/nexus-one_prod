(function(){
 const N=window.NexusPatient; if(!N)return;
 const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const statusClass=s=>/complete|paid/i.test(s)?'green':/cancel|late/i.test(s)?'red':/confirm|transit|arriv|route/i.test(s)?'blue':'amber';
 function upcoming(){return N.trips().filter(t=>!/complete|cancel/i.test(t.status)).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));}
 function render(){
  const trips=N.trips(), up=upcoming(), completed=trips.filter(t=>/complete/i.test(t.status));
  $('#upcomingCount').textContent=up.length; $('#completedCount').textContent=completed.length;
  const notes=N.read(N.KEYS.notifications,[]); $('#notificationCount').textContent=notes.filter(n=>!n.read).length;
  const p=N.read(N.KEYS.profile,{}); $('#profileSummary').innerHTML=`<div><dt>Name</dt><dd>${esc(p.name)}</dd></div><div><dt>Mobility</dt><dd>${esc(p.mobility)}</dd></div><div><dt>Preferred language</dt><dd>${esc(p.language)}</dd></div><div><dt>Default pickup</dt><dd>${esc(p.pickup)}</dd></div>`;
  $('#nextTrip').innerHTML=up.length?tripCard(up[0],true):'<p class="notice">No upcoming transportation is scheduled.</p>';
  $('#rideRows').innerHTML=trips.map(t=>`<tr><td><strong>${esc(t.id)}</strong><br><small>${esc(t.date)} ${esc(t.time)}</small></td><td>${esc(t.pickup)}<br><small>to ${esc(t.destination)}</small></td><td>${esc(t.service)}</td><td><span class="status ${statusClass(t.status)}">${esc(t.status)}</span></td><td>${/complete/i.test(t.status)?`$${Number(t.fare||0).toFixed(2)}`:`<a class="button compact" href="/livecare.html?trip=${encodeURIComponent(t.id)}">Track</a>`}</td></tr>`).join('')||'<tr><td colspan="5">No rides found.</td></tr>';
  $('#contactList').innerHTML=N.read(N.KEYS.contacts,[]).map(c=>`<div class="manifestItem"><span><strong>${esc(c.name)}</strong><small>${esc(c.relationship)} · ${esc(c.phone)}</small></span><span class="status ${c.notify?'green':'amber'}">${c.notify?'Updates on':'Updates off'}</span></div>`).join('');
  $('#documentList').innerHTML=N.read(N.KEYS.docs,[]).map(d=>`<div class="manifestItem"><span><strong>${esc(d.name)}</strong><small>${esc(d.type)} · Updated ${esc(d.updated)}</small></span><button class="button compact secondary" data-remove-doc="${esc(d.id)}">Remove</button></div>`).join('')||'<p>No documents have been added.</p>';
  $('#notificationList').innerHTML=notes.map(n=>`<div class="message ${n.read?'':'dispatch'}"><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${esc(n.time)}</small></div>`).join('');
 }
 function tripCard(t,next){return `<p><span class="status ${statusClass(t.status)}">${esc(t.status)}</span></p><h3>${esc(t.pickup)} → ${esc(t.destination)}</h3><dl class="detailList"><div><dt>Date and time</dt><dd>${esc(t.date)} at ${esc(t.time)}</dd></div><div><dt>Service</dt><dd>${esc(t.service)}</dd></div><div><dt>Driver</dt><dd>${esc(t.driver||'Pending assignment')}</dd></div><div><dt>Vehicle</dt><dd>${esc(t.vehicle||'Pending')}</dd></div></dl>${next?`<div class="toolbar"><a class="button" href="/livecare.html?trip=${encodeURIComponent(t.id)}">Open LiveCare</a><button class="button secondary" id="shareNext" data-trip="${esc(t.id)}">Share tracking</button></div>`:''}`}
 function open(id){const d=$(id); if(d?.showModal)d.showModal()}
 document.addEventListener('click',e=>{
  const a=e.target.closest('[data-open]');if(a)open(a.dataset.open);
  if(e.target.matches('[data-close]'))e.target.closest('dialog').close();
  if(e.target.id==='markRead'){const ns=N.read(N.KEYS.notifications,[]).map(n=>({...n,read:true}));N.write(N.KEYS.notifications,ns);render()}
  const r=e.target.closest('[data-remove-doc]');if(r){N.write(N.KEYS.docs,N.read(N.KEYS.docs,[]).filter(d=>d.id!==r.dataset.removeDoc));render()}
  const s=e.target.closest('#shareNext');if(s){const token=N.createShare(s.dataset.trip);navigator.clipboard?.writeText(`${location.origin}/livecare.html?share=${token}`);$('#portalNotice').textContent=`Secure 24-hour tracking link created: ${token}`;}
 });
 $('#profileForm').addEventListener('submit',e=>{e.preventDefault();N.write(N.KEYS.profile,Object.fromEntries(new FormData(e.target)));e.target.closest('dialog').close();render();$('#portalNotice').textContent='Profile updated.'});
 $('#contactForm').addEventListener('submit',e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.target));x.id='EC-'+Date.now();x.notify=Boolean(e.target.notify.checked);N.write(N.KEYS.contacts,[...N.read(N.KEYS.contacts,[]),x]);e.target.reset();e.target.closest('dialog').close();render()});
 $('#documentForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target),f=fd.get('file');const docs=N.read(N.KEYS.docs,[]);docs.push({id:'DOC-'+Date.now(),name:f?.name||'Document',type:fd.get('type'),updated:new Date().toISOString().slice(0,10)});N.write(N.KEYS.docs,docs);e.target.reset();e.target.closest('dialog').close();render();$('#portalNotice').textContent='Document metadata saved for this prototype.'});
 render();
})();
