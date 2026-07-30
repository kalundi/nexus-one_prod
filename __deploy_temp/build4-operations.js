(function(){
  const VEHICLES_KEY='nexusFleet';
  const DRIVER_KEY='nexusDriverShift';
  const nowIso=()=>new Date().toISOString();
  const defaults=[
    {id:'204',type:'Wheelchair van',status:'ready',driver:'',mileage:48250,fuel:78,inspection:true,maintenanceDueMiles:1250,lastUpdate:nowIso(),lat:39.2534,lng:-77.2794,equipment:['Wheelchair lift','4-point restraints','First aid kit']},
    {id:'AMB-01',type:'BLS ambulance',status:'assigned',driver:'Marcus Johnson',mileage:61890,fuel:64,inspection:true,maintenanceDueMiles:2400,lastUpdate:nowIso(),lat:39.1774,lng:-77.2717,equipment:['Stretcher','Oxygen','AED','Emergency kit']},
    {id:'SH-03',type:'Medical shuttle',status:'maintenance',driver:'',mileage:73110,fuel:42,inspection:true,maintenanceDueMiles:0,lastUpdate:nowIso(),lat:39.2085,lng:-77.2446,equipment:['Wheelchair lift','6 passenger seats','First aid kit']},
    {id:'WV-02',type:'Wheelchair van',status:'ready',driver:'',mileage:39220,fuel:91,inspection:true,maintenanceDueMiles:3200,lastUpdate:nowIso(),lat:39.1457,lng:-77.2013,equipment:['Wheelchair lift','4-point restraints']},
    {id:'AMB-02',type:'ALS ambulance',status:'ready',driver:'',mileage:55220,fuel:86,inspection:true,maintenanceDueMiles:1800,lastUpdate:nowIso(),lat:39.2860,lng:-77.2050,equipment:['Stretcher','Oxygen','Cardiac monitor','AED']},
    {id:'SH-04',type:'Medical shuttle',status:'in-service',driver:'Alicia Brown',mileage:44600,fuel:59,inspection:true,maintenanceDueMiles:850,lastUpdate:nowIso(),lat:39.1251,lng:-77.1761,equipment:['Wheelchair lift','8 passenger seats']}
  ];
  function loadFleet(){try{const x=JSON.parse(localStorage.getItem(VEHICLES_KEY)||'null');return Array.isArray(x)&&x.length?x:defaults}catch{return defaults}}
  function saveFleet(f){localStorage.setItem(VEHICLES_KEY,JSON.stringify(f));window.dispatchEvent(new CustomEvent('nexus-fleet-updated',{detail:f}))}
  function loadShift(){try{return JSON.parse(localStorage.getItem(DRIVER_KEY)||'null')||{driver:'Marcus Johnson',vehicleId:'AMB-01',onDuty:true,inspectionComplete:false,checklist:{restraints:false,fuel:false,emergency:false,lift:false},activeTripId:'',lastStatus:'Ready',updatedAt:nowIso()}}catch{return {driver:'Marcus Johnson',vehicleId:'AMB-01',onDuty:true,inspectionComplete:false,checklist:{},lastStatus:'Ready'}}}
  function saveShift(s){s.updatedAt=nowIso();localStorage.setItem(DRIVER_KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent('nexus-driver-updated',{detail:s}))}
  function trips(){return window.NexusCore?.getTrips?.()||[]}
  function saveTrips(t){localStorage.setItem('nexusTrips',JSON.stringify(t));window.dispatchEvent(new Event('nexus-trips-updated'))}
  function nextStatus(current){const flow=['Requested','Quoted','Scheduled','Assigned','En Route','Arrived','Loaded','In Transit','Completed','Billed','Paid'];const i=flow.findIndex(x=>x.toLowerCase()===String(current||'').toLowerCase());return flow[Math.min(flow.length-1,Math.max(0,i+1))]||'Assigned'}
  function statusLabel(s){return String(s||'ready').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
  window.NexusOps={loadFleet,saveFleet,loadShift,saveShift,trips,saveTrips,nextStatus,statusLabel,nowIso};
})();
