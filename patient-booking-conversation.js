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
  let draft={},closed=false,busy=false;
  function bubble(text,who='nex'){const el=document.createElement('p');el.className='nexBookingBubble '+who;el.textContent=text;log.append(el);log.scrollTop=log.scrollHeight;}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent=text;b.addEventListener('click',fn);controls.append(b);return b;}
  function choose(question,choices,next){controls.replaceChildren();bubble(question);for(const [value,label] of choices)button(label,()=>{bubble(label,'patient');next(value);});}
  function ask(question,type,next,initial='',min='',max=''){
   controls.replaceChildren();bubble(question);const form=document.createElement('form');const input=document.createElement('input');input.type=type;input.required=true;input.maxLength=300;input.value=initial;input.setAttribute('aria-label',question);if(min)input.min=min;if(max)input.max=max;if(type==='text')input.placeholder='Type your answer…';const send=document.createElement('button');send.type='submit';send.textContent='Send';form.append(input,send);controls.append(form);
   form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim();if(!value||!input.checkValidity()){input.reportValidity();return;}bubble(value,'patient');next(value);});input.focus();
  }
  function reset(){if(busy)return;draft={};log.replaceChildren();const name=String(options.firstName||'').trim();bubble(name?'Hi '+name+'! How can I help with your transportation today?':'Hi! How can I help with your transportation today?');chat('Tell me about the ride you need.');}
  function chat(question,expected){
   ask(question,'text',value=>{
    if(/\b(?:same (?:ride|trip|place|route)|usual (?:destination|hospital|dialysis(?: center)?|clinic|ride)|repeat (?:my |the )?(?:last|previous) (?:ride|trip)|last (?:ride|trip)|as last week)\b/i.test(value)){void recent(value);return;}
    const parsed=window.NexusBookingIntent?.extract(value,options.minDate)||{};
    if(parsed.savedPickup&&options.pickup)parsed.pickup=options.pickup;
    delete parsed.savedPickup;
    if(parsed.service&&!(options.services||[]).some(([v])=>v===parsed.service))delete parsed.service;
    if(expected==='returnTime'&&parsed.time){parsed.returnTime=parsed.time;delete parsed.time;}
    if(expected==='returnDate'&&parsed.date){parsed.returnDate=parsed.date;delete parsed.date;}
    if(expected==='pickup'&&!parsed.pickup&&!Object.keys(parsed).length)parsed.pickup=value;
    if(expected==='destination'&&!parsed.destination&&!Object.keys(parsed).length)parsed.destination=value;
    if(!Object.keys(parsed).length){bubble('I want to make sure I get that right.');next();return;}
    if(parsed.date&&draft.date&&parsed.date!==draft.date){delete draft.returnDate;delete draft.endDate;}
    if(parsed.tripType&&parsed.tripType!==draft.tripType){delete draft.returnDate;delete draft.returnTime;delete draft.days;delete draft.endDate;}
    Object.assign(draft,parsed);next();
   });
  }
  async function recent(message){
   if(busy||closed)return;lock(true);
   bubble('Let me check the routes you have used before.');
   try{
    const routes=await options.loadRecentRoutes?.()||[];
    if(!routes.length){bubble('I couldn’t find a completed ride to reuse. Could you tell me where you’re going?');return chat('Where are you heading?','destination');}
    const parsed=window.NexusBookingIntent?.extract(message,options.minDate)||{};
    delete parsed.destination;delete parsed.savedPickup;
    if(parsed.service&&!(options.services||[]).some(([v])=>v===parsed.service))delete parsed.service;
    Object.assign(draft,parsed);
    choose('Which of these previous routes would you like to use?',routes.map((route,i)=>[i,route.destination+' — from '+route.pickup]).concat([['other','A different destination']]),i=>{
     if(i==='other'){chat('Where are you heading?','destination');return;}
     const route=routes[i];draft.pickup=route.pickup;draft.destination=route.destination;
     if(!draft.service&&(options.services||[]).some(([v])=>v===route.service))draft.service=route.service;
     next();
    });
   }catch{bubble('I can’t access your previous routes right now.');chat('Where are you heading?','destination');}
   finally{lock(false);}
  }
  function next(){
   if(!draft.pickup){if(options.pickup)choose('Should I pick you up at your saved address?',[['saved','Yes, use my saved address'],['other','Different address']],v=>{if(v==='saved'){draft.pickup=options.pickup;next();}else chat('Where should I pick you up?', 'pickup');});else chat('Where should I pick you up?', 'pickup');return;}
   if(!draft.destination){chat('Where are you heading?', 'destination');return;}
   if(!draft.date){ask('What day do you need the ride?','date',v=>{draft.date=v;next();},'',options.minDate);return;}
   if(!draft.basis){choose('Is that your appointment time or your preferred pickup time?',[['APPOINTMENT','Appointment time'],['PICKUP','Pickup time']],v=>{draft.basis=v;next();});return;}
   if(!draft.time){ask(draft.basis==='PICKUP'?'What time should we pick you up?':'What time is your appointment?','time',v=>{draft.time=v;next();});return;}
   if(!draft.tripType){choose('Will you need a ride back, or just one way?',Object.entries(labels),v=>{draft.tripType=v;next();});return;}
   if(draft.tripType==='ROUND_TRIP'&&(!draft.returnDate||draft.returnDate<draft.date)){ask('What date should we return to pick you up?','date',v=>{draft.returnDate=v;next();},draft.date,draft.date);return;}
   if(draft.tripType==='ROUND_TRIP'&&!draft.returnTime){ask('What time would you like us to pick you up afterward?','time',v=>{draft.returnTime=v;next();});return;}
   if(draft.tripType==='RECURRING'&&!draft.days){repeatDays();return;}
   if(draft.tripType==='RECURRING'&&!draft.endDate){const max=new Date(draft.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+84);ask('When should the recurring rides end?','date',d=>{draft.endDate=d;next();},'',draft.date,max.toISOString().slice(0,10));return;}
   if(!draft.service){const list=options.services||[];const saved=list.find(([v])=>v===options.service);choose('Can we use your usual transportation type?',saved?[[saved[0],'Yes, '+saved[1]],['change','Change transportation type']]:list,v=>{if(v==='change')choose('What type of transportation do you need?',list,s=>{draft.service=s;next();});else{draft.service=v;next();}});return;}
   review();
  }
  function repeatDays(){controls.replaceChildren();bubble('Which days should we arrange this ride?');const form=document.createElement('form');const group=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Repeat days';group.append(legend);for(const day of ['MON','TUE','WED','THU','FRI','SAT','SUN']){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=day;l.append(i,document.createTextNode(' '+day));group.append(l);}const send=document.createElement('button');send.type='submit';send.textContent='Continue';form.append(group,send);controls.append(form);form.addEventListener('submit',e=>{e.preventDefault();const days=Array.from(group.querySelectorAll('input:checked'),i=>i.value);if(!days.length){bubble('Please select at least one day.');return;}draft.days=days;bubble(days.join(', '),'patient');const max=new Date(draft.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+84);ask('When should the recurring rides end?','date',d=>{draft.endDate=d;next();},'',draft.date,max.toISOString().slice(0,10));});}
  function review(){controls.replaceChildren();const selected=(options.services||[]).find(([v])=>v===draft.service)?.[1]||draft.service;bubble('Here is what I have:');bubble(['Pickup: '+draft.pickup,'Destination: '+draft.destination,'Date: '+draft.date,(draft.basis==='PICKUP'?'Pickup':'Appointment')+' time: '+draft.time,'Trip: '+labels[draft.tripType],'Transportation: '+selected,draft.returnDate?'Return: '+draft.returnDate+' at '+draft.returnTime:'',draft.days?'Repeats: '+draft.days.join(', ')+' through '+draft.endDate:''].filter(Boolean).join('\n'));bubble('Let me check the fare and pickup time for you. Nothing has been booked yet.');button('Check fare',quote);button('Change answers',()=>chat('What would you like to change?'));button('Start a different ride',reset);}
  function lock(value){busy=value;restart.disabled=value;manual.disabled=value;controls.querySelectorAll('button,input').forEach(el=>el.disabled=value);}
  async function quote(){
   if(busy||closed)return;lock(true);bubble('I’m checking the route and current fare…');
   try{
    const result=await options.onQuote({...draft});
    if(!result||!result.signature||!(result.fare>0))throw Error('No valid estimate');
    controls.replaceChildren();bubble('Your estimated fare is '+Number(result.fare).toLocaleString('en-US',{style:'currency',currency:'USD'})+(result.pickupTime?' and the estimated pickup time is '+result.pickupTime+'.':'.')+(draft.tripType==='RECURRING'?' This is the estimate for the displayed ride; recurring charges depend on the schedule.':''));
    bubble('Would you like me to submit this ride request?');
    button('Submit ride request',()=>submit(result));button('Change answers',()=>chat('What would you like to change?'));
   }catch{controls.replaceChildren();bubble('I couldn’t calculate a reliable fare yet. We can check the details together in the booking form.');button('Review booking form',()=>finish(false));button('Change answers',()=>chat('What would you like to change?'));}
   finally{lock(false);}
  }
  async function submit(quote){
   if(busy||closed)return;lock(true);bubble('I’m submitting your ride request…');
   try{
    const result=await options.onSubmit(quote);
    controls.replaceChildren();
    if(!result?.reference)throw Error('Unconfirmed submission');
    bubble((result.outcome||'Ride request received')+'. Reference: '+result.reference+'.');
    if(result.paymentRequired){bubble('Your request requires a secure payment step.');button('Continue to secure payment',()=>finish(false));}
    else{bubble('You can check the status under My rides.');button('View my rides',()=>{finish(false);options.onTrips?.();});}
    restart.hidden=true;manual.hidden=true;
   }catch{controls.replaceChildren();bubble('I couldn’t verify that the request was saved. Please check My rides before submitting again, or contact dispatch.');button('View my rides',()=>{finish(false);options.onTrips?.();});restart.hidden=true;manual.hidden=true;}
   finally{lock(false);}
  }
  function finish(){if(closed||busy)return;closed=true;draft={};log.replaceChildren();host.remove();document.body.classList.remove('nexBookingConversationOpen');}
  reset();
 }};
})();
