(function(){
  const safeDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:d};
  const hourOf=trip=>{const raw=trip.time||'09:00';const h=Number(String(raw).split(':')[0]);return Number.isFinite(h)?h:9};
  const serviceWeight={ambulatory:1,wheelchair:1.2,broda:1.35,stretcher:1.65,bariatric:1.9,bls:2.2,als1:2.6,als2:3};
  function riskScore(trip){
    let score=12; const reasons=[];
    const h=hourOf(trip);
    if(h>=7&&h<=9){score+=20;reasons.push('morning demand window')}
    if(h>=15&&h<=18){score+=24;reasons.push('afternoon demand window')}
    const service=String(trip.service||'wheelchair').toLowerCase();
    const weight=serviceWeight[service]||1;
    score+=Math.round((weight-1)*20);
    if(weight>=1.6)reasons.push('specialized crew or equipment');
    const distance=Number(trip.miles||trip.distanceMiles||0);
    if(distance>20){score+=15;reasons.push('long-distance trip')}
    if(!trip.driverId&&!trip.driver){score+=18;reasons.push('driver not assigned')}
    if(!trip.vehicleId&&!trip.vehicle){score+=14;reasons.push('vehicle not assigned')}
    if(['requested','scheduled'].includes(String(trip.status||'').toLowerCase()))score+=8;
    score=Math.max(0,Math.min(99,score));
    return {score,level:score>=70?'High':score>=45?'Medium':'Low',reasons:reasons.length?reasons:['normal operating profile']};
  }
  function forecast(trips){
    const buckets={Morning:0,Midday:0,Afternoon:0,Evening:0};
    trips.forEach(t=>{const h=hourOf(t);if(h<11)buckets.Morning++;else if(h<15)buckets.Midday++;else if(h<19)buckets.Afternoon++;else buckets.Evening++});
    const total=trips.length||1;
    return Object.entries(buckets).map(([period,count])=>({period,count,share:Math.round(count/total*100),capacity:Math.max(1,Math.ceil(count/3))}));
  }
  function assignment(trip,drivers,vehicles){
    const service=String(trip.service||'wheelchair').toLowerCase();
    const needsAmbulance=['bls','als1','als2'].includes(service);
    const needsLift=['wheelchair','broda','bariatric'].includes(service);
    const availableDrivers=(drivers||[]).filter(d=>d.status!=='off-duty'&&d.available!==false);
    const availableVehicles=(vehicles||[]).filter(v=>v.status!=='maintenance'&&v.available!==false);
    const driver=availableDrivers.find(d=>needsAmbulance?String(d.certification||'').match(/EMT|Paramedic/i):true)||availableDrivers[0];
    const vehicle=availableVehicles.find(v=>needsAmbulance?String(v.type||'').match(/ambulance/i):needsLift?String(v.features||v.type||'').match(/lift|wheelchair|accessible|bariatric/i):true)||availableVehicles[0];
    return {driver,vehicle,confidence:driver&&vehicle?Math.max(62,92-riskScore(trip).score/3):35,explanation:driver&&vehicle?'Matched availability, service capability and operating status.':'More driver or vehicle availability is required.'};
  }
  function anomalies(trips){
    const values=trips.map(t=>Number(t.quote?.total||t.amount||0)).filter(n=>n>0);
    const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    return trips.map(t=>{const amount=Number(t.quote?.total||t.amount||0);const ratio=avg?amount/avg:1;return {trip:t,amount,flag:ratio>2.25||ratio<.3,reason:ratio>2.25?'Fare materially above current portfolio average':ratio<.3?'Fare materially below current portfolio average':'Within expected range'}}).filter(x=>x.flag);
  }
  function recommendations(trips){
    const risks=trips.map(t=>({trip:t,...riskScore(t)})).sort((a,b)=>b.score-a.score);
    const f=forecast(trips); const peak=[...f].sort((a,b)=>b.count-a.count)[0];
    const rec=[];
    if(peak&&peak.count)rec.push({priority:'High',title:`Position capacity for ${peak.period.toLowerCase()} demand`,detail:`Current schedule shows ${peak.count} trips. Stage approximately ${peak.capacity} active vehicle${peak.capacity===1?'':'s'} before the demand window.`});
    if(risks[0]?.score>=70)rec.push({priority:'High',title:`Intervene on ${risks[0].trip.reference||risks[0].trip.id||'highest-risk trip'}`,detail:`Delay risk is ${risks[0].score}%. ${risks[0].reasons.join(', ')}.`});
    const unassigned=trips.filter(t=>!t.driverId&&!t.driver).length;
    if(unassigned)rec.push({priority:'Medium',title:'Complete driver assignments',detail:`${unassigned} trip${unassigned===1?' is':'s are'} not yet assigned to a driver.`});
    const a=anomalies(trips);if(a.length)rec.push({priority:'Medium',title:'Review pricing exceptions',detail:`${a.length} trip${a.length===1?' has':'s have'} fares outside the current operating range.`});
    if(!rec.length)rec.push({priority:'Low',title:'Operations are balanced',detail:'No immediate scheduling, capacity or pricing exception was detected.'});
    return rec;
  }
  window.NexusAI={riskScore,forecast,assignment,anomalies,recommendations};
})();
