(()=>{'use strict';
const $=id=>document.getElementById(id);let patients=[],plans=[],user=null;
const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
const message=text=>{$('message').textContent=text;};
function signedOut(){sessionStorage.removeItem('nexusAccessToken');sessionStorage.removeItem('nexusUser');sessionStorage.removeItem('nexusCaretakerPlan');patients=[];plans=[];user=null;$('patients').replaceChildren();$('plans').replaceChildren();$('patientSelect').replaceChildren();$('patientForm').reset();$('planForm').reset();$('workspace').hidden=true;$('auth').hidden=false;$('logout').hidden=true;}
async function api(path,method='GET',body){const response=await fetch(`/api/${path}`,{method,headers:{'content-type':'application/json',...(token()?{authorization:`Bearer ${token()}`}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const data=await response.json();if(!response.ok){if(response.status===401)signedOut();throw Error(data.error||'Unable to complete request. Please try again.');}return data;}
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
function button(label,action,secondary=false){const el=element('button',label);el.type='button';if(secondary)el.className='secondary';el.onclick=async()=>{el.disabled=true;try{await action();}catch(error){message(error.message);}finally{el.disabled=false;}};return el;}
function defaults(){const patient=patients.find(p=>p.id===$('patientSelect').value);if(!patient)return;for(const key of ['pickup','service','notes'])$('planForm').elements[key].value=patient[key]||'';}
function render(){
 $('patients').replaceChildren();$('plans').replaceChildren();const selected=$('patientSelect').value;$('patientSelect').replaceChildren();
 for(const patient of patients){const option=element('option',patient.name);option.value=patient.id;$('patientSelect').append(option);const card=element('article','');card.className='record';card.append(element('h3',patient.name),element('p',`${patient.relationship} · ${patient.service.toLowerCase()}`),element('p',patient.pickup),button('Remove patient',async()=>{if(!confirm(`Remove ${patient.name} and their saved plans? Existing bookings will remain.`))return;await api(`caretaker/patients/${patient.id}`,'DELETE');await load();},true));$('patients').append(card);}
 if(patients.some(p=>p.id===selected))$('patientSelect').value=selected;
 if(!patients.length)$('patients').append(element('p','Add your first patient to start planning.'));
 $('savePlan').disabled=!patients.length;
 for(const plan of plans){const card=element('article','');card.className='record';card.append(element('h3',plan.name),element('p',`${plan.date} · Pickup ${plan.trip_time.slice(0,5)}`),element('p',`${plan.pickup} → ${plan.destination}`),element('p',`Appointment ${plan.appointment_time.slice(0,5)} · ${plan.service.toLowerCase()}`),element('strong','Planned · Not booked'),button('Continue to booking',()=>{sessionStorage.setItem('nexusCaretakerPlan',JSON.stringify({...plan,email:user.email,ownerId:user.id}));location.assign('/booking-app.html');}),button('Remove plan',async()=>{if(!confirm('Remove this plan? This will not cancel an existing booking.'))return;await api(`caretaker/plans/${plan.id}`,'DELETE');await load();},true));$('plans').append(card);}
 if(!plans.length)$('plans').append(element('p','No transportation plans yet. Choose a patient and appointment above.'));
}
async function load(){const data=await api('caretaker');patients=data.patients;plans=data.plans;render();}
async function enter(){const data=await api('auth/me');user=data.user;if(user.mustChangePassword){location.assign('/set-password.html');return;}await load();$('auth').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;defaults();}
function bindForm(id,action){$(id).addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button');submit.disabled=true;message('');try{await action(form);}catch(error){message(error.message);}finally{submit.disabled=id==='planForm'&&!patients.length;}});}
for(const [id,path] of [['loginForm','auth/login'],['signupForm','auth/register']])bindForm(id,async form=>{const body=Object.fromEntries(new FormData(form));if(id==='signupForm'){body.acceptTerms=form.elements.acceptTerms.checked;body.role='PATIENT';}const data=await api(path,'POST',body);sessionStorage.setItem('nexusAccessToken',data.token);sessionStorage.setItem('nexusUser',JSON.stringify(data.user));form.reset();await enter();message('Welcome to your caretaker workspace.');});
bindForm('patientForm',async form=>{const body=Object.fromEntries(new FormData(form));body.consent=form.elements.consent.checked;const data=await api('caretaker/patients','POST',body);form.reset();await load();$('patientSelect').value=data.patient.id;defaults();message('Patient saved. You can now plan their transportation.');});
bindForm('planForm',async form=>{await api('caretaker/plans','POST',Object.fromEntries(new FormData(form)));form.reset();await load();defaults();message('Plan saved. Continue to booking to reserve transportation.');});
$('patientSelect').addEventListener('change',defaults);
$('logout').onclick=async()=>{try{await api('auth/logout','POST');signedOut();message('Signed out.');}catch(error){message(error.message);}};
$('planForm').elements.date.min=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
if(token())enter().catch(error=>message(error.message));
})();
