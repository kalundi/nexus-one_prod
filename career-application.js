(function(){
 const form=document.getElementById('careerApplicationForm'),status=document.getElementById('careerApplicationStatus');
 if(!form)return;
 const show=(message,error=false)=>{if(!status)return;status.hidden=false;status.textContent=message;status.style.borderLeftColor=error?'#b42318':'#16835b';status.style.background=error?'#fff1f0':'#e7f8ef';status.style.color=error?'#8a1c13':'#125c35';};
 const filePayload=file=>new Promise((resolve,reject)=>{if(!file)return resolve(null);if(file.size>4*1024*1024)return reject(new Error('Résumé must be no larger than 4 MB.'));const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read the résumé file.'));reader.onload=()=>resolve({name:file.name,mimeType:file.type||'application/octet-stream',dataBase64:String(reader.result||'').split(',')[1]||''});reader.readAsDataURL(file)});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('[type="submit"]'),data=new FormData(form);
  button.disabled=true;button.textContent='Submitting securely…';show('Securely submitting your application…');
  try{
   const resume=await filePayload(data.get('resume'));
   const payload={firstName:data.get('first-name'),lastName:data.get('last-name'),email:data.get('email'),phone:data.get('phone'),city:data.get('city'),state:data.get('state'),position:data.get('position'),employmentPreference:data.get('employment-preference'),availableStartDate:data.get('available-start-date'),preferredShift:data.get('preferred-shift'),authorizedToWork:data.get('authorized-to-work')==='yes',reliableTransportation:data.get('reliable-transportation')==='yes',experienceYears:data.get('experience-years'),licenseState:data.get('license-state'),certifications:data.get('certifications'),interest:data.get('interest'),additionalInformation:data.get('additional-information'),certification:data.get('certification')==='yes',botField:data.get('bot-field'),resume};
   const response=await fetch('/api/careers/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Unable to submit your application.');
   form.reset();show(`Application received. Your reference is ${result.applicationId}.${result.confirmationEmailSent===false?' Save this reference; email confirmation is temporarily unavailable.':' Check your email for confirmation.'}`);status.focus();
  }catch(error){show(error.message||'Unable to submit your application.',true)}finally{button.disabled=false;button.textContent='Submit application'}
 });
})();
