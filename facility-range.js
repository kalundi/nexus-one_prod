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
  // monthGrid(2026,10) -> {year:2026,month:10,label:'November 2026',
  //   weeks:[[{date:'2026-11-01',day:1,weekday:0},...,null],...]}
  // The calendar grid for one month: Sunday-first weeks (the same week
  // rule rangeFor uses), each cell either a day of the month or null for
  // the leading/trailing blanks. Only the weeks the month touches are
  // returned (4–6 rows), so the portal can render the grid as-is.
  function monthGrid(year,month){
    year=Number(year);month=Number(month);
    if(!Number.isInteger(year)||!Number.isInteger(month)||month<0||month>11)return null;
    const first=new Date(Date.UTC(year,month,1));
    if(first.getUTCFullYear()!==year||first.getUTCMonth()!==month)return null;
    const last=new Date(Date.UTC(year,month+1,0));
    const start=addDays(first,-first.getUTCDay());
    const weeks=[];
    for(let offset=0;;offset+=7){
      const weekStart=addDays(start,offset),week=[];
      for(let d=0;d<7;d++){
        const cell=addDays(weekStart,d);
        week.push(cell.getUTCMonth()===month?{date:iso(cell),day:cell.getUTCDate(),weekday:cell.getUTCDay()}:null);
      }
      weeks.push(week);
      if(addDays(weekStart,7)>last)break;
    }
    return {year,month,label:MONTHS[month]+' '+year,weeks};
  }
  // ---- Period pickers ----
  // The pop-up calendar shows the unit the timeframe names: months of a
  // year for Month, quarters for Quarter, a page of years for Year. Each
  // entry's anchor is the period's first day, so rangeFor(anchor, period)
  // resolves a tap to exactly that period.
  // monthsOfYear(2026) -> [{anchor:'2026-01-01',label:'Jan',name:'January'},...]
  function monthsOfYear(year){
    year=Number(year);if(!Number.isInteger(year)||year<1)return null;
    return MONTHS.map((name,index)=>({anchor:iso(new Date(Date.UTC(year,index,1))),label:MONTHS_SHORT[index],name}));
  }
  // quartersOfYear(2026) -> [{anchor:'2026-01-01',label:'Q1',span:'Jan – Mar'},...]
  function quartersOfYear(year){
    year=Number(year);if(!Number.isInteger(year)||year<1)return null;
    return [0,1,2,3].map(quarter=>({anchor:iso(new Date(Date.UTC(year,quarter*3,1))),label:'Q'+(quarter+1),span:MONTHS_SHORT[quarter*3]+' – '+MONTHS_SHORT[quarter*3+2]}));
  }
  // yearWindow(2026) -> {start:2020,years:[2020,...,2031],label:'2020 – 2031'}
  // Twelve-year pages aligned on multiples of 12, so paging forward or
  // back from any year lands on the neighbouring page.
  function yearWindow(year){
    year=Number(year);if(!Number.isInteger(year)||year<1)return null;
    const start=Math.floor(year/12)*12;
    return {start,years:Array.from({length:12},(_,index)=>start+index),label:start+' – '+(start+11)};
  }
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const fullDateLabel=value=>{const date=parse(value);return date?DAYS[date.getUTCDay()]+', '+MONTHS[date.getUTCMonth()]+' '+date.getUTCDate()+', '+date.getUTCFullYear():'';};
  const shortDateLabel=value=>{const date=parse(value);return date?DAYS_SHORT[date.getUTCDay()]+', '+dayMonth(date):'';};
  // describeDates(['2026-11-03']) -> 'Tue, Nov 3, 2026'
  // describeDates(['2026-11-20','2026-11-03','2026-11-12'])
  //   -> '3 dates: Nov 3 · Nov 12 · Nov 20, 2026'
  // The selection words for the summary line, following describeBlocks'
  // convention: one date keeps its full label; several read as a count
  // plus compact segments in date order, joined by ' · '. A segment
  // gains its year when it starts in a different year than the first
  // date, and the closing year is added when every date shares it.
  function describeDates(dates){
    if(!Array.isArray(dates))return '';
    const parsed=dates.map(parse).filter(Boolean).sort((a,b)=>a-b);
    if(!parsed.length)return '';
    if(parsed.length===1)return dayMonthYear(parsed[0]);
    const firstYear=parsed[0].getUTCFullYear(),lastYear=parsed[parsed.length-1].getUTCFullYear();
    const parts=parsed.map(date=>dayMonth(date)+(date.getUTCFullYear()!==firstYear?', '+date.getUTCFullYear():''));
    return parsed.length+' dates: '+parts.join(' · ')+(lastYear===firstYear?', '+firstYear:'');
  }
  // rangeSummary(rangeFor('2026-11-04','week'))
  //   -> 'Sun, Nov 1 → Sat, Nov 7, 2026'
  // rangeSummary(rangeFor('2026-11-15','month')) -> 'Nov 1 → Nov 30, 2026'
  // The small from → to line under the portal filter: one resolved range
  // worded end to end. A single day keeps its full label; a week names
  // both weekdays; a month, quarter or year names both dates. The year
  // is stated once when both ends share it, on both ends when they do
  // not.
  function rangeSummary(range){
    if(!range)return '';
    const from=parse(range.from),to=parse(range.to);
    if(!from||!to)return '';
    if(range.from===range.to)return dayMonthYear(from);
    const segment=date=>(range.period==='week'?DAYS_SHORT[date.getUTCDay()]+', ':'')+dayMonth(date);
    if(from.getUTCFullYear()!==to.getUTCFullYear())return segment(from)+', '+from.getUTCFullYear()+' → '+segment(to)+', '+to.getUTCFullYear();
    return segment(from)+' → '+segment(to)+', '+to.getUTCFullYear();
  }
  // ---- Multi-range selection (the pop-up calendar's pick state) ----
  // A selection is an ordered list of resolved ranges (rangeFor output,
  // possibly carrying the tapped `anchor`). Identity is the from/to span
  // alone: two timeframes can resolve a tap to the same span, and the
  // selection holds that span once.
  const rangeKey=range=>range?range.from+'..'+range.to:'';
  const sameRange=(a,b)=>Boolean(a&&b&&a.from===b.from&&a.to===b.to);
  // toggleRange(selection, range) -> a NEW list with the span removed
  // when it was already selected, or appended when it was not. Exact
  // duplicates therefore can never enter the selection.
  function toggleRange(selection,range){
    const list=Array.isArray(selection)?selection:[];
    if(!range||!range.from||!range.to)return [...list];
    return list.some(entry=>sameRange(entry,range))?list.filter(entry=>!sameRange(entry,range)):[...list,range];
  }
  // dateInRanges(selection, '2026-11-15') -> true when the day falls
  // inside any selected range, inclusive of both ends (ISO dates order
  // lexicographically, so plain string comparison is exact).
  function dateInRanges(selection,value){
    return Array.isArray(selection)&&selection.some(range=>range&&range.from<=value&&value<=range.to);
  }
  // rangesParam(selection) -> '2026-11-02..2026-11-02,2026-11-15..2026-11-21'
  // The `ranges` query value for the trips endpoint: one from..to pair
  // per selected range, in selection order. '' for an empty selection.
  function rangesParam(selection){
    if(!Array.isArray(selection))return '';
    return selection.filter(range=>range&&range.from&&range.to).map(rangeKey).join(',');
  }
  // selectionSummary(selection) words the whole selection for the small
  // line under the filter: one range keeps its rangeSummary; two or
  // three read as their summaries joined by ' · '; more than three
  // collapse to a count plus the outer span so the line stays short.
  function selectionSummary(selection){
    if(!Array.isArray(selection))return '';
    const sorted=selection.filter(range=>range&&range.from&&range.to).sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:0);
    if(!sorted.length)return '';
    if(sorted.length===1)return rangeSummary(sorted[0]);
    if(sorted.length<=3)return sorted.map(rangeSummary).join(' · ');
    return sorted.length+' ranges: '+dayMonthYear(parse(sorted[0].from))+' → '+dayMonthYear(parse(sorted[sorted.length-1].to));
  }
  return {PERIODS,rangeFor,resolveBlocks,describeBlocks,monthGrid,monthsOfYear,quartersOfYear,yearWindow,describeDates,rangeSummary,rangeKey,sameRange,toggleRange,dateInRanges,rangesParam,selectionSummary,fullDateLabel,shortDateLabel,validDate:value=>parse(value)!==null};
});
