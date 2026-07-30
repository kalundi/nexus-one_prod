const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const access=$('#accessToggle'),panel=$('#accessPanel');
if(access){access.addEventListener('click',()=>{const open=!panel.classList.contains('open');panel.classList.toggle('open',open);panel.hidden=!open;access.setAttribute('aria-expanded',String(open))});}
$('#large')?.addEventListener('click',()=>document.body.classList.toggle('large'));
$('#contrast')?.addEventListener('click',()=>document.body.classList.toggle('contrast'));
$('#motion')?.addEventListener('click',()=>document.body.classList.toggle('reduce'));
$$('[data-api-list]').forEach(async el=>{const endpoint=el.dataset.apiList;const key=sessionStorage.getItem('nexusAdminKey')||'';try{const r=await fetch(endpoint,{headers:{'x-admin-key':key}});if(r.status===401){el.innerHTML='<p>Enter the operations key to load live data.</p>';return}const j=await r.json();el.dispatchEvent(new CustomEvent('nexus-data',{detail:j}));}catch{el.innerHTML='<p>Live data is unavailable.</p>'}});
