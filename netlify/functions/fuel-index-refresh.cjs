const {query}=require('./_shared/db.cjs');

const PLATFORM_KEY='platform';

function toNum(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}

async function fetchEiaWeeklyPrice(){
  const buildQs=(apiKey)=>new URLSearchParams({
    frequency:'weekly',
    'data[0]':'value',
    'facets[duoarea][]':'NUS',
    'facets[product][]':'EPM0',
    'sort[0][column]':'period',
    'sort[0][direction]':'desc',
    offset:'0',
    length:'1',
    api_key:apiKey
  });
  const keys=[];
  if(process.env.EIA_API_KEY)keys.push(process.env.EIA_API_KEY);
  if(!keys.includes('DEMO_KEY'))keys.push('DEMO_KEY');

  let lastError=null;
  for(const k of keys){
    const qs=buildQs(k);
    const url=`https://api.eia.gov/v2/petroleum/pri/gnd/data/?${qs.toString()}`;
    const r=await fetch(url,{headers:{accept:'application/json'}});
    if(!r.ok){
      lastError=new Error(`EIA request failed (${r.status})`);
      continue;
    }
    const data=await r.json();
    const value=toNum(data?.response?.data?.[0]?.value,NaN);
    if(Number.isFinite(value)&&value>0){
      return {pricePerGallon:value,sourceUrl:url};
    }
    lastError=new Error('EIA did not return a usable fuel price');
  }
  throw (lastError||new Error('EIA request failed'));
}

exports.handler=async()=>{
  try{
    const row=await query(`SELECT value FROM system_settings WHERE key=$1 LIMIT 1`,[PLATFORM_KEY]);
    if(!row.rows[0]) return {statusCode:404,body:JSON.stringify({error:'platform settings missing'})};

    const settings=row.rows[0].value||{};
    const fareRules=settings.fareRules||{};
    const mode=String(fareRules.fuelPricingMode||'MANUAL').toUpperCase();
    if(mode!=='AUTO'){
      return {statusCode:200,body:JSON.stringify({updated:false,reason:'fuelPricingMode is MANUAL'})};
    }

    let indexPrice=0;
    let source='EIA';
    let sourceUrl='';
    try{
      const eia=await fetchEiaWeeklyPrice();
      indexPrice=eia.pricePerGallon;
      source='EIA';
      sourceUrl=eia.sourceUrl;
    }catch(err){
      const fallback=toNum(process.env.NEXUS_FUEL_INDEX_DEFAULT,NaN);
      if(Number.isFinite(fallback)&&fallback>0){
        indexPrice=fallback;
        source='ENV_FALLBACK';
      }else if(toNum(fareRules.fuelIndexPricePerGallon,0)>0){
        indexPrice=toNum(fareRules.fuelIndexPricePerGallon,0);
        source='LAST_KNOWN';
      }else{
        return {statusCode:200,body:JSON.stringify({updated:false,reason:err.message})};
      }
    }

    const mpg=Math.max(1,toNum(fareRules.fuelEfficiencyMpg,10));
    const baseline=Math.max(0,toNum(fareRules.fuelBaselinePricePerGallon,3.25));
    const bufferPct=Math.max(0,toNum(fareRules.fuelOperationalBufferPct,20));

    const basePerMile=baseline/mpg;
    const currentPerMile=indexPrice/mpg;
    const delta=Math.max(0,currentPerMile-basePerMile);
    const surcharge=Math.round((delta*(1+(bufferPct/100)))*100)/100;

    const nextFareRules={
      ...fareRules,
      fuelIndexPricePerGallon:Math.round(indexPrice*1000)/1000,
      fuelSurchargePerMile:surcharge,
      fuelLastUpdatedAt:new Date().toISOString(),
      fuelIndexSource:source
    };

    await query(
      `UPDATE system_settings SET value=$2::jsonb, updated_at=now() WHERE key=$1`,
      [PLATFORM_KEY,JSON.stringify({...settings,fareRules:nextFareRules})]
    );

    return {
      statusCode:200,
      body:JSON.stringify({
        updated:true,
        fuelIndexPricePerGallon:nextFareRules.fuelIndexPricePerGallon,
        fuelSurchargePerMile:nextFareRules.fuelSurchargePerMile,
        fuelIndexSource:nextFareRules.fuelIndexSource,
        fuelLastUpdatedAt:nextFareRules.fuelLastUpdatedAt,
        sourceUrl
      })
    };
  }catch(err){
    console.error('[fuel-index-refresh] Error:',err.message);
    return {statusCode:500,body:JSON.stringify({error:err.message})};
  }
};
