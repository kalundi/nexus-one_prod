(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const add=(row,value)=>{const td=document.createElement('td');td.textContent=String(value);td.style.padding='8px';td.style.borderBottom='1px solid #dbe4ef';row.appendChild(td)};
 async function refresh(){
  el('groupHealth').textContent='Loading authorized group activity…';
  const token=sessionStorage.getItem('nexusAccessToken')||'';
  if(!token){el('groupHealth').textContent='Administrator sign-in required.';return}
  try{
   const res=await fetch('/.netlify/functions/nex-group-status',{headers:{authorization:'Bearer '+token},cache:'no-store'});
   if(!res.ok)throw Error(res.status===401||res.status===403?'Administrator access required.':'Group monitoring is not yet configured.');
   const data=await res.json();
   if(data.policy?.autoReply!==false||data.policy?.messageBodiesStored!==false)throw Error('Unexpected privacy policy; contact the administrator.');
   const events=Array.isArray(data.events)?data.events.slice(0,100):[];
   const total=events.reduce((a,b)=>a+(Number(b.count)||0),0);
   const tasks=events.filter(e=>['task','deadline'].includes(e.signal_type)).reduce((a,b)=>a+(Number(b.count)||0),0);
   const questions=events.filter(e=>e.signal_type==='question').reduce((a,b)=>a+(Number(b.count)||0),0);
   el('groupTotal').textContent=String(total);el('groupTasks').textContent=String(tasks);el('groupQuestions').textContent=String(questions);
   const body=el('groupRows');body.replaceChildren();
   if(!events.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=4;cell.textContent='No signals received from approved groups.';row.appendChild(cell);body.appendChild(row)}
   for(const e of events){
    const tr=document.createElement('tr'),time=Date.parse(e.latest);
    add(tr,String(e.group_key||'—').slice(0,12));add(tr,String(e.signal_type||'other').slice(0,20));add(tr,Number(e.count)||0);
    add(tr,Number.isFinite(time)?new Date(time).toLocaleString():'—');body.appendChild(tr);
   }
   el('groupHealth').textContent='Seven-day group signal activity loaded. No message content was retrieved.';
  }catch(e){el('groupHealth').textContent=e.message}
 }
 el('groupRefresh')?.addEventListener('click',refresh);refresh();
})();
