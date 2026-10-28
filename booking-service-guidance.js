(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.NexusServiceGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function recommendRideType(answers, allowedServices){
    const input = answers || {};
    const allowed=allowedServices instanceof Set?allowedServices:null;
    const candidates=[];
    if(input.lyingDown === 'yes') candidates.push({ service:'stretcher', reason:'The passenger needs to travel lying down.' });
    if(input.remainsInWheelchair === 'yes') candidates.push({ service:'wheelchair', reason:'The passenger will remain in a wheelchair during the ride.' });
    if(input.extraSpace === 'yes') candidates.push({ service:'bariatric', reason:'The passenger may need a bariatric service, including additional space or support.' });
    if(input.brodaChair === 'yes') candidates.push({ service:'broda', reason:'The passenger uses a Broda chair.' });
    candidates.push({ service:'ambulatory', reason:'The passenger can walk to and from the vehicle independently or with light assistance.' });
    if(!allowed)return candidates[0]||null;
    const first=candidates[0];
    const available=candidates.find((candidate)=>allowed.has(candidate.service));
    if(!available)return null;
    if(first&&available.service!==first.service){
      const labels={ambulatory:'Ambulatory',wheelchair:'Wheelchair',broda:'Broda',stretcher:'Stretcher',bariatric:'Bariatric'};
      return {...available,reason:`${first.reason} That option is unavailable for this account. The closest available option is ${labels[available.service]||available.service}; contact Nexus if you need another service.`};
    }
    return available;
  }
  return { recommendRideType };
});
