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
  return {PERIODS,rangeFor,validDate:value=>parse(value)!==null};
});
