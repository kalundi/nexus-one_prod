const REFERENCE='MOCK-LIVECARE-FLETCHER';
const NOTE='LIVECARE_DEMO_V1: Simulated LiveCare journey for Fletcher Kalundi. Fictional vehicle and locations; no transport, payments, notifications or calendar sync.';
const PHONE='+12405550199';
const DRIVER='James Carter (demo driver)';
// Public sample locations, never a patient's actual home or device position.
const APPROACH=[[39.176,-77.268],[39.17,-77.26],[39.163,-77.25],[39.155,-77.24]];
const JOURNEY=[[39.155,-77.24],[39.145,-77.22],[39.13,-77.20],[39.115,-77.185],[39.10,-77.17],[39.085,-77.155],[39.07,-77.145],[39.055,-77.13],[39.04,-77.117]];
const STAGES=[
 {at:0,status:'EN_ROUTE',label:'Vehicle heading to pickup',message:'Your demo vehicle is on its way. Please be ready at the pickup entrance.'},
 {at:20,status:'ARRIVED',label:'Vehicle at pickup',message:'James Carter has arrived at pickup and is waiting at the entrance.'},
 {at:28,status:'PATIENT_ON_BOARD',label:'Patient on board',message:'Boarding is complete. James Carter is preparing to depart.'},
 {at:35,status:'IN_TRANSIT',label:'Traveling to destination',message:'James Carter is driving to the destination. Follow the blue route on the map.'},
 {at:125,status:'ARRIVED_DESTINATION',label:'Arrived at destination',message:'James Carter has reached the destination and is assisting with arrival.'},
 {at:135,status:'COMPLETED',label:'Trip complete',message:'Your demo trip is complete. Live vehicle tracking has ended.'}
];
const RECIPIENTS=['Patient: Fletcher Kalundi','Family / caregiver (demo contact)','Pickup contact (demo contact)','Destination contact (demo contact)','Dispatch'];
function communications(started,elapsed){
 const clock=seconds=>new Date(started+seconds*1000).toISOString();
 const events=[
  {at:0,title:'Driver activated trip',text:'James Carter is on his way to pick up Fletcher Kalundi.',eta:20},
  {at:20,title:'Driver arrived at pickup',text:'James Carter has arrived. Please meet the vehicle at the entrance.'},
  {at:28,title:'Patient safely on board',text:'Fletcher Kalundi is on board with James Carter. Departure is next.'},
  {at:35,title:'Departed for destination',text:'The vehicle is traveling to the destination. Follow the blue route for its whereabouts.',eta:110},
  {at:55,title:'Delay detected — ETA updated',text:'A simulated traffic delay has added 15 seconds to the demo journey. The destination contact and everyone monitoring this ride receive the revised ETA.',eta:125,delay:true},
  {at:70,title:'Vehicle moving again',text:'The simulated traffic delay has cleared. James Carter is moving again; the revised arrival time remains in effect.',eta:125},
  {at:125,title:'Arrived at destination',text:'Fletcher Kalundi has arrived. James Carter is assisting with the destination handoff.'},
  {at:135,title:'Trip completed',text:'The destination handoff is complete. Vehicle tracking has ended.'}
 ];
 return events.filter(event=>event.at<=elapsed).map(event=>({...event,id:`${started}-${event.at}`,timestamp:clock(event.at),etaAt:event.eta==null?null:clock(event.eta),recipients:RECIPIENTS,channel:'Simulated SMS / in-app notification',deliveryStatus:'SIMULATED — not sent'}));
}
function interpolate(points,fraction){const distance=Math.max(0,Math.min(1,fraction))*(points.length-1),index=Math.min(points.length-2,Math.floor(distance)),f=distance-index;return {latitude:points[index][0]+(points[index+1][0]-points[index][0])*f,longitude:points[index][1]+(points[index+1][1]-points[index][1])*f};}
function isDemo(booking){return booking.reference===REFERENCE&&String(booking.bookingSource||booking.booking_source).toUpperCase()==='MOCK'&&booking.notes===NOTE;}
function project(booking,now=Date.now()){
 if(!isDemo(booking))return null;
 const started=Date.parse(booking.createdAt||booking.created_at),elapsed=Math.max(0,(now-started)/1000);
 if(!Number.isFinite(elapsed))return null;
 const stage=STAGES.filter(s=>s.at<=elapsed).at(-1),completed=stage.status==='COMPLETED';
 const delayed=elapsed>=55&&elapsed<70,delayDetected=elapsed>=55;
 const drivingElapsed=Math.max(0,elapsed-35-Math.max(0,Math.min(15,elapsed-55)));
 const routeProgress=elapsed<20?elapsed/20:elapsed<35?1:Math.min(1,drivingElapsed/75);
 const position=elapsed<35?interpolate(APPROACH,routeProgress):interpolate(JOURNEY,routeProgress);
 const etaSeconds=elapsed<20?Math.ceil(20-elapsed):elapsed>=35&&elapsed<125?Math.ceil((delayDetected?125:110)-elapsed):0;
 const message=delayed?'Traffic delay detected. Everyone monitoring this trip, including the destination contact, has a simulated updated ETA alert.':stage.message;
 return {...booking,livecareDemo:true,status:stage.status.toLowerCase().replaceAll('_','-'),statusLabel:`DEMO · ${delayed?'Traffic delay — ETA revised':stage.label}`,driver:DRIVER,driverName:DRIVER,vehicle:'DEMO-01 (simulated)',vehicleUnit:'DEMO-01 (simulated)',driverLocationVisible:!completed,driverLocation:completed?null:{...position,recordedAt:new Date(now).toISOString(),simulated:true},demo:{message,etaMinutes:Math.ceil(etaSeconds/60),etaSeconds,etaAt:etaSeconds?new Date(now+etaSeconds*1000).toISOString():null,completed,delayed,delayDetected,delaySeconds:delayDetected?15:0,durationSeconds:135,elapsedSeconds:elapsed,routePhase:elapsed<35?'pickup':'destination',routeProgress,approachOrigin:{lat:APPROACH[0][0],lng:APPROACH[0][1]},startedAt:new Date(started).toISOString(),communications:communications(started,elapsed),timeline:STAGES.map(s=>({label:s.label,reached:s.at<=elapsed,at:new Date(started+s.at*1000).toISOString()}))}};
}
module.exports={REFERENCE,NOTE,PHONE,DRIVER,STAGES,project,isDemo};
