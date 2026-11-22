(()=>{
 'use strict';
 const el=id=>document.getElementById(id);
 const showStatus=s=>{el('waStatus').textContent=s};
 const number=(id,n)=>{el(id).textContent=String(n)};
 const cell=(row,s)=>{const td=document.createElement('td');td.textContent=String(s);td.style.padding='8px';td.style.borderBottom='1px solid #dbe4ef';row.appendChild(td)};
 function display(events){
  const body=el('waRows');body.replaceChildren();
  const safe=Array.isArray(events)?events.slice(0,100):[];
  number('waTotal',safe.length);
  number('waIncoming',safe.filter(e=>e.direction==='inbound').length);
  number('waEcho',safe.filter(e=>e.direction==='outbound_app').length);
  if(!safe.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.textContent='No WhatsApp metadata received. Connection may not be active.';tr.appendChild(td);body.appendChild(tr);return}
  for(const item of safe){
   const tr=document.createElement('tr');
   const date=Date.parse(String(item.received_at||''));cell(tr,Number.isFinite(date)?new Date(date).toLocaleString():'—');
   cell(tr,item.direction==='inbound'?'Incoming':item.direction==='outbound_app'?'Sent from phone':'Unknown');
   cell(tr,String(item.message_type||'unknown').slice(0,32));
   cell(tr,String(item.conversation_key||'').slice(0,12)||'—');
   body.appendChild(tr);
  }
 }
 async function refresh(){
  showStatus('Checking WhatsApp delivery metadata…');
  const token=sessionStorage.getItem('nexusAccessToken')||'';
  if(!token){showStatus('Sign in as an administrator to view this page.');return}
  try{
   const res=await fetch('/.netlify/functions/whatsapp-inbox-status',{headers:{authorization:'Bearer '+token},cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw Error(res.status===403||res.status===401?'Administrator permission required.':'The WhatsApp monitor is unavailable. Verify migration and connection.');
   if(data.policy?.sendEnabled!==false||data.policy?.autoReply!==false)throw Error('Unexpected sending policy; contact an administrator.');
   display(data.events);
   showStatus('Metadata loaded. No message content is accessed or sent.');
  }catch(error){showStatus(error.message)}
 }
 el('waRefresh')?.addEventListener('click',refresh);
 // The server independently checks the session; UI does not authorize access.
 refresh();
})();