// Shared experience navigation for the website and standalone Nexus apps.
(function(){
 'use strict';
 const experiences={
  ADMIN:['Admin','/admin.html'],DISPATCHER:['Dispatch','/dispatch.html'],DRIVER:['Driver','/driver-app.html'],
  FACILITY:['Facility','/facility.html'],BILLING:['Billing','/billing.html'],QA:['Quality assurance','/qa.html'],
  EXECUTIVE:['Executive','/executive.html'],PATIENT:['Patient','/patient.html'],CARETAKER:['Caretaker','/caretaker.html'],
  STAFF:['Staff & training','/training.html']
 };
 Object.entries(window.NexusEmsRoles||{}).forEach(([role,label])=>{experiences[role]=[label,window.NexusEmsRoles.access[role].url];});
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 function rolesFor(user){const roles=[...new Set(user?.roles||[user?.role])].map(role=>String(role).toUpperCase());return roles.filter(role=>experiences[role]&&!(user.titleRole&&role===user.role&&!roles.includes('ADMIN')));}
 function styles(){
  if(document.getElementById('nexusExperienceStyles'))return;
  const style=document.createElement('style');style.id='nexusExperienceStyles';
  style.textContent=`.nexusAccountMenu{box-sizing:border-box;max-width:calc(100vw - 28px);max-height:calc(100dvh - 100px);overflow-y:auto;overscroll-behavior:contain}.nexusRoleSwitcher{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.nexusRoleSwitcher>small{grid-column:1/-1}.nexusRoleSwitcher button{min-height:36px;padding:6px 9px;border:1px solid #d7e3f0;border-radius:9px;background:#fff;color:#123550;font-family:inherit;font-size:13px;font-weight:700;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.nexusRoleSwitcher button:hover{background:#eef6fb}.nexusRoleSwitcher button:disabled{background:#e8f3f9;color:#075985;border-color:#0b5d91;cursor:default}.nexusRoleSwitcher button[aria-current=true]::before{content:"●";margin-right:5px;font-size:8px;color:#0b5d91;vertical-align:2px}.nexusRoleSwitcher .nexusExperienceError{grid-column:1/-1}@media(max-width:200px){.nexusRoleSwitcher{grid-template-columns:minmax(0,1fr)}}.nexusExperienceError{margin:6px 10px;color:#b42318;font-size:13px;line-height:1.4}.nexusExperienceNative{position:relative;display:flex;justify-content:flex-end;padding:6px 12px;font-family:system-ui,sans-serif}.nexusExperienceNative>button{display:flex;align-items:center;gap:8px;max-width:100%;min-height:44px;padding:8px 12px;border:1px solid #d7e3f0;border-radius:12px;background:#fff;color:#123550;font:inherit;cursor:pointer}.nexusExperienceNative>button span{display:grid;text-align:left}.nexusExperienceNative>button strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(240px,65vw);font-size:13px}.nexusExperienceNative>button small{font-size:11px;color:#53657a}.nexusExperienceNative .nexusAccountMenu{position:absolute;right:12px;top:100%;z-index:1500;width:250px;padding:8px;border:1px solid #d7e3f0;border-radius:14px;background:#fff;box-shadow:0 18px 45px rgba(8,47,73,.2)}.nexusExperienceNative .nexusRoleSwitcher{padding:0;margin:0}.nexusExperienceNative .nexusRoleSwitcher>small{display:block;padding:2px 2px 6px;color:#667085;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.nexusExperienceNative [hidden]{display:none!important}@media(max-width:950px){.nexusExperienceNative .nexusAccountMenu{position:fixed;right:14px;top:90px}}`;
  document.head.appendChild(style);
 }
 function createSwitcher(user){
  const roles=rolesFor(user);if(roles.length<2)return null;styles();
  const group=document.createElement('div');group.className='nexusRoleSwitcher';
  const title=document.createElement('small');title.textContent='Switch experience';group.appendChild(title);
  const active=String(user.titleRole||user.role||'').toUpperCase();
  const error=document.createElement('p');error.className='nexusExperienceError';error.setAttribute('role','alert');error.hidden=true;
  Object.keys(experiences).filter(role=>roles.includes(role)).forEach(role=>{
   const button=document.createElement('button');button.type='button';button.dataset.nexusExperienceRole=role;
   button.textContent=experiences[role][0];button.disabled=role===active;
   if(role===active)button.setAttribute('aria-current','true');
   button.addEventListener('click',async()=>{
    if(group.getAttribute('aria-busy')==='true')return;
    group.setAttribute('aria-busy','true');error.hidden=true;
    group.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{
     const response=await fetch('/api/auth/switch-role',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({role})});
     const data=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(data.error||'Unable to switch experience. Please try again.');
     if(data.user?.titleRole!==role&&data.user?.role!==role)throw new Error('Unable to confirm this experience. Please try again.');
     sessionStorage.setItem('nexusUser',JSON.stringify(data.user));
     location.assign(experiences[role][1]);
    }catch(caught){
     error.textContent=caught.message||'Unable to switch experience. Please try again.';error.hidden=false;
     group.querySelectorAll('button').forEach(item=>item.disabled=item.dataset.nexusExperienceRole===active);
    }finally{group.removeAttribute('aria-busy');}
   });group.appendChild(button);
  });
  group.appendChild(error);return group;
 }
 function bindMenu(wrap){
  const button=wrap.querySelector(':scope>button'),menu=wrap.querySelector('.nexusAccountMenu');
  if(!button||!menu)return;
  let header=null,priorZ='',priorPriority='';
  const close=()=>{if(menu.hidden)return;menu.hidden=true;button.setAttribute('aria-expanded','false');if(header){if(priorZ)header.style.setProperty('z-index',priorZ,priorPriority);else header.style.removeProperty('z-index');}header=null;};
  wrap.nexusCloseExperience=close;
  button.addEventListener('click',()=>{if(!menu.hidden){close();return;}header=wrap.closest('header');priorZ=header?.style.getPropertyValue('z-index')||'';priorPriority=header?.style.getPropertyPriority('z-index')||'';menu.hidden=false;button.setAttribute('aria-expanded','true');header?.style.setProperty('z-index','2147483646','important');});
  const outside=event=>{if(!wrap.isConnected){close();document.removeEventListener('click',outside);return;}if(!wrap.contains(event.target))close();};
  document.addEventListener('click',outside);
  const escape=event=>{if(!wrap.isConnected){document.removeEventListener('keydown',escape);return;}if(event.key==='Escape'&&!menu.hidden){close();button.focus();}};
  document.addEventListener('keydown',escape);
 }
 function mountNative(user){
  const previous=document.getElementById('nexusNativeExperienceMount');previous?.nexusCloseExperience?.();previous?.remove();
  if(!rolesFor(user).includes('ADMIN'))return;
  const host=document.querySelector('#appShell .topBar')||(/\/(training|caretaker)\.html$/.test(location.pathname)?document.querySelector('body>header'):null);
  if(!host)return;
  const group=createSwitcher(user);if(!group)return;
  const wrap=document.createElement('div');wrap.id='nexusNativeExperienceMount';wrap.className='nexusExperienceNative';
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','nexusNativeExperienceMenu');
  const label=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
  name.textContent=user.displayName||user.name||user.email||'Administrator';hint.textContent=(user.userCode?user.userCode+' · ':'')+'Switch experience';label.append(name,hint);button.appendChild(label);
  const menu=document.createElement('div');menu.id='nexusNativeExperienceMenu';menu.className='nexusAccountMenu';menu.hidden=true;menu.appendChild(group);
  wrap.append(button,menu);host.appendChild(wrap);bindMenu(wrap);
 }
 window.NexusExperiences={createSwitcher,mountNative,bindMenu};
 window.addEventListener('nexus:authorized',event=>mountNative(event.detail));
 if(window.NexusAuthorizedUser)mountNative(window.NexusAuthorizedUser);
})();
