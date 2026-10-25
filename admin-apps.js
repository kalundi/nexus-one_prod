(()=>{'use strict';
 const apps=[
 ['Administration','Users, settings and system management','admin.html','ADMIN'],
 ['Dispatch','Schedule and manage transportation','dispatch.html','ADMIN'],
 ['DriveFlex dispatch','DriveFlex transportation operations','driveflex-dispatch.html','ADMIN'],
 ['Driver','Driver trips and vehicle updates','driver-app.html','ADMIN'],
 ['Facility','Facility transportation management','facility.html','ADMIN'],
 ['Patient','Patient bookings and ride monitoring','patient.html','PATIENT'],
 ['Caregiver','Caregiver and family trip monitoring','caretaker.html','CARETAKER'],
 ['Booking','Create and manage transport requests','booking-app.html','ADMIN'],
 ['LiveCare','Live transportation access','livecare.html','ADMIN'],
 ['Annapolis facility demo','FutureCare presentation and simulated trips','facility-demo.html','ADMIN'],
 ['LiveCare demo','Simulated patient journey and notifications','livecare-demo.html','ADMIN'],
 ['Billing','Invoices and transportation charges','billing.html','ADMIN'],
 ['Quality assurance','Review transportation quality','qa.html','ADMIN'],
 ['Executive','Executive reporting and oversight','executive.html','ADMIN'],
 ['Fleet','Vehicles and fleet operations','fleet.html','ADMIN'],
 ['Operations','Operational planning and oversight','operations.html','ADMIN'],
 ['AI operations','Operations investigation workspace','ai-operations.html','ADMIN'],
 ['KeyMark','KeyMark operations workspace','keymark.html','ADMIN'],
 ['Secure documents','Protected document workspace','secure-documents.html','ADMIN'],
 ['Training','Staff learning and certifications','training.html','ADMIN'],
 ['System health','Background monitoring and issue reports','admin-maintenance.html','ADMIN']
 ];
 let ready=false,busy=false;
 function render(user){
  if(ready||!user?.roles?.includes('ADMIN'))return;ready=true;
  document.getElementById('appNotice').textContent='Select a workspace to continue with your administrator account.';
  const grid=document.getElementById('appGrid');
  for(const [name,description,path,role]of apps){
   const link=document.createElement('a');link.className='appLink';link.href='/'+path;
   const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=name;detail.textContent=description;link.append(title,detail);
   link.addEventListener('click',async event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();if(busy)return;busy=true;
    try{
     const response=await fetch('/api/auth/switch-role',{method:'POST',headers:{authorization:`Bearer ${sessionStorage.getItem('nexusAccessToken')||''}`,'content-type':'application/json'},body:JSON.stringify({role})});
     const data=await response.json();if(!response.ok||data.user?.role!==role)throw Error(data.error||'Unable to open this experience.');
     sessionStorage.setItem('nexusUser',JSON.stringify(data.user));location.href=link.href;
    }catch(error){document.getElementById('appNotice').textContent=error.message;busy=false;}
   });grid.append(link);
  }
 }
 window.addEventListener('nexus:authorized',event=>render(event.detail));render(window.NexusAuthorizedUser);
})();
