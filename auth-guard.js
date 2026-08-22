(function(){
  // Protect portal pages until the server verifies the active session.
  const policy={
    '/facility.html':['FACILITY','DISPATCHER','ADMIN'],
    '/secure-documents.html':['FACILITY','ADMIN'],
    '/dispatch.html':['DISPATCHER','ADMIN'],
    '/driver-app.html':['DRIVER','DISPATCHER','ADMIN'],
    '/fleet.html':['DISPATCHER','ADMIN'],
    '/billing.html':['BILLING','ADMIN'],
    '/qa.html':['QA','ADMIN'],
    '/executive.html':['EXECUTIVE','ADMIN'],
    '/admin.html':['ADMIN','DISPATCHER'],
    '/ai-operations.html':['DISPATCHER','ADMIN'],
    '/operations.html':['DISPATCHER','ADMIN']
    ,'/keymark.html':['ADMIN','DISPATCHER','EXECUTIVE','QA','FACILITY']
  };

  let pathname=location.pathname;
  if(!pathname.endsWith('.html') && pathname!=='/'){
    pathname=pathname.replace(/\/$/,'')+'.html';
  }

  if(pathname==='/driver.html'){
    location.replace('/driver-app.html');
    return;
  }

  const allowed=policy[pathname];
  if(!allowed) return;

  const root=document.documentElement;
  if(root){
    root.dataset.authState='checking';
    root.style.visibility='hidden';
  }

  const token=sessionStorage.getItem('nexusAccessToken');
  const loginUrl='/?login=1&redirect='+encodeURIComponent(pathname);
  let settled=false;

  const clearSession=()=>{
    sessionStorage.removeItem('nexusAccessToken');
    sessionStorage.removeItem('nexusUser');
  };

  const redirectToLogin=(reason)=>{
    if(settled) return;
    settled=true;
    console.warn('[AUTH-GUARD] Redirecting to login:',reason);
    clearSession();
    location.replace(loginUrl);
  };

  const reveal=(user)=>{
    if(settled) return;
    settled=true;
    if(root){
      root.dataset.authState='authorized';
      root.dataset.authorizedRole=user.role;
      root.style.visibility='visible';
    }
    if(document.body) document.body.style.visibility='visible';
  };

  const deny=(message)=>{
    if(settled) return;
    settled=true;
    clearSession();
    if(root){
      root.dataset.authState='denied';
      root.style.visibility='visible';
    }
    const safeMessage=String(message||'You are not authorized to access this page.')
      .replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    document.documentElement.innerHTML=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access denied | Nexus Medical Transit</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f4f7fb;color:#0b1f3a;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(430px,100%);background:#fff;border:1px solid #dbe4ef;border-radius:20px;padding:32px;box-shadow:0 18px 48px rgba(11,31,58,.12);text-align:center}.status{display:inline-flex;padding:7px 12px;border-radius:999px;background:#fff1f0;color:#b42318;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.06em}h1{margin:18px 0 10px;font-size:28px}p{color:#53657a;line-height:1.55}.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px}a{padding:11px 18px;border-radius:12px;text-decoration:none;font-weight:800;border:1px solid #cdd8e5;color:#0b1f3a}.primary{background:#0b1f3a;color:#fff;border-color:#0b1f3a}</style></head><body><main><div class="status">Protected portal</div><h1>Authorization required</h1><p>${safeMessage}</p><div class="actions"><a class="primary" href="${loginUrl}">Sign in</a><a href="/">Home</a></div></main></body></html>`;
  };

  if(!token){
    location.replace(loginUrl);
    return;
  }

  const controller=new AbortController();
  const timeoutId=setTimeout(()=>controller.abort(),10000);

  fetch('/api/auth/me',{
    headers:{authorization:`Bearer ${token}`},
    cache:'no-store',
    signal:controller.signal
  })
  .then(async(response)=>{
    clearTimeout(timeoutId);
    if(!response.ok){
      if(response.status===401 || response.status===403){
        redirectToLogin('Session rejected by authentication service');
        return null;
      }
      throw new Error('Authentication service returned HTTP '+response.status);
    }

    const payload=await response.json();
    const user=payload && payload.user;
    if(!user || typeof user.role!=='string'){
      throw new Error('Authentication response did not include a valid user role');
    }

    const role=user.role.toUpperCase();
    user.role=role;
    if(!allowed.includes(role)){
      deny('Your '+role+' account does not have permission to access this workspace.');
      return null;
    }

    window.NexusAuthorizedUser=user;
    sessionStorage.setItem('nexusUser',JSON.stringify(user));
    reveal(user);

    // Add the secure-session control only after authorization succeeds.
    if(document.body && !document.getElementById('secureSessionBar')){
      const bar=document.createElement('div');
      bar.className='secureSessionBar';
      bar.id='secureSessionBar';
      const displayName=user.displayName || user.name || user.email || 'Signed in user';
      bar.innerHTML=`<div><span>🔒 Secure session</span><strong></strong><small></small></div><button type="button" id="secureLogout">Sign out</button>`;
      bar.querySelector('strong').textContent=displayName;
      bar.querySelector('small').textContent=role;
      document.body.prepend(bar);
      document.getElementById('secureLogout').addEventListener('click',async()=>{
        try{
          await fetch('/api/auth/logout',{method:'POST',headers:{authorization:`Bearer ${token}`}});
        }catch(error){
          console.error('[AUTH-GUARD] Logout request failed:',error);
        }finally{
          clearSession();
          location.replace('/');
        }
      });
    }

    // Portal data remains server scoped by the authenticated role.
    fetch('/api/portal/trips',{
      headers:{authorization:`Bearer ${token}`},
      cache:'no-store'
    })
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(!data) return;
        window.NexusScopedTrips=Array.isArray(data.trips)?data.trips:[];
        window.dispatchEvent(new CustomEvent('nexus:trips',{detail:data}));
      })
      .catch(error=>console.error('[AUTH-GUARD] Scoped trip load failed:',error));

    window.dispatchEvent(new CustomEvent('nexus:authorized',{detail:user}));
    return user;
  })
  .catch(error=>{
    clearTimeout(timeoutId);
    if(error && error.name==='AbortError'){
      redirectToLogin('Authentication verification timed out');
      return;
    }
    console.error('[AUTH-GUARD] Authorization check failed:',error);
    redirectToLogin('Authentication verification failed');
  });
})();
