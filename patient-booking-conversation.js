/* Guided patient booking: no external AI or transcript storage. */
(function(){
 const labels={ONE_WAY:'One way',ROUND_TRIP:'Round trip',RECURRING:'Recurring'};
 window.NexusBookingConversation={mount(options){
  const host=document.createElement('section');host.className='nexusBookingConversation';host.setAttribute('aria-label','Nex booking conversation');
  const head=document.createElement('header');head.innerHTML='<strong>Nex · Booking assistant</strong><small>Let’s arrange your ride.</small>';
  const log=document.createElement('div');log.className='nexBookingLog';log.setAttribute('role','log');log.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='nexBookingControls';
  const footer=document.createElement('footer');
  const manual=document.createElement('button');manual.type='button';manual.className='ghost';manual.textContent='Use booking form instead';manual.addEventListener('click',()=>finish(false));
  const restart=document.createElement('button');restart.type='button';restart.className='ghost';restart.textContent='Start over';restart.addEventListener('click',reset);
  footer.append(restart,manual);host.append(head,log,controls,footer);document.body.append(host);document.body.classList.add('nexBookingConversationOpen');
  let draft={},closed=false;
  function bubble(text,who='nex'){const el=document.createElement('p');el.className='nexBookingBubble '+who;el.textContent=text;log.append(el);log.scrollTop=log.scrollHeight;}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent=text;b.addEventListener('click',fn);controls.append(b);return b;}
  function choose(question,choices,next){controls.replaceChildren();bubble(question);for(const [value,label] of choices)button(label,()=>{bubble(label,'patient');next(value);});}
  function ask(question,type,next,initial='',min='',max=''){
   controls.replaceChildren();bubble(question);const form=document.createElement('form');const input=document.createElement('input');input.type=type;input.required=true;input.maxLength=300;input.value=initial;input.setAttribute('aria-label',question);if(min)input.min=min;if(max)input.max=max;if(type==='text')input.placeholder='Type your answer…';const send=document.createElement('button');send.type='submit';send.textContent='Send';form.append(input,send);controls.append(form);
   form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim();if(!value||!input.checkValidity()){input.reportValidity();return;}bubble(value,'patient');next(value);});input.focus();
  }
  function reset(){draft={};log.replaceChildren();const name=String(options.firstName||'').trim();bubble(name?'Hi '+name+'! I can help book your transportation.':'Hi! I can help book your transportation.');
   if(options.pickup)choose('Should I use your saved pickup location?',[['saved','Use saved pickup'],['other','Different pickup']],v=>{if(v==='saved'){draft.pickup=options.pickup;destination();}else pickup();});else pickup();
  }
  function pickup(){ask('Where should we pick you up? Please enter the full address.','text',v=>{draft.pickup=v;destination();});}
  function destination(){ask('Where are you heading? Please enter the destination address.','text',v=>{draft.destination=v;ask('What day is your ride?','date',d=>{draft.date=d;timing();},'',options.minDate);});}
  function timing(){choose('Would you like us to get you there by an appointment time, or pick you up at a particular time?',[['APPOINTMENT','Appointment time'],['PICKUP','Pickup time']],v=>{draft.basis=v;ask(v==='PICKUP'?'What time should we pick you up?':'What time is your appointment?','time',t=>{draft.time=t;trip();});});}
  function trip(){choose('Do you need a one-way ride, a ride back, or regular rides? ',Object.entries(labels),v=>{draft.tripType=v;if(v==='ROUND_TRIP')ask('What date should we pick you up for the return?','date',d=>{draft.returnDate=d;ask('What time should we pick you up for the return?','time',t=>{draft.returnTime=t;service();});},draft.date,draft.date);else if(v==='RECURRING')repeatDays();else service();});}
  function repeatDays(){controls.replaceChildren();bubble('Which days should this ride repeat?');const form=document.createElement('form');const group=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Repeat days';group.append(legend);for(const day of ['MON','TUE','WED','THU','FRI','SAT','SUN']){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=day;l.append(i,document.createTextNode(' '+day));group.append(l);}const send=document.createElement('button');send.type='submit';send.textContent='Continue';form.append(group,send);controls.append(form);form.addEventListener('submit',e=>{e.preventDefault();const days=Array.from(group.querySelectorAll('input:checked'),i=>i.value);if(!days.length){bubble('Please select at least one day.');return;}draft.days=days;bubble(days.join(', '),'patient');const max=new Date(draft.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+84);ask('When should the recurring rides end?','date',d=>{draft.endDate=d;service();},'',draft.date, max.toISOString().slice(0,10));});}
  function service(){const list=options.services||[];const saved=list.find(([v])=>v===options.service);const choices=saved?[[saved[0],'Use saved '+saved[1]],['change','Change transportation type']]:list;choose('What kind of transportation do you need?',choices,v=>{if(v==='change'){choose('Choose the transportation type for this ride.',list,s=>{draft.service=s;review();});}else{draft.service=v;review();}});}
  function review(){controls.replaceChildren();const selected=(options.services||[]).find(([v])=>v===draft.service)?.[1]||draft.service;bubble('Here is what I have:');bubble(['Pickup: '+draft.pickup,'Destination: '+draft.destination,'Date: '+draft.date,(draft.basis==='PICKUP'?'Pickup':'Appointment')+' time: '+draft.time,'Trip: '+labels[draft.tripType],'Transportation: '+selected,draft.returnDate?'Return: '+draft.returnDate+' at '+draft.returnTime:'',draft.days?'Repeats: '+draft.days.join(', ')+' through '+draft.endDate:''].filter(Boolean).join('\n'));bubble('I will send these details to the booking screen so you can review the fare and submit your ride. Nothing has been booked yet.');button('Review ride and fare',()=>finish(true));button('Change answers',reset);}
  function finish(useDraft){if(closed)return;closed=true;const result=useDraft?{...draft}:null;draft={};host.remove();document.body.classList.remove('nexBookingConversationOpen');if(result)options.onReview(result);}
  reset();
 }};
})();
