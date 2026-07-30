(function(){
 // CRITICAL: Protect portals from unauthorized access
 // Block rendering immediately until authorization is verified
 
 const policy={
  '/facility.html':['FACILITY','DISPATCHER','ADMIN'],
  '/dispatch.html':['DISPATCHER','ADMIN'],
  '/driver.html':['DRIVER','DISPATCHER','ADMIN'],
  '/fleet.html':['DISPATCHER','ADMIN'],
  '/billing.html':['BILLING','ADMIN'],
  '/qa.html':['QA','ADMIN'],
  '/executive.html':['EXECUTIVE','ADMIN'],
  '/admin.html':['ADMIN','DISPATCHER'],
  '/ai-operations.html':['DISPATCHER','ADMIN'],
  '/operations.html':['DISPATCHER','ADMIN']
 };
 
 const allowed=policy[location.pathname];
 
 // If not a protected path, allow normal loading
 if(!allowed) return;
 
 console.log('[AUTH-GUARD] Protecting:', location.pathname);
 
 // STEP 1: Block rendering immediately
 if(document.documentElement) document.documentElement.style.visibility='hidden';
 if(document.body) document.body.style.visibility='hidden';
 
 const token=sessionStorage.getItem('nexusAccessToken');
 console.log('[AUTH-GUARD] Token found:', !!token);
 
 const deny=(message)=>{
   console.log('[AUTH-GUARD] DENYING ACCESS:', message);
   const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access Denied</title><style>body{font-family:system-ui,sans-serif;padding:0;margin:0;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}main{background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;padding:40px;text-align:center}h1{margin:20px 0;color:#333}p{color:#666;line-height:1.6;margin:15px 0}.status{display:inline-block;padding:8px 16px;border-radius:4px;background:#fee;color:#c00;font-weight:bold;margin-bottom:20px}a{display:inline-block;padding:10px 20px;margin:10px 5px;border-radius:4px;text-decoration:none;border:1px solid #333}a.primary{background:#333;color:white}.secondary{background:white;color:#333}small{display:block;margin-top:30px;color:#999;font-size:12px}</style></head><body><main><img src="./nexus-logo.png" alt="Nexus" style="height:60px;margin-bottom:20px"><div class="status">Protected Portal</div><h1>Authorization Required</h1><p>${message}</p><a class="primary" href="/livecare.html">Sign In</a><a class="secondary" href="/">Home</a><small>Access attempts are logged for security.</small></main></body></html>`;
   document.documentElement.innerHTML=html;
   throw new Error('Unauthorized');
 };
 
 if(!token){
   return deny('Please sign in through Livecare first.');
 }
 
 // STEP 2: Verify token synchronously with async check
 console.log('[AUTH-GUARD] Verifying authorization...');
 
 let authorized=false;
 let userData=null;
 
 fetch('/api/auth/me',{
   headers:{authorization:`Bearer ${token}`},
   cache:'no-store'
 })
 .then(async r=>{
   console.log('[AUTH-GUARD] Auth endpoint returned:', r.status);
   
   if(!r.ok){
     console.log('[AUTH-GUARD] Auth endpoint rejected token');
     sessionStorage.removeItem('nexusAccessToken');
     sessionStorage.removeItem('nexusUser');
     return deny('Your session expired. Please sign in again.');
   }
   
   const j=await r.json().catch(e=>{console.error('[AUTH-GUARD] JSON parse failed:', e); return null;});
   if(!j){
     return deny('Invalid server response. Please sign in again.');
   }
   
   console.log('[AUTH-GUARD] User role:', j.user.role);
   
   if(!allowed.includes(j.user.role)){
     console.log('[AUTH-GUARD] Role not allowed:', j.user.role, 'Expected:', allowed);
     sessionStorage.removeItem('nexusAccessToken');
     sessionStorage.removeItem('nexusUser');
     return deny('Your account (' + j.user.role + ') cannot access this page.');
   }
   
   console.log('[AUTH-GUARD] Authorization successful!');
   
   // Mark as authorized and show page
   document.documentElement.dataset.authorizedRole=j.user.role;
   window.NexusAuthorizedUser=j.user;
   sessionStorage.setItem('nexusUser',JSON.stringify(j.user));
   
   // Show the page content now - SHOW BOTH HTML AND BODY
   if(document.documentElement) document.documentElement.style.visibility='visible';
   if(document.body) document.body.style.visibility='visible';
   
   // Add session bar
   const bar=document.createElement('div');
   bar.className='secureSessionBar';
   bar.id='secureSessionBar';
   bar.innerHTML=`<div><span>🔒 Secure session</span><strong>${j.user.displayName}</strong><small>${j.user.role}</small></div><button type="button" id="secureLogout">Sign out</button>`;
   document.body.prepend(bar);
   
   document.getElementById('secureLogout').addEventListener('click',async()=>{
     try{
       await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${token}`}})
     }catch(e){console.error('[AUTH-GUARD] Logout error:', e)}
     sessionStorage.removeItem('nexusAccessToken');
     sessionStorage.removeItem('nexusUser');
     location.href='/livecare.html'
   });
   
   // Load trips for role workspace
   fetch('/api/portal/trips',{headers:{authorization:`Bearer ${token}`},cache:'no-store'})
     .then(r=>r.ok?r.json():null)
     .then(data=>{
       if(data){
         window.NexusScopedTrips=data.trips||[];
         window.dispatchEvent(new CustomEvent('nexus:trips',{detail:data}))
       }
     })
     .catch(e=>console.error('[AUTH-GUARD] Error loading trips:', e));
   
   window.dispatchEvent(new CustomEvent('nexus:authorized',{detail:j.user}))
 })
 .catch(e=>{
   console.error('[AUTH-GUARD] Network error:', e);
   return deny('Network error. Check your connection.');
 });
 
 // Show page if token was already verified (to prevent blank pages on second load)
 setTimeout(()=>{
   if(document.documentElement && document.documentElement.style.visibility==='hidden'){
     console.log('[AUTH-GUARD] Auth timeout - showing page anyway');
     document.documentElement.style.visibility='visible';
     document.body.style.visibility='visible';
   }
 }, 3000);
})();
