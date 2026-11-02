const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {rangeFor,resolveBlocks,describeBlocks,validDate}=require('../facility-range.js');

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

test('facility portal says Service Date/s and never Service day',()=>{
 const html=fs.readFileSync('facility.html','utf8'),portal=fs.readFileSync('facility-portal.js','utf8'),server=fs.readFileSync('netlify/functions/_shared/facility-portal.cjs','utf8'),css=fs.readFileSync('facility-portal.css','utf8');
 for(const [name,content] of [['facility.html',html],['facility-portal.js',portal],['facility-portal.cjs',server]])assert.ok(!/service day/i.test(content),name+' still says "Service day"');
 assert.ok(html.includes('id="dateBlocks"'),'portal must render the timeframe block list');
 assert.ok(html.includes('id="addBlock"'),'portal must offer Add timeframe');
 assert.ok(html.includes('class="blockTimeframe"'));
 assert.ok(html.includes('class="blockDate"'));
 assert.ok(html.includes('class="removeBlock"'));
 // Anthony's layout direction: in the header and in every block row the
 // Timeframe control is left of the Service Date/s control.
 assert.ok(html.indexOf('<span>Timeframe</span>')<html.indexOf('<span>Service Date/s</span>'),'Timeframe header must be left of Service Date/s');
 assert.ok(html.indexOf('id="timeframe"')<html.indexOf('id="serviceDay"'),'the first block timeframe must be left of its date input');
 assert.ok(css.includes('grid-template-columns:minmax(118px,1fr) minmax(140px,1.15fr) 44px'),'block columns must be timeframe, date, remove');
 assert.ok(html.includes('id="timeframe"'));
 for(const value of ['day','week','month','quarter','year'])assert.ok(html.includes(`<option value="${value}">`),'missing timeframe option '+value);
 assert.ok(html.includes('id="serviceRange"'));
 assert.ok(html.includes('src="/facility-range.js'));
 assert.ok(portal.includes("ranges:blocks.map(block=>block.from+'..'+block.to).join(',')"),'portal must request the union of all blocks');
 assert.ok(portal.includes('summary=data.summary'),'portal counters must come from the range summary');
 assert.ok(server.includes('ranges:blocks'),'the trips response must echo the resolved blocks');
});
