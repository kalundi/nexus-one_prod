(function(){
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 async function request(path,options={}){const headers={...(options.headers||{})};if(token())headers.authorization=`Bearer ${token()}`;if(options.body&&!headers['content-type'])headers['content-type']='application/json';const r=await fetch(path,{...options,headers,cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||`Request failed (${r.status})`);return j}
 window.NexusData={request,health:()=>request('/api/health'),ready:()=>request('/api/ready'),trips:()=>request('/api/portal/trips'),patients:()=>request('/api/patients'),facilities:()=>request('/api/facilities'),advanceTrip:id=>request(`/api/admin/bookings/${encodeURIComponent(id)}/advance`,{method:'POST'})};
})();
