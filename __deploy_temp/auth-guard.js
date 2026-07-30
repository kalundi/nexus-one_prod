(function(){
 const policy={
  '/facility.html':['FACILITY','DISPATCHER','ADMIN'],
  '/dispatch.html':['DISPATCHER','ADMIN'],
  '/driver.html':['DRIVER','DISPATCHER','ADMIN'],
  '/fleet.html':['DISPATCHER','ADMIN'],
  '/billing.html':['BILLING','ADMIN'],
  '/qa.html':['QA','ADMIN'],
  '/executive.html':['EXECUTIVE','ADMIN'],
  '/admin.html':['ADMIN'],
  '/ai-operations.html':['DISPATCHER','ADMIN'],
  '/operations.html':['DISPATCHER','ADMIN']
 };
 const allowed=policy[location.pathname]; if(!allowed)return;
 const token=sessionStorage.getItem('nexusAccessToken');
 const deny=(message)=>{document.body.innerHTML=`<main class="shell moduleMain"><section class="card securePanel"><img class="logo" src="./nexus-logo.png" alt="Nexus Medical Transit"><span class="status red">Protected portal</span><h1>Authorization required</h1><p>${message}</p><div class="toolbar"><a class="button" href="/livecare.html">Secure sign in</a><a class="button secondary" href="/">Return home</a></div><p><small>Access attempts may be recorded for security and compliance.</small></p></section></main>`};
 if(!token)return deny('Sign in through Livecare using the account assigned to your role.');
 fetch('/api/auth/me',{headers:{authorization:`Bearer ${token}`},cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok||!allowed.includes(j.user.role)){sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');deny('Your account does not have permission to view this page.');return}document.documentElement.dataset.authorizedRole=j.user.role;window.NexusAuthorizedUser=j.user;
 const bar=document.createElement('div');bar.className='secureSessionBar';bar.innerHTML=`<div><span>Secure session</span><strong>${j.user.displayName}</strong><small>${j.user.role}</small></div><button type="button" id="secureLogout">Sign out</button>`;document.body.prepend(bar);
 document.getElementById('secureLogout').addEventListener('click',async()=>{try{await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${token}`}})}catch{}sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');location.href='/livecare.html'});
 fetch('/api/portal/trips',{headers:{authorization:`Bearer ${token}`},cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(data){window.NexusScopedTrips=data.trips||[];window.dispatchEvent(new CustomEvent('nexus:trips',{detail:data}))}}).catch(()=>{});
 window.dispatchEvent(new CustomEvent('nexus:authorized',{detail:j.user}))}).catch(()=>deny('Your secure session could not be verified. Please sign in again.'));
})();
