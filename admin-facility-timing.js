(function(){
 'use strict';
 const host=document.getElementById('facilityTimingContent'),fold=document.getElementById('facilityTimingManager');if(!host||!fold)return;
 let profiles=[],loaded=false;
 const request=async(method,body)=>{const token=sessionStorage.getItem('nexusAccessToken')||'',r=await fetch('/api/admin/facility-timing',{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Facility timing could not load.');return data;};
 const input=(id,label,type='text')=>{const wrap=document.createElement('div'),text=document.createElement('label'),field=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');text.htmlFor=id;text.textContent=label;field.id=id;if(field.tagName==='INPUT')field.type=type;if(type==='number'){field.min=0;field.max=120;field.value=0;}wrap.append(text,field);return {wrap,field};};
 function render(){
  host.replaceChildren();const select=input('facilityTimingSelect','Saved facility','select');
  select.field.add(new Option('New facility',''));profiles.forEach((p,i)=>select.field.add(new Option(p.name||p.address,String(i))));host.append(select.wrap);
  const form=document.createElement('form');form.className='facilityTimingForm';
  const fields={};
  [['name','Facility name'],['address','Exact booking address'],['facilityType','Facility type','select'],['pickupExtraMinutes','Extra pickup access / preparation (min)','number'],['handoffExtraMinutes','Extra destination access / handoff (min)','number'],['peakExtra','Extra delay during peak window (min)','number'],['peakStart','Peak window starts','time'],['peakEnd','Peak window ends','time'],['receiveStart','Receiving hours start','time'],['receiveEnd','Receiving hours end','time'],['accessInstructions','Entrance, loading area, parking and unit instructions','textarea']].forEach(([key,label,type])=>{const item=input('facilityTiming_'+key,label,type);fields[key]=item.field;if(key==='accessInstructions')item.wrap.className='wide';form.append(item.wrap);});
  ['UNKNOWN','RESIDENCE','REHAB','HOSPITAL','DIALYSIS','NURSING','CLINIC'].forEach(t=>fields.facilityType.add(new Option(t.replace('_',' '),t)));
  fields.address.required=true;
  if(typeof canEditSettings==='function'&&!canEditSettings())form.querySelectorAll('input,select,textarea').forEach(field=>field.disabled=true);
  const status=document.createElement('p');status.setAttribute('role','status');status.className='wide';
  const save=document.createElement('button');save.type='submit';save.className='btn';save.textContent='Save facility timing';form.append(save,status);host.append(form);
  if(typeof canEditSettings==='function'&&!canEditSettings()){save.disabled=true;status.textContent='Read only. Admin can change facility timing.';}
  select.field.onchange=()=>{const p=select.field.value===''?{}:profiles[Number(select.field.value)];for(const key of ['name','address','facilityType','pickupExtraMinutes','handoffExtraMinutes','accessInstructions'])fields[key].value=p[key]??(key.endsWith('Minutes')?0:key==='facilityType'?'UNKNOWN':'');fields.peakStart.value=p.peakWindows?.[0]?.start||'';fields.peakEnd.value=p.peakWindows?.[0]?.end||'';fields.peakExtra.value=p.peakWindows?.[0]?.extraMinutes||0;fields.receiveStart.value=p.receivingHours?.[0]?.start||'';fields.receiveEnd.value=p.receivingHours?.[0]?.end||'';};
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;status.textContent='Saving…';try{
   const current=select.field.value===''?{}:profiles[Number(select.field.value)];
   const body=Object.fromEntries(['name','address','facilityType','pickupExtraMinutes','handoffExtraMinutes','accessInstructions'].map(k=>[k,fields[k].value]));
   body.peakWindows=fields.peakStart.value&&fields.peakEnd.value?[{start:fields.peakStart.value,end:fields.peakEnd.value,extraMinutes:Number(fields.peakExtra.value),weekdays:current.peakWindows?.[0]?.weekdays||[]},...(current.peakWindows||[]).slice(1)]:[];
   body.receivingHours=fields.receiveStart.value&&fields.receiveEnd.value?[{start:fields.receiveStart.value,end:fields.receiveEnd.value,weekdays:current.receivingHours?.[0]?.weekdays||[]},...(current.receivingHours||[]).slice(1)]:[];
   await request('POST',body);profiles=(await request('GET')).profiles||[];select.field.replaceChildren(new Option('New facility',''));profiles.forEach((p,i)=>select.field.add(new Option(p.name||p.address,String(i))));select.field.value=String(profiles.findIndex(p=>p.address===body.address));status.textContent='Facility timing saved. New estimates use these allowances.';
  }catch(error){status.textContent=error.message;}finally{save.disabled=false;}};
 }
 fold.addEventListener('toggle',async()=>{if(!fold.open||loaded)return;host.textContent='Loading facilities…';try{profiles=(await request('GET')).profiles||[];loaded=true;render();}catch(error){host.textContent=error.message;}});
})();
