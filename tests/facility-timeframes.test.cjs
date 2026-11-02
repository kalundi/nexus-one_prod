const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {rangeFor,resolveBlocks,describeBlocks,monthGrid,describeDates,rangeSummary,fullDateLabel,shortDateLabel,validDate}=require('../facility-range.js');

test('worked example: anchor Sun Nov 1, 2026 produces all five ranges',()=>{
 assert.deepEqual(rangeFor('2026-11-01','day'),{period:'day',from:'2026-11-01',to:'2026-11-01',label:'Sun, Nov 1, 2026'});
 assert.deepEqual(rangeFor('2026-11-01','week'),{period:'week',from:'2026-11-01',to:'2026-11-07',label:'Sun, Nov 1 – Sat, Nov 7, 2026'});
 assert.deepEqual(rangeFor('2026-11-01','month'),{period:'month',from:'2026-11-01',to:'2026-11-30',label:'November 2026'});
 assert.deepEqual(rangeFor('2026-11-01','quarter'),{period:'quarter',from:'2026-10-01',to:'2026-12-31',label:'Q4 2026 · Oct 1 – Dec 31'});
 assert.deepEqual(rangeFor('2026-11-01','year'),{period:'year',from:'2026-01-01',to:'2026-12-31',label:'2026 · Jan 1 – Dec 31'});
});

test('week is the Sunday-Saturday span containing the anchor',()=>{
 // Anchor on the Saturday closes the same week the Sunday anchor opened.
 assert.deepEqual(rangeFor('2026-11-07','week'),rangeFor('2026-11-01','week'));
 // Mid-week anchor, and the week that contains the 2026 fall-back Sunday
 // (DST ended Sun Nov 1, 2026): pure calendar math, seven days regardless.
 const dstWeek=rangeFor('2026-11-04','week');
 assert.equal(dstWeek.from,'2026-11-01');assert.equal(dstWeek.to,'2026-11-07');
 // Week spanning the year boundary.
 const span=rangeFor('2026-12-31','week');
 assert.equal(span.from,'2026-12-27');assert.equal(span.to,'2027-01-02');
});

test('month, quarter and year boundaries',()=>{
 assert.deepEqual(rangeFor('2027-01-31','month'),{period:'month',from:'2027-01-01',to:'2027-01-31',label:'January 2027'});
 assert.deepEqual(rangeFor('2028-02-29','month'),{period:'month',from:'2028-02-01',to:'2028-02-29',label:'February 2028'});
 assert.deepEqual(rangeFor('2026-03-31','quarter'),{period:'quarter',from:'2026-01-01',to:'2026-03-31',label:'Q1 2026 · Jan 1 – Mar 31'});
 assert.deepEqual(rangeFor('2026-04-01','quarter'),{period:'quarter',from:'2026-04-01',to:'2026-06-30',label:'Q2 2026 · Apr 1 – Jun 30'});
 // Dec 31 sits at the Q4 and year edges.
 assert.equal(rangeFor('2026-12-31','quarter').to,'2026-12-31');
 assert.deepEqual(rangeFor('2026-12-31','year'),{period:'year',from:'2026-01-01',to:'2026-12-31',label:'2026 · Jan 1 – Dec 31'});
 assert.deepEqual(rangeFor('2028-06-15','year'),{period:'year',from:'2028-01-01',to:'2028-12-31',label:'2028 · Jan 1 – Dec 31'});
});

test('invalid anchors are rejected and unknown periods fall back to day',()=>{
 assert.equal(rangeFor('2026-02-30','day'),null);
 assert.equal(rangeFor('not-a-date','week'),null);
 assert.equal(rangeFor('','month'),null);
 assert.equal(validDate('2026-02-29'),false);
 assert.equal(validDate('2028-02-29'),true);
 assert.equal(rangeFor('2026-11-01','decade').period,'day');
 assert.equal(rangeFor('2026-11-01').period,'day');
});

test('multiple blocks resolve independently and describe their union in date order',()=>{
 const blocks=[
  {anchor:'2025-12-03',timeframe:'month'},
  {anchor:'2025-11-16',timeframe:'day'},
  {anchor:'2025-11-05',timeframe:'week'},
 ];
 assert.deepEqual(resolveBlocks(blocks).map(({period,from,to})=>({period,from,to})),[
  {period:'month',from:'2025-12-01',to:'2025-12-31'},
  {period:'day',from:'2025-11-16',to:'2025-11-16'},
  {period:'week',from:'2025-11-02',to:'2025-11-08'},
 ]);
 assert.equal(describeBlocks(blocks),'Nov 2 – Nov 8 · Nov 16 · Dec 2025');
 // The portal passes resolveBlocks output back through describeBlocks.
 assert.equal(describeBlocks(resolveBlocks(blocks)),'Nov 2 – Nov 8 · Nov 16 · Dec 2025');
 // A single block keeps the full established label.
 assert.equal(describeBlocks([{anchor:'2026-11-01',timeframe:'week'}]),'Sun, Nov 1 – Sat, Nov 7, 2026');
 // A later-year segment carries its year so the union cannot be misread.
 assert.equal(describeBlocks([{anchor:'2027-01-02',timeframe:'day'},{anchor:'2026-12-31',timeframe:'day'}]),'Dec 31 · Jan 2, 2027');
 // `period` remains a synonym, and unusable block lists resolve to null.
 assert.deepEqual(resolveBlocks([{anchor:'2026-11-01',period:'month'}]).map(r=>r.period),['month']);
 assert.equal(resolveBlocks([]),null);
 assert.equal(resolveBlocks([{anchor:'2026-02-30',timeframe:'day'}]),null);
 assert.equal(describeBlocks([{anchor:'not-a-date',timeframe:'day'}]),'');
});

test('month grid lays out Sunday-first weeks with blanks outside the month',()=>{
 // November 2026 starts on a Sunday and touches five weeks.
 const nov=monthGrid(2026,10);
 assert.equal(nov.label,'November 2026');
 assert.equal(nov.weeks.length,5);
 assert.deepEqual(nov.weeks[0][0],{date:'2026-11-01',day:1,weekday:0});
 assert.deepEqual(nov.weeks[0][6],{date:'2026-11-07',day:7,weekday:6});
 assert.deepEqual(nov.weeks[4][0],{date:'2026-11-29',day:29,weekday:0});
 assert.deepEqual(nov.weeks[4][1],{date:'2026-11-30',day:30,weekday:1});
 assert.equal(nov.weeks[4][2],null);
 // February 2026 starts on a Sunday with 28 days: exactly four weeks.
 const feb=monthGrid(2026,1);
 assert.equal(feb.label,'February 2026');
 assert.equal(feb.weeks.length,4);
 assert.deepEqual(feb.weeks[3][6],{date:'2026-02-28',day:28,weekday:6});
 // A month starting mid-week pads its first week with blanks.
 const oct=monthGrid(2026,9);
 assert.equal(oct.weeks[0][0],null);
 assert.deepEqual(oct.weeks[0][4],{date:'2026-10-01',day:1,weekday:4});
 // A six-week month keeps all six rows.
 assert.equal(monthGrid(2026,7).weeks.length,6);
 assert.equal(monthGrid(2026,12),null);
 assert.equal(monthGrid('2026',10).label,'November 2026');
 assert.equal(monthGrid(2026,-1),null);
});

test('describeDates words a date selection for the summary line',()=>{
 assert.equal(describeDates(['2026-11-03']),'Tue, Nov 3, 2026');
 assert.equal(describeDates(['2026-11-20','2026-11-03','2026-11-12']),'3 dates: Nov 3 · Nov 12 · Nov 20, 2026');
 assert.equal(describeDates(['2027-01-05','2026-12-30']),'2 dates: Dec 30 · Jan 5, 2027');
 assert.equal(describeDates([]),'');
 assert.equal(describeDates('2026-11-03'),'');
 assert.equal(describeDates(['not-a-date']),'');
 assert.equal(fullDateLabel('2026-11-03'),'Tuesday, November 3, 2026');
 assert.equal(shortDateLabel('2026-11-03'),'Tue, Nov 3');
 assert.equal(fullDateLabel('2026-02-30'),'');
});

test('rangeSummary words one resolved range as a from-to line',()=>{
 assert.equal(rangeSummary(rangeFor('2026-11-02','day')),'Mon, Nov 2, 2026');
 assert.equal(rangeSummary(rangeFor('2026-11-04','week')),'Sun, Nov 1 → Sat, Nov 7, 2026');
 assert.equal(rangeSummary(rangeFor('2026-11-15','month')),'Nov 1 → Nov 30, 2026');
 assert.equal(rangeSummary(rangeFor('2026-11-15','quarter')),'Oct 1 → Dec 31, 2026');
 assert.equal(rangeSummary(rangeFor('2026-06-15','year')),'Jan 1 → Dec 31, 2026');
 // A week spanning the year boundary states both years.
 assert.equal(rangeSummary(rangeFor('2026-12-31','week')),'Sun, Dec 27, 2026 → Sat, Jan 2, 2027');
 assert.equal(rangeSummary(null),'');
 assert.equal(rangeSummary({from:'not-a-date',to:'2026-11-07'}),'');
});

test('facility portal filters by one timeframe and a pop-up date picker',()=>{
 const html=fs.readFileSync('facility.html','utf8'),portal=fs.readFileSync('facility-portal.js','utf8'),server=fs.readFileSync('netlify/functions/_shared/facility-portal.cjs','utf8'),css=fs.readFileSync('facility-portal.css','utf8');
 for(const [name,content] of [['facility.html',html],['facility-portal.js',portal],['facility-portal.cjs',server]])assert.ok(!/service day/i.test(content),name+' still says "Service day"');
 // The filter is one timeframe choice plus one anchor date. The calendar
 // is only a pop-up date picker: present in the markup but hidden, so it
 // consumes no layout space until the Service Date control opens it.
 assert.ok(html.includes('id="serviceTimeframe"'),'portal must offer the timeframe select');
 for(const value of ['day','week','month','quarter','year'])assert.ok(html.includes('<option value="'+value+'">'),'timeframe option '+value+' must exist');
 assert.ok(html.includes('id="serviceDateButton"'),'the date control shows the picked anchor date');
 assert.ok(html.includes('id="serviceCalendarPop"'),'the calendar lives in a pop-up container');
 assert.ok(/id="serviceCalendarPop"[^>]*hidden/.test(html),'the pop-up starts hidden and takes no layout space');
 assert.ok(html.includes('id="calGrid"'),'pop-up must render the calendar day grid');
 assert.ok(html.includes('id="calPrev"'));assert.ok(html.includes('id="calNext"'));assert.ok(html.includes('id="calMonth"'));
 assert.ok(html.includes('>Service Date<'),'the date control is labeled Service Date');
 assert.ok(!html.includes('id="dateChips"'),'multi-select chips are gone');
 assert.ok(!html.includes('id="clearDates"'),'the multi-select Clear control is gone');
 assert.ok(!html.includes('dateCalendarWrap'),'the embedded always-visible calendar is gone');
 assert.ok(!html.includes('id="dateBlocks"'),'the timeframe block list is gone');
 assert.ok(!html.includes('id="addBlock"'),'there is no Add timeframe button');
 assert.ok(!html.includes('blockTimeframe'),'there is no per-block Timeframe dropdown');
 assert.ok(!html.includes('id="serviceDay"'),'the native date input is gone');
 assert.ok(html.includes('id="serviceRange"'));
 assert.ok(html.includes('src="/facility-range.js'));
 assert.ok(portal.includes('from:range.from,to:range.to'),'portal must request the resolved from/to range');
 assert.ok(!portal.includes('dates:dates.join'),'portal no longer requests a set of dates');
 assert.ok(portal.includes('summary=data.summary'),'portal counters must come from the range summary');
 assert.ok(server.includes('ranges:blocks'),'the trips response must echo the resolved blocks');
 assert.ok(server.includes('selectedDates'),'the trips handler must implement the dates mode');
 assert.ok(server.includes('dates:selectedDates'),'the trips response must echo the selected dates');
 assert.ok(css.includes('.serviceCalendarPop'),'pop-up styles ship with the portal');
 assert.ok(css.includes('.calDay'),'calendar day styles ship with the portal');
 assert.ok(css.includes('.calDay.selected'),'the anchor day is visibly marked in the calendar styles');
});
