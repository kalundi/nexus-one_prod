(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.NexusFacilityMap=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const COLORS=['#0369a1','#7c3bb5','#b45309','#087f5b','#b42335'];
 const legFor=patient=>['return-approach','return','complete'].includes(patient.phase)?'return':'outbound';
 function pathPoint(points,progress){if(!points.length)return null;const lengths=points.slice(1).map((point,index)=>Math.hypot((point.lng()-points[index].lng())*Math.cos(point.lat()*Math.PI/180),point.lat()-points[index].lat()));let distance=lengths.reduce((sum,length)=>sum+length,0)*Math.max(0,Math.min(1,progress));for(let index=0;index<lengths.length;index++){if(distance<=lengths[index]){const fraction=lengths[index]?distance/lengths[index]:0;return {lat:points[index].lat()+(points[index+1].lat()-points[index].lat())*fraction,lng:points[index].lng()+(points[index+1].lng()-points[index].lng())*fraction};}distance-=lengths[index];}return points.at(-1);}
 function create({loadMaps,element,onSelect=()=>{},onStatus=()=>{},isActive=()=>true}){
  let maps,map,bounds,revision=0,displayedKey='',pendingKey='',pendingPromise=null,latest=null,overlays=[],drivers=[],routes=[];
  const cache=new Map(),failures=new Map();
  function remove(items){items.forEach(item=>{maps?.event?.clearInstanceListeners?.(item);item.setMap(null);});}
  function clear(){revision++;displayedKey='';pendingKey='';pendingPromise=null;remove(overlays);remove(drivers);overlays=[];drivers=[];routes=[];bounds=null;}
  function resize(){if(!map)return;maps.event?.trigger(map,'resize');if(bounds)map.fitBounds(bounds,{top:45,right:45,bottom:45,left:45});}
  function route(origin,destination){const key=JSON.stringify([origin,destination]);if(cache.has(key))return cache.get(key);const failed=failures.get(key);if(failed&&Date.now()-failed.at<30000)return Promise.reject(failed.error);const promise=new maps.DirectionsService().route({origin,destination,travelMode:'DRIVING'}).then(result=>{if(!result.routes?.[0]?.overview_path?.length)throw Error('No road route returned.');return result;}).catch(error=>{cache.delete(key);failures.set(key,{at:Date.now(),error});throw error;});cache.set(key,promise);return promise;}
  function addMarker(options,patient){const marker=new maps.Marker({...options,map});if(patient)marker.addListener('click',()=>onSelect(patient.id));overlays.push(marker);return marker;}
  function updateDrivers(scene){remove(drivers);drivers=[];for(const patient of scene.patients){if(scene.mode==='selected'&&patient.id!==scene.selectedId)continue;if(!['approach','outbound','return-approach','return'].includes(patient.phase))continue;const item=routes.find(route=>route.patientId===patient.id&&route.leg===legFor(patient));if(!item)continue;const progress=['approach','return-approach'].includes(patient.phase)?(1-patient.progress)*.3:patient.progress,position=pathPoint(item.path,progress);if(position){const driver=new maps.Marker({map,position,label:scene.mode==='all'?`D${item.index+1}`:'D',title:`${patient.name} · ${patient.driver} · ${patient.unit} · simulated vehicle`});driver.addListener('click',()=>onSelect(patient.id));drivers.push(driver);}}
  }
  function keyFor(scene){return JSON.stringify([scene.date,scene.mode,scene.mode==='all'?'':scene.selectedId,scene.mode==='all'?'both':scene.leg,scene.facility.address,scene.patients.map(p=>[p.id,p.destination.address])]);}
  async function draw(scene,key,token){
   maps=await loadMaps();if(token!==revision||!isActive())return;
   if(!map)map=new maps.Map(element,{center:{lat:38.99,lng:-76.53},zoom:11,mapTypeControl:false,streetViewControl:false,fullscreenControl:false});
   const plans=scene.patients.flatMap((patient,index)=>{if(scene.mode==='selected'&&patient.id!==scene.selectedId)return [];return (scene.mode==='all'?['outbound','return']:[scene.leg]).map(leg=>({patient,index,leg,origin:leg==='outbound'?scene.facility:patient.destination,destination:leg==='outbound'?patient.destination:scene.facility}));});
   const results=[];
   // Limit road-routing requests to two at a time; address-pair caching is shared across days.
   for(let index=0;index<plans.length;index+=2){const batch=plans.slice(index,index+2);results.push(...await Promise.all(batch.map(async plan=>{try{return {...plan,result:await route(plan.origin.address,plan.destination.address)};}catch(error){return {...plan,error};}})));if(token!==revision||!isActive())return;}
   bounds=new maps.LatLngBounds();const destinations=new Set(),copyrights=new Set(),warnings=new Set();let facilityMarked=false;
   for(const item of results){if(item.error)continue;const road=item.result.routes[0],path=road.overview_path,color=COLORS[item.index%COLORS.length],patient=item.patient;
    const line=new maps.Polyline({map,path,strokeColor:color,strokeWeight:5,strokeOpacity:scene.mode==='all'?0:.95,icons:scene.mode==='all'?[{icon:{path:maps.SymbolPath?.CIRCLE??'M 0,0 m -1,0 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0',scale:2.4,fillColor:color,fillOpacity:1,strokeColor:color,strokeOpacity:1,strokeWeight:1},offset:item.leg==='return'?'6px':'0',repeat:'14px'}]:[],zIndex:scene.mode==='all'?1:5});
    line.addListener('click',()=>onSelect(patient.id));overlays.push(line);routes.push({patientId:patient.id,index:item.index,leg:item.leg,path});if(road.bounds)bounds.union(road.bounds);path.forEach(point=>bounds.extend(point));if(road.copyrights)copyrights.add(road.copyrights);(road.warnings||[]).forEach(warning=>warnings.add(warning));
    if(scene.mode==='all'){
     if(!facilityMarked){addMarker({position:item.leg==='outbound'?path[0]:path.at(-1),label:'F',title:scene.facility.name});facilityMarked=true;}
     if(!destinations.has(patient.id)){addMarker({position:item.leg==='outbound'?path.at(-1):path[0],label:String(item.index+1),title:`${patient.name} · ${patient.destination.name} · select patient`},patient);destinations.add(patient.id);}
    }else{addMarker({position:path[0],label:'A',title:`A · ${item.origin.name} · ${item.origin.address}`});addMarker({position:path.at(-1),label:'B',title:`B · ${item.destination.name} · ${item.destination.address}`});}
   }
   displayedKey=key;updateDrivers(latest);if(routes.length)resize();
   const failed=results.filter(item=>item.error),message=scene.mode==='all'?`${routes.length} of ${plans.length} scheduled road routes shown as dotted lines (outbound and return). F = FutureCare; 1–5 = appointment destinations; D = simulated driver. Select a route, destination or patient to focus.`:`${scene.patients.find(p=>p.id===scene.selectedId)?.name||'Selected patient'} · ${scene.leg==='outbound'?'Outbound appointment route':'Return to FutureCare'} · only this patient is shown. A = pickup; B = destination; D = simulated driver.`;
   onStatus({message:message+(failed.length?` ${failed.length} route(s) unavailable: ${failed.map(item=>`${item.patient.name} ${item.leg}`).join(', ')}. Use Refresh routes to retry.`:''),attribution:[...copyrights].join(' · '),warnings:[...warnings],available:routes.length,total:plans.length});
  }
  function show(scene){latest=scene;const key=keyFor(scene);if(key===displayedKey){updateDrivers(scene);return Promise.resolve();}if(key===pendingKey&&pendingPromise)return pendingPromise;
   clear();latest=scene;pendingKey=key;const token=revision;onStatus({message:scene.mode==='all'?'Loading all scheduled road routes…':'Loading the selected patient’s road route…',attribution:'',warnings:[]});
   const task=draw(scene,key,token).catch(error=>{if(token===revision&&isActive())onStatus({message:error.message,attribution:'',warnings:[]});}).finally(()=>{if(token===revision){pendingKey='';pendingPromise=null;}});pendingPromise=task;return task;
  }
  return {show,clear,resize,retry(){failures.clear();clear();}};
 }
 return {COLORS,legFor,pathPoint,create};
});
