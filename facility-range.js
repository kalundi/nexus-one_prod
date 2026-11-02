(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.NexusFacilityRange=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Service-date ranges for the facility portal, computed on the Eastern
  // calendar date the manager picked. All math is done on UTC calendar days
  // built from the YYYY-MM-DD parts, so a range never shifts with the
  // viewer's own timezone or with daylight-saving changes inside the range.
  const PERIODS=['day','week','month','quarter','year'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAY_MS=86400000;
  function parse(value){
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return date;
  }
  const iso=date=>date.toISOString().slice(0,10);
  const addDays=(date,days)=>new Date(date.getTime()+days*DAY_MS);
  const dayMonth=date=>MONTHS_SHORT[date.getUTCMonth()]+' '+date.getUTCDate();
  const dayMonthYear=date=>DAYS_SHORT[date.getUTCDay()]+', '+dayMonth(date)+', '+date.getUTCFullYear();
  function label(period,from,to){
    if(period==='day')return dayMonthYear(from);
    if(period==='week')return DAYS_SHORT[from.getUTCDay()]+', '+dayMonth(from)+' – '+dayMonthYear(to);
    if(period==='month')return MONTHS[from.getUTCMonth()]+' '+from.getUTCFullYear();
    if(period==='quarter')return 'Q'+(Math.floor(from.getUTCMonth()/3)+1)+' '+from.getUTCFullYear()+' · '+dayMonth(from)+' – '+dayMonth(to);
    return from.getUTCFullYear()+' · '+dayMonth(from)+' – '+dayMonth(to);
  }
  // rangeFor('2026-11-01','week') -> {period:'week',from:'2026-11-01',to:'2026-11-07',label:'Sun, Nov 1 – Sat, Nov 7, 2026'}
  function rangeFor(anchor,period){
    const date=parse(anchor);
    if(!date)return null;
    const kind=PERIODS.includes(period)?period:'day';
    let from,to;
    if(kind==='day'){from=date;to=date;}
    else if(kind==='week'){from=addDays(date,-date.getUTCDay());to=addDays(from,6);}
    else if(kind==='month'){from=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));to=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0));}
    else if(kind==='quarter'){const quarterStart=date.getUTCMonth()-date.getUTCMonth()%3;from=new Date(Date.UTC(date.getUTCFullYear(),quarterStart,1));to=new Date(Date.UTC(date.getUTCFullYear(),quarterStart+3,0));}
    else{from=new Date(Date.UTC(date.getUTCFullYear(),0,1));to=new Date(Date.UTC(date.getUTCFullYear(),11,31));}
    return {period:kind,from:iso(from),to:iso(to),label:label(kind,from,to)};
  }
  // resolveBlocks([{anchor:'2026-11-04',timeframe:'week'},{anchor:'2026-11-16',timeframe:'day'}])
  //   -> [{period:'week',from:'2026-11-01',to:'2026-11-07',label:...},{period:'day',...}]
  // `period` is accepted as a synonym for `timeframe`. Every block resolves
  // with the exact rangeFor rules above. Returns null when the list is empty
  // or any block is unusable, so callers fall back to a single day instead of
  // guessing at a partial union.
  function resolveBlocks(blocks){
    if(!Array.isArray(blocks)||!blocks.length)return null;
    const resolved=[];
    for(const block of blocks){
      const range=rangeFor(block&&block.anchor,block&&(block.timeframe||block.period));
      if(!range)return null;
      resolved.push(range);
    }
    return resolved;
  }
  function compactLabel(range,showYear){
    const from=parse(range.from),to=parse(range.to);
    if(range.period==='day')return dayMonth(from)+(showYear?', '+from.getUTCFullYear():'');
    if(range.period==='week')return dayMonth(from)+' – '+dayMonth(to)+(showYear||from.getUTCFullYear()!==to.getUTCFullYear()?', '+to.getUTCFullYear():'');
    if(range.period==='month')return MONTHS_SHORT[from.getUTCMonth()]+' '+from.getUTCFullYear();
    if(range.period==='quarter')return 'Q'+(Math.floor(from.getUTCMonth()/3)+1)+' '+from.getUTCFullYear();
    return String(from.getUTCFullYear());
  }
  // describeBlocks(blocks) words the union for the summary line. A single
  // block keeps its full rangeFor label ('Sun, Nov 1 – Sat, Nov 7, 2026');
  // several blocks read as compact segments in date order, joined by ' · ',
  // e.g. 'Nov 2 – Nov 8 · Nov 16 · Dec 2026'. A segment gains its year when
  // it starts in a different year than the first segment.
  function describeBlocks(blocks){
    // Accept either the raw block list or an already-resolved list, which
    // is what the portal has after currentBlocks() resolves the controls.
    const resolved=Array.isArray(blocks)&&blocks.length&&blocks.every(block=>block&&block.from&&block.to&&block.period)
      ? blocks
      : resolveBlocks(blocks);
    if(!resolved)return '';
    if(resolved.length===1)return resolved[0].label;
    const sorted=[...resolved].sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:0);
    const firstYear=parse(sorted[0].from).getUTCFullYear();
    return sorted.map(range=>compactLabel(range,parse(range.from).getUTCFullYear()!==firstYear)).join(' · ');
  }
  return {PERIODS,rangeFor,resolveBlocks,describeBlocks,validDate:value=>parse(value)!==null};
});
