(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.NexusServiceGuidance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  function recommendRideType(answers){
    const input = answers || {};
    if(input.lyingDown === 'yes') return { service:'stretcher', reason:'The rider needs to travel lying down.' };
    if(input.remainsInWheelchair === 'yes') return { service:'wheelchair', reason:'The rider will remain in a wheelchair during the ride.' };
    if(input.extraSpace === 'yes') return { service:'bariatric', reason:'The rider needs additional space, capacity, or mobility support.' };
    return { service:'ambulatory', reason:'The rider can walk to and from the vehicle independently or with light assistance.' };
  }
  return { recommendRideType };
});
