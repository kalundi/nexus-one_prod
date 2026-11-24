/* Guided patient booking: no external AI or transcript storage. */
(function(){
 const labels={ONE_WAY:'One way',ROUND_TRIP:'Round trip',RECURRING:'Recurring'};
 window.NexusBookingConversation={mount(options){
  const host=document.createElement('section');host.className='nexusBookingConversation';host.setAttribute('aria-label','Nex booking conversation');
  const log=document.createElement('div');log.className='nexBookingLog';log.setAttribute('role','log');log.setAttribute('aria-live','polite');
  const controls=document.createElement('div');controls.className='nexBookingControls';
  const footer=document.createElement('div');footer.className='nexBookingActions';
  const restart=document.createElement('button');restart.type='button';restart.className='ghost';restart.textContent='Start over';restart.addEventListener('click',reset);
  footer.append(restart);log.append(controls,footer);host.append(log);document.body.append(host);document.body.classList.add('nexBookingConversationOpen');
  let draft={},closed=false,busy=false;
  function bubble(text,who='nex'){const el=document.createElement('p');el.className='nexBookingBubble '+who;const speaker=document.createElement('span');speaker.className='nexBookingSpeaker';speaker.textContent=who==='patient'?'You':'Nex';el.append(speaker,document.createTextNode(text));log.insertBefore(el,controls);log.scrollTop=log.scrollHeight;}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent=text;b.addEventListener('click',fn);controls.append(b);requestAnimationFrame(()=>{if(b.isConnected)log.scrollTop=log.scrollHeight;});return b;}
  function choose(question,choices,next){controls.replaceChildren();bubble(question);for(const [value,label] of choices)button(label,()=>{bubble(label,'patient');next(value);});}
  function ask(question,type,next,initial='',min='',max=''){
   controls.replaceChildren();bubble(question);const form=document.createElement('form');const input=document.createElement('input');input.type=type;input.required=true;input.maxLength=300;input.value=initial;input.setAttribute('aria-label',question);if(min)input.min=min;if(max)input.max=max;if(type==='text')input.placeholder='Type your answer…';const send=document.createElement('button');send.type='submit';send.textContent='Send';form.append(input,send);controls.append(form);
   if(type==='text'&&/where|address|destination|pick you up|ride you need|need to go/i.test(question))bindLocations(input,form,next);
   form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim();if(!value||!input.checkValidity()){input.reportValidity();return;}bubble(value,'patient');next(value,input.dataset.selectedLocation===value);});input.focus();
  }
  function bindLocations(input,form,next){
   const panel=document.createElement('div');panel.className='nexLocationSuggestions';panel.setAttribute('aria-label','Suggested locations');controls.append(panel);
   let timer,controller,version=0;
   const render=(values)=>{if(!panel.isConnected)return;panel.replaceChildren();for(const value of [...new Set(values)].slice(0,8)){const button=document.createElement('button');button.type='button';button.textContent=value;button.addEventListener('click',()=>{input.value=value;input.dataset.selectedLocation=value;panel.replaceChildren();input.focus();});panel.append(button);}};
   const search=()=>{clearTimeout(timer);controller?.abort();const id=++version;delete input.dataset.selectedLocation;const q=input.value.trim();if(!q){render(options.defaultLocations?.()||[]);return;}if(q.length<2){render([]);return;}timer=setTimeout(async()=>{controller=new AbortController();try{const values=await options.searchLocations?.(q,controller.signal)||[];if(id===version&&input.isConnected)render(values);}catch{}},150);};
   input.addEventListener('input',search);input.addEventListener('focus',()=>{if(!input.value.trim())render(options.defaultLocations?.()||[]);});
   if(!input.value.trim())render(options.defaultLocations?.()||[]);
  }
  function reset(){if(busy)return;draft={};log.replaceChildren(controls,footer);const name=String(options.firstName||'').trim();bubble(name?'Hi '+name+'! How can I help with your transportation today?':'Hi! How can I help with your transportation today?');choose('Are we arranging a ride for you or for someone else?',[['self','For me'],['other','For someone else']],v=>{if(v==='self'){draft.rider='self';if(options.pickup){draft.pickup=options.pickup;bubble('I have your saved pickup ready: '+options.pickup+'. You can change it if needed.');}chat('Of course. Tell me where you need to go and when.');}else{bubble('Absolutely. Let’s make sure we have the right passenger details.');button('Contact our transportation team',()=>contact());button('Actually, it’s for me',reset);}});}
  function chat(question,expected){
   ask(question,'text',(value,selectedLocation)=>{
    if(selectedLocation){if(expected==='pickup')draft.pickup=value;else draft.destination=value;next();return;}
    if(/\b(?:same (?:ride|trip|place|route)|usual (?:destination|hospital|dialysis(?: center)?|clinic|ride)|repeat (?:my |the )?(?:last|previous) (?:ride|trip)|last (?:ride|trip)|as last week)\b/i.test(value)){void recent(value);return;}
    const parsed=window.NexusBookingIntent?.extract(value,options.minDate)||{};
    if(/\b(?:change (?:my |the )?pickup|different pickup|not from home)\b/i.test(value)){delete draft.pickup;return chat('No problem. What address should we pick you up from?','pickup');}
    if(/\b(?:change (?:my |the )?destination|different destination)\b/i.test(value)){delete draft.destination;return chat('Of course. Where would you like to go instead?','destination');}
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
   if(!draft.basis){choose(draft.time?'Is that when you need to arrive, or when you want us to pick you up?':'Would you rather tell me when your appointment is, or when you want to be picked up?',[['APPOINTMENT','Appointment time'],['PICKUP','Pickup time']],v=>{draft.basis=v;next();});return;}
   if(!draft.time){ask(draft.basis==='PICKUP'?'What time should we pick you up?':'What time is your appointment?','time',v=>{draft.time=v;next();});return;}
   if(!draft.tripType){choose('Would you like us to bring you home afterward, or is this just one way?',Object.entries(labels),v=>{draft.tripType=v;next();});return;}
   if(draft.tripType==='ROUND_TRIP'&&(!draft.returnDate||draft.returnDate<draft.date)){ask('What date should we return to pick you up?','date',v=>{draft.returnDate=v;next();},draft.date,draft.date);return;}
   if(draft.tripType==='ROUND_TRIP'&&!draft.returnTime){ask('What time would you like us to pick you up afterward?','time',v=>{draft.returnTime=v;next();});return;}
   if(draft.tripType==='RECURRING'&&!draft.days){repeatDays();return;}
   if(draft.tripType==='RECURRING'&&!draft.endDate){const max=new Date(draft.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+84);ask('When should the recurring rides end?','date',d=>{draft.endDate=d;next();},'',draft.date,max.toISOString().slice(0,10));return;}
   if(!draft.service){const list=options.services||[];const saved=list.find(([v])=>v===options.service);choose('How can we make your ride comfortable? Would your usual transportation type work?',saved?[[saved[0],'Yes, '+saved[1]],['change','Change transportation type']]:list,v=>{if(v==='change')choose('What type of transportation do you need?',list,s=>{draft.service=s;next();});else{draft.service=v;next();}});return;}
   review();
  }
  function repeatDays(){controls.replaceChildren();bubble('Which days should we arrange this ride?');const form=document.createElement('form');const group=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Repeat days';group.append(legend);for(const day of ['MON','TUE','WED','THU','FRI','SAT','SUN']){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=day;l.append(i,document.createTextNode(' '+day));group.append(l);}const send=document.createElement('button');send.type='submit';send.textContent='Continue';form.append(group,send);controls.append(form);form.addEventListener('submit',e=>{e.preventDefault();const days=Array.from(group.querySelectorAll('input:checked'),i=>i.value);if(!days.length){bubble('Please select at least one day.');return;}draft.days=days;bubble(days.join(', '),'patient');const max=new Date(draft.date+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+84);ask('When should the recurring rides end?','date',d=>{draft.endDate=d;next();},'',draft.date,max.toISOString().slice(0,10));});}
  function review(){controls.replaceChildren();const selected=(options.services||[]).find(([v])=>v===draft.service)?.[1]||draft.service;bubble('Perfect, let me make sure I have everything right.');bubble(['Riding: '+(options.firstName||'You'),'Pickup: '+draft.pickup,'Destination: '+draft.destination,'Date: '+draft.date,(draft.basis==='PICKUP'?'Pickup':'Appointment')+' time: '+draft.time,'Trip: '+labels[draft.tripType],'Transportation: '+selected,draft.returnDate?'Return: '+draft.returnDate+' at '+draft.returnTime:'',draft.days?'Repeats: '+draft.days.join(', ')+' through '+draft.endDate:''].filter(Boolean).join('\n'));bubble('Let me check the fare and pickup time for you. Nothing has been booked yet.');button('Check fare',quote);button('Change pickup',()=>{delete draft.pickup;chat('Where should we pick you up instead?','pickup');});button('Change destination',()=>{delete draft.destination;chat('Where are you heading instead?','destination');});button('Change answers',()=>chat('What would you like to change?'));button('Start a different ride',reset);}
  function lock(value){busy=value;restart.disabled=value;controls.querySelectorAll('button,input').forEach(el=>el.disabled=value);}
  async function quote(){
   if(busy||closed)return;lock(true);bubble('I’m checking the route and current fare…');
   try{
    const result=await options.onQuote({...draft});
    if(!result||!result.signature||!(result.fare>0))throw Error('No valid estimate');
    controls.replaceChildren();
    const routeCard=document.createElement('section');routeCard.className='nexRouteCard';routeCard.setAttribute('aria-label','Estimated driving route');
    const summary=document.createElement('p');summary.textContent=[Number.isFinite(result.distance)&&result.distance>0?result.distance.toFixed(1)+' miles':'',result.duration||''].filter(Boolean).join(' · ');routeCard.append(summary);
    const map=document.createElement('div');map.className='nexRouteMap';map.setAttribute('aria-label','Map from pickup to destination');routeCard.append(map);log.insertBefore(routeCard,controls);
    try{if(!options.renderRoute?.(map)){map.remove();const unavailable=document.createElement('p');unavailable.textContent='Route map is unavailable right now.';routeCard.append(unavailable);}}catch{map.remove();const unavailable=document.createElement('p');unavailable.textContent='Route map is unavailable right now.';routeCard.append(unavailable);}
    log.scrollTop=log.scrollHeight;
    const fareCard=document.createElement('section');fareCard.className='nexFareReview';fareCard.setAttribute('aria-label','Estimated fare and ride confirmation');
    const label=document.createElement('div');label.className='nexFareLabel';label.textContent='Estimated fare';
    const amount=document.createElement('strong');amount.className='nexFareAmount';amount.textContent=Number(result.fare).toLocaleString(window.NexusI18n?.getLocale?.()||'en-US',{style:'currency',currency:'USD'});
    fareCard.append(label,amount);
    if(result.pickupTime){const pickup=document.createElement('p');pickup.className='nexFarePickup';const match=String(result.pickupTime).match(/^(\d{1,2}):(\d{2})$/);const time=match?Number(match[1])%12||12:null;pickup.textContent='Estimated pickup: '+(match?time+':'+match[2]+(Number(match[1])>=12?' PM':' AM'):result.pickupTime);fareCard.append(pickup);}
    const note=document.createElement('p');note.className='nexFareNote';note.textContent=draft.tripType==='RECURRING'?'Estimate for the displayed ride. Recurring charges depend on the schedule.':'Please review your fare before submitting. Nothing has been booked yet.';fareCard.append(note);
    log.insertBefore(fareCard,controls);
    const submitButton=button('Submit ride request',()=>submit(result));submitButton.classList.add('nexConfirmRide');
    button('Change answers',()=>{fareCard.remove();routeCard.remove();chat('What would you like to change?');});
   }catch(error){controls.replaceChildren();bubble('I couldn’t calculate your fare yet. '+(error?.message||'Please check the ride details.'));button('Try again',quote);button('Change pickup',()=>{delete draft.pickup;chat('Where should we pick you up?','pickup');});button('Change destination',()=>{delete draft.destination;chat('Where are you heading?','destination');});button('Contact Nexus',contact);}
   finally{lock(false);}
  }
  async function submit(quote){
   if(busy||closed)return;lock(true);bubble('I’m submitting your ride request…');
   try{
    const result=await options.onSubmit(quote);
    controls.replaceChildren();
    if(!result?.reference)throw Error('Unconfirmed submission');
    bubble((result.outcome||'Ride request received')+'. Reference: '+result.reference+'.');
    if(result.paymentRequired){bubble('Your request requires a secure payment step.');paymentChoices(result);}
    else{bubble('You can check the status under My rides.');button('View my rides',()=>{options.onTrips?.();});}
    restart.hidden=true;
   }catch{controls.replaceChildren();bubble('I couldn’t verify that the request was saved. Please check My rides before submitting again, or contact dispatch.');button('View my rides',()=>{options.onTrips?.();});restart.hidden=true;}
   finally{lock(false);}
  }
  function contact(){controls.replaceChildren();bubble('Our transportation team can help you complete this request. Call (888) 760-4990.');const link=document.createElement('a');link.href='tel:8887604990';link.textContent='Call Nexus';controls.append(link);button('Return to conversation',next);}
  function paymentChoices(result){
   controls.replaceChildren();
   const money=value=>Number(value).toLocaleString('en-US',{style:'currency',currency:'USD'});
   if(result.paymentAvailable){
    button('Pay 25% deposit · '+money(result.deposit),()=>pay('deposit',result));
    button('Pay in full · '+money(result.fare),()=>pay('full',result));
   }else bubble('Online payment is currently unavailable. Please contact Nexus for assistance.');
   button('View my rides',()=>options.onTrips?.());
  }
  async function pay(mode,result){
   if(busy||closed)return;lock(true);bubble('I’ll open secure checkout for you.');
   try{await options.onPayment(mode);}catch{bubble('I couldn’t open checkout. Your ride request has already been received. You can try payment again without submitting another ride.');paymentChoices(result);}
   finally{lock(false);}
  }
  function finish(){if(closed||busy)return;closed=true;draft={};log.replaceChildren();host.remove();document.body.classList.remove('nexBookingConversationOpen');}
  reset();
 }};
})();
