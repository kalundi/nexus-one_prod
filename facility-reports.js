(()=>{'use strict';
 // Facility Reporting tab: graphical aggregates for the signed-in
 // facility only. All data comes from GET /api/facility-portal/reports,
 // which derives the facility from the session exactly like the trip
 // board does; this module never asks for another facility's numbers.
 // Charts are hand-rolled inline SVG (no chart library), and every chart
 // carries a text alternative for assistive technology.
 const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
 const label=value=>String(value||'Unspecified').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
 const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const DAY_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
 let open=false,started=false,loading=false,facility='';
 function easternToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 async function api(path){
  const session=token();if(!session)throw Error('Sign in to continue.');
  const url=new URL('/api/facility-portal/'+path,location.origin);if(facility)url.searchParams.set('facility',facility);
  const response=await fetch(url,{headers:{authorization:'Bearer '+session,'content-type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'The reporting service is unavailable.');
  if(session!==token())throw Error('Your session changed. Refresh the portal.');
  return data;
 }
 function syncFacility(){
  // Mirror the trip board: Nexus staff pick the facility in the shared
  // selector; a facility manager's selector holds only their facility.
  const select=$('facilitySelect');facility=select?select.value:'';
 }
 function currentRange(){
  const range=window.NexusFacilityRange;if(!range)return null;
  return range.rangeFor($('repDate').value||easternToday(),$('repTimeframe').value||'month');
 }
 // ---- SVG chart builders. Every builder returns svg markup whose bars
 // carry <title> values, and render() pairs each chart with a visually
 // hidden data table, so nothing is conveyed by shape or color alone.
 function vBars(items,{width=720,height=230,max=null,labelEvery=1}={}){
  const peak=max??Math.max(1,...items.map(item=>item.count));
  const pad={top:22,right:8,bottom:26,left:8},plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom;
  const step=plotW/items.length,barW=Math.max(1,Math.min(38,step*0.68));
  const bars=items.map((item,index)=>{
   const h=Math.round(item.count/peak*plotH),x=pad.left+step*index+(step-barW)/2,y=pad.top+plotH-h;
   const showValue=items.length<=31||item.count===peak;
   return '<rect x="'+x.toFixed(1)+'" y="'+y+'" width="'+barW.toFixed(1)+'" height="'+Math.max(h,item.count?2:0)+'" rx="2" fill="#124d91"><title>'+esc(item.name)+': '+item.count+'</title></rect>'
    +(showValue&&item.count?'<text x="'+(x+barW/2).toFixed(1)+'" y="'+(y-5)+'" text-anchor="middle" class="repVal">'+item.count+'</text>':'')
    +(index%labelEvery===0?'<text x="'+(x+barW/2).toFixed(1)+'" y="'+(height-8)+'" text-anchor="middle" class="repAxis">'+esc(item.short||item.name)+'</text>':'');
  }).join('');
  return '<svg viewBox="0 0 '+width+' '+height+'" class="repSvg" role="img" aria-label="'+esc(items.map(i=>i.name+' '+i.count).join(', '))+'">'
   +'<line x1="'+pad.left+'" y1="'+(pad.top+plotH)+'" x2="'+(width-pad.right)+'" y2="'+(pad.top+plotH)+'" stroke="#b6c6d8"/>'+bars+'</svg>';
 }
 function hBars(items,{width=720,rowH=34}={}){
  const peak=Math.max(1,...items.map(item=>item.count));
  const labelW=190,barX=labelW+8,barW=width-barX-56,height=items.length*rowH+8;
  const rows=items.map((item,index)=>{
   const y=4+index*rowH,w=Math.max(item.count?3:0,Math.round(item.count/peak*barW));
   return '<text x="'+labelW+'" y="'+(y+rowH/2+4)+'" text-anchor="end" class="repAxis">'+esc(item.name)+'</text>'
    +'<rect x="'+barX+'" y="'+(y+5)+'" width="'+w+'" height="'+(rowH-12)+'" rx="3" fill="#124d91"><title>'+esc(item.name)+': '+item.count+'</title></rect>'
    +'<text x="'+(barX+w+8)+'" y="'+(y+rowH/2+4)+'" class="repVal">'+item.count+'</text>';
  }).join('');
  return '<svg viewBox="0 0 '+width+' '+height+'" class="repSvg" role="img" aria-label="'+esc(items.map(i=>i.name+' '+i.count).join(', '))+'">'+rows+'</svg>';
 }
 function dataTable(caption,head,rows){
  return '<table class="repSrOnly"><caption>'+esc(caption)+'</caption><thead><tr>'+head.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'
   +rows.map(row=>'<tr>'+row.map((cell,index)=>index===0?'<th scope="row">'+esc(cell)+'</th>':'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }
 function chart(id,items,svg,caption,head,rows){
  const host=$(id);if(!host)return;
  host.innerHTML=(items.length&&items.some(item=>item.count>0)?svg:'<p class="repNone">No data in this range.</p>')+dataTable(caption,head,rows);
 }
 function shortDay(iso){const parts=iso.split('-').map(Number);return DAY_SHORT[new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay()]+' '+parts[2];}
 function render(data,range){
  const totals=data.totals;
  $('repTotalTrips').textContent=totals.trips;$('repCompleted').textContent=totals.completed;
  $('repCompletionRate').textContent=totals.completionRate+'%';$('repCancellationRate').textContent=totals.cancellationRate+'%';
  $('repRangeLabel').textContent=range?range.label+' · '+range.from+' to '+range.to:'';
  $('repStatus').textContent='Reporting for '+range.from+' to '+range.to+': '+totals.trips+' trips ('+totals.completed+' completed, '+totals.active+' active, '+totals.pending+' awaiting coordination, '+totals.cancelled+' cancelled or missed).';
  const empty=totals.trips===0;
  $('repEmpty').hidden=!empty;$('repCharts').hidden=empty;$('repCards').hidden=empty;
  if(empty)return;
  // Trips over time. Long ranges are grouped into weeks so the shape of
  // demand stays readable; the hidden table always keeps daily values.
  let dailyItems=data.daily.map(d=>({name:d.date,short:shortDay(d.date),count:d.count}));
  let dailyNote='Trips per day';
  if(dailyItems.length>92){const weeks=[];for(let i=0;i<dailyItems.length;i+=7){const chunk=dailyItems.slice(i,i+7);weeks.push({name:chunk[0].name+' to '+chunk[chunk.length-1].name,short:shortDay(chunk[0].name),count:chunk.reduce((sum,d)=>sum+d.count,0)});}dailyItems=weeks;dailyNote='Trips per week (grouped from daily counts)';}
  $('repDailyNote').textContent=dailyNote+'. Spot growing demand and quiet stretches before they strain scheduling.';
  chart('repDaily',dailyItems,vBars(dailyItems,{labelEvery:Math.max(1,Math.floor(dailyItems.length/10))}),'Trips over time',['Date','Trips'],data.daily.map(d=>[d.date,d.count]));
  const statusItems=data.byStatus.map(s=>({name:label(s.status),count:s.count}));
  chart('repStatusChart',statusItems,hBars(statusItems),'Trips by status',['Status','Trips'],statusItems.map(i=>[i.name,i.count]));
  const serviceItems=data.byServiceType.map(s=>({name:label(s.service),count:s.count}));
  chart('repServiceChart',serviceItems,hBars(serviceItems),'Trips by service type',['Service type','Trips'],serviceItems.map(i=>[i.name,i.count]));
  const dowItems=data.byDayOfWeek.map(d=>({name:DAY_NAMES[d.day],short:DAY_SHORT[d.day],count:d.count}));
  chart('repDow',dowItems,vBars(dowItems),'Trips by day of week',['Day','Trips'],dowItems.map(i=>[i.name,i.count]));
  const hourItems=data.byHourOfDay.map(h=>({name:(h.hour%12||12)+' '+(h.hour<12?'AM':'PM'),short:String(h.hour),count:h.count}));
  chart('repHour',hourItems,vBars(hourItems,{labelEvery:3}),'Trips by pickup hour',['Hour','Trips'],hourItems.map(i=>[i.name,i.count]));
  const destItems=data.topDestinations.map(d=>({name:d.name,count:d.count}));
  chart('repDest',destItems,hBars(destItems),'Top destination areas',['Destination area','Trips'],destItems.map(i=>[i.name,i.count]));
  const leadItems=(data.leadTimeDays||[]).map(l=>({name:l.bucket==='0'?'Same day':l.bucket+' days',short:l.bucket,count:l.count}));
  chart('repLead',leadItems,vBars(leadItems),'Booking lead time',['Booked ahead','Trips'],leadItems.map(i=>[i.name,i.count]));
 }
 async function load(){
  if(!started||loading)return;syncFacility();
  if(!facility){$('repStatus').textContent='Select a facility to view its reporting.';$('repCharts').hidden=true;$('repCards').hidden=true;$('repEmpty').hidden=true;return;}
  const range=currentRange();if(!range){$('repStatus').textContent='Choose a valid anchor date.';return;}
  loading=true;$('repStatus').textContent='Loading reporting…';
  try{render(await api('reports?'+new URLSearchParams({from:range.from,to:range.to})),range);}
  catch(error){$('repStatus').textContent='Reporting failed: '+error.message;}
  finally{loading=false;}
 }
 async function init(){
  // Default the anchor to the portal's own Eastern today (the same
  // date the trip board starts from), falling back to the local
  // Eastern date if the context cannot be read.
  try{const context=await api('context');if(context.today&&!$('repDate').value)$('repDate').value=context.today;}
  catch(error){if(!$('repDate').value)$('repDate').value=easternToday();}
 }
 function showReports(){
  open=true;$('reportsView').hidden=false;$('viewTitle').textContent='Reporting';
  $('searchLabel').hidden=true;$('statusLabel').hidden=true;
  if(!started){started=true;init().then(()=>load());}
  else load();
 }
 function hideReports(){open=false;$('reportsView').hidden=true;}
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-view]');if(!trigger)return;
  if(trigger.dataset.view==='reports')showReports();
  else if(['board','routes','communications','locations'].includes(trigger.dataset.view))hideReports();
 });
 $('repTimeframe').addEventListener('change',()=>{if(open)load();});
 $('repDate').addEventListener('change',()=>{if(open)load();});
 $('facilitySelect').addEventListener('change',()=>{if(open)load();});
 $('refresh').addEventListener('click',()=>{if(open)load();});
})();
