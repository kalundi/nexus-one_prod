const REFERENCE='MOCK-LIVECARE-FLETCHER';
const NOTE='LIVECARE_DEMO_V1: Simulated LiveCare journey for Fletcher Kalundi. Fictional vehicle and locations; no transport, payments, notifications or calendar sync.';
const PHONE='+12405550199';
// Public sample locations, never a patient's actual home or device position.
const APPROACH=[[39.176,-77.268],[39.17,-77.26],[39.163,-77.25],[39.155,-77.24]];
const JOURNEY=[[39.155,-77.24],[39.145,-77.22],[39.13,-77.20],[39.115,-77.185],[39.10,-77.17],[39.085,-77.155],[39.07,-77.145],[39.055,-77.13],[39.04,-77.117]];
const STAGES=[
 {at:0,status:'EN_ROUTE',label:'Vehicle heading to pickup',message:'Your demo vehicle is on its way. Please be ready at the pickup entrance.'},
 {at:300,status:'ARRIVED',label:'Vehicle at pickup',message:'Your demo vehicle has arrived. The crew is waiting at the pickup entrance.'},
 {at:360,status:'PATIENT_ON_BOARD',label:'Patient on board',message:'Boarding is complete. Your demo crew is preparing to depart.'},
 {at:420,status:'IN_TRANSIT',label:'Traveling to destination',message:'Your demo trip is underway. Family and caregivers can follow this same page.'},
 {at:1020,status:'ARRIVED_DESTINATION',label:'Arrived at destination',message:'Your demo vehicle has reached the destination. The crew is assisting with arrival.'},
 {at:1080,status:'COMPLETED',label:'Trip complete',message:'Your demo trip is complete. Live vehicle tracking has ended.'}
];
function interpolate(points,fraction){const distance=Math.max(0,Math.min(1,fraction))*(points.length-1),index=Math.min(points.length-2,Math.floor(distance)),f=distance-index;return {latitude:points[index][0]+(points[index+1][0]-points[index][0])*f,longitude:points[index][1]+(points[index+1][1]-points[index][1])*f};}
function isDemo(booking){return booking.reference===REFERENCE&&String(booking.bookingSource||booking.booking_source).toUpperCase()==='MOCK'&&booking.notes===NOTE;}
function project(booking,now=Date.now()){
 if(!isDemo(booking))return null;
 const started=Date.parse(booking.createdAt||booking.created_at),elapsed=Math.max(0,(now-started)/1000);
 if(!Number.isFinite(elapsed))return null;
 const stage=STAGES.filter(s=>s.at<=elapsed).at(-1),completed=stage.status==='COMPLETED';
 const position=elapsed<300?interpolate(APPROACH,elapsed/300):elapsed<420?interpolate(APPROACH,1):interpolate(JOURNEY,(elapsed-420)/600);
 const eta=elapsed<300?Math.ceil((300-elapsed)/60):elapsed>=420&&elapsed<1020?Math.ceil((1020-elapsed)/60):0;
 return {...booking,livecareDemo:true,status:stage.status.toLowerCase().replaceAll('_','-'),statusLabel:`DEMO · ${stage.label}`,driver:'Demo crew (simulated)',vehicle:'DEMO-01 (simulated)',driverLocationVisible:!completed,driverLocation:completed?null:{...position,recordedAt:new Date(now).toISOString(),simulated:true},demo:{message:stage.message,etaMinutes:eta,completed,startedAt:new Date(started).toISOString(),route:elapsed<300?APPROACH:JOURNEY,timeline:STAGES.map(s=>({label:s.label,reached:s.at<=elapsed,at:new Date(started+s.at*1000).toISOString()}))}};
}
module.exports={REFERENCE,NOTE,PHONE,STAGES,project,isDemo};
