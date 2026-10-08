const FLIGHT_NUMBER_PATTERN=/^[A-Z0-9]{2,3}\s?\d{1,5}[A-Z]?$/i;

function isValidTripDate(value){
 const date=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const parsed=new Date(`${date}T00:00:00.000Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date;
}

function airportSummary(airport={}){
 return {
  name:String(airport.airport_name||airport.name||'').trim(),
  code:String(airport.code_iata||airport.code_icao||airport.code_lid||'').trim()
 };
}

function scheduledDateFor(flight,arrivingAtPickup){
 const airport=arrivingAtPickup?flight.destination:flight.origin;
 const scheduled=String(arrivingAtPickup?flight.scheduled_in||'':flight.scheduled_out||'');
 if(!scheduled)return '';
 const instant=new Date(scheduled);
 if(airport?.timezone&&Number.isFinite(instant.getTime())){
  try{
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:airport.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
   const values=Object.fromEntries(parts.map(({type,value})=>[type,value]));
   return `${values.year}-${values.month}-${values.day}`;
  }catch{}
 }
 return scheduled.slice(0,10);
}

async function lookupFlight({flightNumber,date,airportStop,apiKey,fetchImpl=fetch}){
 const ident=String(flightNumber||'').trim().replace(/\s+/g,'').toUpperCase();
 const stop=String(airportStop||'').toUpperCase();
 if(!FLIGHT_NUMBER_PATTERN.test(ident))throw Object.assign(new Error('Enter a valid flight number, such as AA123.'),{statusCode:400});
 if(!isValidTripDate(date))throw Object.assign(new Error('Choose a valid trip date before looking up the flight.'),{statusCode:400});
 if(!['PICKUP','DESTINATION'].includes(stop))throw Object.assign(new Error('Choose whether the airport is the pickup or destination.'),{statusCode:400});
 if(!apiKey)throw Object.assign(new Error('Flight lookup is not configured yet.'),{statusCode:503});

 const start=new Date(`${date}T00:00:00.000Z`);
 start.setUTCDate(start.getUTCDate()-1);
 const end=new Date(`${date}T00:00:00.000Z`);
 end.setUTCDate(end.getUTCDate()+2);
 const url=new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`);
 url.searchParams.set('start',start.toISOString());
 url.searchParams.set('end',end.toISOString());

 let response;
 try{
  response=await fetchImpl(url,{headers:{'x-apikey':apiKey},signal:AbortSignal.timeout(10000)});
 }catch{
  throw Object.assign(new Error('Flight lookup is temporarily unavailable. Try again shortly.'),{statusCode:502});
 }
 if(!response.ok){
  if(response.status===404)return null;
  throw Object.assign(new Error(response.status===429?'Flight lookup is busy. Try again shortly.':'Flight lookup is temporarily unavailable.'),{statusCode:502});
 }
 const data=await response.json().catch(()=>({}));
 const flights=Array.isArray(data.flights)?data.flights:[];
 if(!flights.length)return null;
 const arrivingAtPickup=stop==='PICKUP';
 const matchingFlights=flights.filter((item)=>String(item.ident_iata||item.ident||'').replace(/\s+/g,'').toUpperCase()===ident);
 const flight=matchingFlights.find((item)=>scheduledDateFor(item,arrivingAtPickup)===date);
 if(!flight)return null;
 const airport=airportSummary(arrivingAtPickup?flight.destination:flight.origin);
 const terminal=String((arrivingAtPickup?flight.terminal_destination:flight.terminal_origin)||'').trim();
 const gate=String((arrivingAtPickup?flight.gate_destination:flight.gate_origin)||'').trim();
 return {
  flightNumber:String(flight.ident_iata||flight.ident||ident),
  status:String(flight.status||''),
  airportStop:stop,
  movement:arrivingAtPickup?'ARRIVAL':'DEPARTURE',
  airport,
  terminal:terminal||null,
  gate:gate||null,
  scheduledTime:String(arrivingAtPickup?flight.scheduled_in||'':flight.scheduled_out||''),
  origin:airportSummary(flight.origin),
  destination:airportSummary(flight.destination)
 };
}

module.exports={lookupFlight,isValidTripDate};
