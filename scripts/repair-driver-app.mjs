import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'driver-app.js');
const source = fs.readFileSync(file, 'utf8');

const loadStart = source.indexOf('  async function loadTrips(options={}){');
const loadEnd = source.indexOf('\n  async function acceptTrip(ref){', loadStart);
const routeStart = source.indexOf('  function resetRouteAuto(tripRef=null){');
const routeEnd = source.indexOf('\n  function syncRouteAutoUi(trip){', routeStart);

if (loadStart < 0 || loadEnd < 0 || routeStart < 0 || routeEnd < 0) {
  throw new Error('Driver repair markers were not found. Refusing to modify driver-app.js.');
}

const repairedLoadTrips = `  async function loadTrips(options={}){
    const {reason='manual', silent=false}=options||{};
    if(tripSyncInFlight) return false;
    tripSyncInFlight=true;
    try{
      const r=await fetch('/api/driver/assignments',{headers:ah(),cache:'no-store'});
      if(!r.ok){
        throw new Error('Assignments request failed with HTTP '+r.status);
      }

      const j=await r.json();
      const previousTrips=Array.isArray(trips)?trips:[];
      const previousByRef=new Map(previousTrips.map((trip)=>[String(trip.ref||''),trip]));
      const nextTrips=(Array.isArray(j.assignments)?j.assignments:[]).map(b=>{
        const ref=String(b.reference||b.id||'');
        const previous=previousByRef.get(ref)||{};
        const pickupFromApi=b.pickupLat!=null?Number(b.pickupLat):b.pickup_lat!=null?Number(b.pickup_lat):null;
        const pickupLngFromApi=b.pickupLng!=null?Number(b.pickupLng):b.pickup_lng!=null?Number(b.pickup_lng):null;
        const destFromApi=b.destinationLat!=null?Number(b.destinationLat):b.destination_lat!=null?Number(b.destination_lat):null;
        const destLngFromApi=b.destinationLng!=null?Number(b.destinationLng):b.destination_lng!=null?Number(b.destination_lng):null;
        const pickupFallback=coordForAddress(b.pickup||'');
        const destFallback=coordForAddress(b.destination||'');
        const status=normalizeBookingStatus(b.status||'SCHEDULED');

        return {
          pickupLat:Number.isFinite(pickupFromApi)?pickupFromApi:(pickupFallback?.lat??null),
          pickupLng:Number.isFinite(pickupLngFromApi)?pickupLngFromApi:(pickupFallback?.lng??null),
          destinationLat:Number.isFinite(destFromApi)?destFromApi:(destFallback?.lat??null),
          destinationLng:Number.isFinite(destLngFromApi)?destLngFromApi:(destFallback?.lng??null),
          ref,
          date:normalizeTripDate(b.date||b.trip_date||''),
          time:(b.time||b.trip_time||'').slice(0,5),
          pickup:b.pickup||'',
          destination:b.destination||'',
          vehicleUnit:String(b.vehicleUnit||b.vehicle_unit||b.vehicle||'').trim().toUpperCase(),
          patient:b.name||'Patient',
          service:b.service||'',
          status,
          notes:b.notes||'',
          distanceMiles:b.distanceMiles!=null?Number(b.distanceMiles):null,
          distMi:b.distanceMiles!=null?Number(b.distanceMiles).toFixed(1):null,
          accepted:Boolean(previous.accepted)||acceptedStatus(status),
          comments:previous.comments||'',
        };
      });

      const nextSignature=buildTripSyncSignature(nextTrips);
      const hadSignature=Boolean(lastTripSyncSignature);
      const changed=hadSignature ? nextSignature!==lastTripSyncSignature : true;
      const removedRefs=[];
      const changedRefs=[];

      if(hadSignature){
        const nextByRef=new Map(nextTrips.map((trip)=>[String(trip.ref||''),trip]));
        previousByRef.forEach((trip,ref)=>{
          if(ref&&!nextByRef.has(ref)) removedRefs.push(ref);
        });
        nextByRef.forEach((trip,ref)=>{
          const previous=previousByRef.get(ref);
          if(!previous || tripSnapshotKey(previous)!==tripSnapshotKey(trip)) changedRefs.push(ref);
        });
      }

      trips=nextTrips;
      lastTripSyncSignature=nextSignature;
      lastTripSyncAt=Date.now();

      if(activeRef && !trips.some((trip)=>trip.ref===activeRef)){
        activeRef=null;
      }

      if(changed||!silent||reason!=='poll'){
        updateBadge();
        renderDash();
        if($('#manifestView')?.classList.contains('active')) renderManifest();
      }

      if($('#tripView')?.classList.contains('active')&&activeRef){
        const activeTrip=trips.find((trip)=>trip.ref===activeRef);
        if(activeTrip){
          renderTripDetailPanel(activeTrip);
        }else{
          dashNotice('This trip was updated by dispatch and is no longer in your active list.','info');
          showView('manifestView');
        }
      }

      if(changed&&hadSignature&&reason==='poll'){
        const updateCount=changedRefs.length+removedRefs.length;
        const message=updateCount
          ? \`Live dispatch update: \${updateCount} trip\${updateCount===1?'':'s'} changed. Synced at \${formatSyncTime(lastTripSyncAt)}.\`
          : \`Live dispatch update received. Synced at \${formatSyncTime(lastTripSyncAt)}.\`;
        setManifestNotice(message,'ok',5000);
      }else if(!changed&&$('#manifestView')?.classList.contains('active')&&!silent){
        setManifestNotice(\`Live updates on. Last synced at \${formatSyncTime(lastTripSyncAt)}.\`,'info',2800);
      }

      return changed;
    }catch(error){
      console.error('[DRIVER] assignment sync failed:',error);
      if(!silent){
        setManifestNotice('Unable to refresh assigned trips. Your last loaded trips remain visible.','err',5000);
      }
      return false;
    }finally{
      tripSyncInFlight=false;
    }
  }
`;

const repairedRouteState = `  function resetRouteAuto(tripRef=null){
    routeAuto={
      enabled:false,
      tripRef,
      startOdo:null,
      milesSinceStart:0,
      lastPos:null,
      segmentStartMiles:0,
      segmentStartOdo:null,
      pickupCoord:null,
      destinationCoord:null,
      arrivedDestinationAt:null,
      updating:false,
    };
  }

  function statusLabelPlain(status){
    return String(status||'').replaceAll('_',' ').trim();
  }
`;

let repaired = source.slice(0, loadStart) + repairedLoadTrips + source.slice(loadEnd);
const adjustedRouteStart = repaired.indexOf('  function resetRouteAuto(tripRef=null){');
const adjustedRouteEnd = repaired.indexOf('\n  function syncRouteAutoUi(trip){', adjustedRouteStart);

if (adjustedRouteStart < 0 || adjustedRouteEnd < 0) {
  throw new Error('Driver route-state repair markers were not found after trip-sync repair.');
}

repaired = repaired.slice(0, adjustedRouteStart) + repairedRouteState + repaired.slice(adjustedRouteEnd);

if (repaired.includes('const nextSignature=buildTripSyncSignature(nextTrips);') && repaired.indexOf('const nextSignature=buildTripSyncSignature(nextTrips);') > repaired.indexOf('function resetRouteAuto')) {
  throw new Error('Repair validation failed: synchronization logic is still inside route state.');
}

fs.writeFileSync(file, repaired, 'utf8');
console.log('driver-app.js repaired: assignment synchronization and route state restored.');
