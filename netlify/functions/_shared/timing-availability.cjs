const Timing=require('../../../nexus-trip-timing.js');
const Trips=require('./trip-timing.cjs');
const {buildDriverScopeSql}=require('./employee-driver-lookup.cjs');
function coversWindow(shifts,plan){
 const start=plan.crewArrivalAt,end=plan.vehicleAvailableAt;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>14*86400000)return false;
 let cursor=start;
 const first=Date.parse(Timing.localParts(start).date+'T12:00:00Z'),last=Date.parse(Timing.localParts(end).date+'T12:00:00Z');
 for(let day=first;day<=last;day+=86400000){
  const date=new Date(day).toISOString().slice(0,10),weekday=new Date(date+'T12:00:00Z').getUTCDay()||7;
  const Fare=require('../../../nexus-fare.js');
  const windows=shifts.filter(s=>Number(s.weekday_iso)===weekday&&String(s.effective_start_date).slice(0,10)<=date&&(!s.effective_end_date||String(s.effective_end_date).slice(0,10)>=date)).map(s=>({start:Fare.scheduledEpoch(date,String(s.start_time).slice(0,5)),end:Fare.scheduledEpoch(date,String(s.end_time).slice(0,5))})).sort((a,b)=>a.start-b.start);
  for(const w of windows)if(w.start<=cursor&&w.end>cursor)cursor=w.end;
  if(cursor>=end)return true;
 }
 return false;
}
async function resources(booking,settings,query,prefs,{allowPastPickup=false}={}){
 const occupied=await Trips.occupancy(booking,settings,query),plan=occupied.plan;
 if(!plan||plan.routingPending||plan.returnTimePending)return {plan,drivers:[],vehicles:[],reviewReason:'A complete route and return schedule are required to confirm resource availability.'};
 const inProgress=['EN_ROUTE','ARRIVED','ARRIVED_PICKUP','PATIENT_ON_BOARD','DEPARTED','ARRIVED_DESTINATION','DELIVERED','IN_TRANSIT'].includes(String(booking.status||'').toUpperCase().replaceAll('-','_'));
 if(plan.crewArrivalAt<Date.now()&&!inProgress&&!allowPastPickup)return {plan,drivers:[],vehicles:[],reviewCode:'PICKUP_WINDOW_PASSED',reviewReason:'The pickup window has passed. Review the entered times and use the timing override to save.'};
 const shifts=await query(`SELECT e.id,e.user_id,e.display_name,e.email,e.phone,${buildDriverScopeSql('u')} AS scope_id,es.weekday_iso,es.start_time::text,es.end_time::text,es.effective_start_date::text,es.effective_end_date::text
  FROM employees e JOIN users u ON u.id=e.user_id JOIN employee_shifts es ON es.employee_id=e.id
  WHERE e.role='DRIVER' AND e.active=true AND u.active=true AND es.active=true AND es.assignment_role='DRIVER'
   AND (u.role='DRIVER' OR EXISTS(SELECT 1 FROM user_role_requests rr WHERE rr.user_id=u.id AND rr.role='DRIVER' AND rr.status='APPROVED')) ORDER BY e.display_name`);
 const grouped=new Map();for(const row of shifts.rows){const entry=grouped.get(row.id)||{driver:row,shifts:[]};entry.shifts.push(row);grouped.set(row.id,entry);}
 const drivers=[...grouped.values()].filter(g=>coversWindow(g.shifts,plan)&&!Trips.conflicts(plan,occupied.trips,g.driver,null).length).map(g=>g.driver);
 const fleet=await query(`SELECT unit_number FROM vehicles WHERE active=true AND status='AVAILABLE' ${prefs?'AND unit_number=ANY($1::text[])':''} ORDER BY unit_number`,prefs?[prefs]:[]);
 const vehicles=fleet.rows.filter(v=>!Trips.conflicts(plan,occupied.trips,null,v.unit_number).length);
 return {plan,drivers,vehicles,reviewReason:plan.alerts.length?'Review timing alerts before assignment.':null};
}
module.exports={coversWindow,resources};
