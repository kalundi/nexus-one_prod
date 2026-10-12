const Timing=require('../../../nexus-trip-timing.js');
const cache=new Map();
const cmsCache=new Map();
const cmsDatasets=[['7t8x-u3ir','REHAB','address_line_1','provider_name'],['23ew-n7w9','DIALYSIS','address_line_1','facility_name'],['4pq5-n9py','NURSING','provider_address','provider_name'],['xubh-q36u','HOSPITAL','address','facility_name']];
async function cmsByZip(zip,fetcher=fetch){
 const saved=cmsCache.get(zip);if(saved&&saved.expires>Date.now())return saved.promise;
 const promise=Promise.all(cmsDatasets.map(async([id,type,street,name])=>{
  try{const url=new URL('https://data.cms.gov/provider-data/api/1/datastore/query/'+id+'/0');url.searchParams.set('conditions[0][property]','zip_code');url.searchParams.set('conditions[0][value]',zip);url.searchParams.set('conditions[0][operator]','=');url.searchParams.set('limit','100');
   const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(3000)});if(!response.ok)return [];
   const data=await response.json();return (data.results||[]).filter(r=>String(r.zip_code).padStart(5,'0').slice(0,5)===zip).map(r=>({facilityType:type,address:r[street],city:r.citytown,name:r[name],zip,ccn:String(r.cms_certification_number_ccn||r.facility_id||''),dataset:id}));
  }catch{return [];}
 })).then(groups=>groups.flat());
 if(cmsCache.size>200)cmsCache.clear();cmsCache.set(zip,{promise,expires:Date.now()+3600000});return promise;
}
function streetMatches(address,street,city){const supplied=streetKey(String(address).split(',')[0]),expected=streetKey(street);return supplied===expected||!!city&&supplied===expected+' '+streetKey(city)||!!city&&supplied.startsWith(expected+' '+streetKey(city)+' ');}
function matchCms(address,records){const zip=String(address).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];const matched=records.filter(r=>r.zip===zip&&streetMatches(address,r.address,r.city));return new Set(matched.map(r=>r.facilityType)).size===1?matched[0]||null:null;}
function classify(place={}){
 const name=String(place.name||''),types=Array.isArray(place.types)?place.types:[];
 const inferred=Timing.facilityType(name);
 const facilityType=inferred!=='UNKNOWN'?inferred:types.includes('hospital')?'HOSPITAL':types.includes('medical_clinic')||types.includes('doctor')?'CLINIC':types.some(t=>['apartment_building','apartment_complex','housing_complex'].includes(t))?'RESIDENCE':'UNKNOWN';
 return {name,facilityType,placeId:String(place.placeId||''),identificationSource:facilityType==='UNKNOWN'?'UNCLASSIFIED':'GOOGLE_PLACES',identificationConfidence:facilityType==='UNKNOWN'?'LOW':'MEDIUM'};
}
function npiType(result){
 const text=(result.taxonomies||[]).map(t=>t.desc||'').join(' ').toLowerCase();
 return /dialysis|end.stage renal/.test(text)?'DIALYSIS':/rehabilitation hospital|rehabilitation facility/.test(text)?'REHAB':/skilled nursing|nursing facility/.test(text)?'NURSING':/hospital/.test(text)?'HOSPITAL':/clinic|center/.test(text)?'CLINIC':'UNKNOWN';
}
function streetKey(address){return Timing.addressKey(address).replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\bavenue\b/g,'ave').replace(/\bdrive\b/g,'dr').replace(/\bplace\b/g,'pl').replace(/\bboulevard\b/g,'blvd').replace(/\bsuite\b.*$/,'').trim();}
function matchNpi(address,results){
 const zip=String(address).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1],street=streetKey(String(address).split(',')[0]);
 if(!zip||!/^\d+\b/.test(street))return null;
 const matched=results.filter(r=>r.enumeration_type==='NPI-2'&&(r.addresses||[]).some(a=>a.address_purpose==='LOCATION'&&String(a.postal_code).slice(0,5)===zip&&streetMatches(address,a.address_1,a.city))&&npiType(r)!=='UNKNOWN');
 return new Set(matched.map(npiType)).size===1?matched[0]||null:null;
}
async function identify(address,place={},fetcher=fetch){
 const hint=classify(place),key=Timing.addressKey(address),saved=cache.get(key);
 if(saved&&saved.expires>Date.now())return {...hint,...saved.value};
 // Query organizations only, with a known facility name and ZIP; never send patient data.
 const zip=String(address).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
 if(zip){const matched=matchCms(address,await cmsByZip(zip,fetcher));if(matched){const value={name:matched.name,facilityType:matched.facilityType,ccn:matched.ccn,identificationSource:'CMS_CARE_COMPARE',identificationConfidence:'HIGH',sourceUrl:'https://data.cms.gov/provider-data/dataset/'+matched.dataset};if(cache.size>500)cache.clear();cache.set(key,{value,expires:Date.now()+3600000});return {...hint,...value};}}
 if(!zip||hint.facilityType==='UNKNOWN'||hint.facilityType==='RESIDENCE'||!hint.name)return hint;
 try{
  const params=new URLSearchParams({version:'2.1',enumeration_type:'NPI-2',organization_name:hint.name,postal_code:zip,limit:'20'});
  const response=await fetcher('https://npiregistry.cms.hhs.gov/api/?'+params,{signal:AbortSignal.timeout(2500)});
  if(!response.ok)return hint;
  const payload=await response.json(),matched=matchNpi(address,payload.results||[]);
  if(matched){const value={facilityType:npiType(matched),npi:String(matched.number),identificationSource:'NPPES_NPI_REGISTRY',identificationConfidence:'HIGH'};if(cache.size>500)cache.clear();cache.set(key,{value,expires:Date.now()+3600000});return {...hint,...value};}
 }catch{}
 return hint;
}
module.exports={classify,npiType,matchNpi,matchCms,cmsByZip,identify};
