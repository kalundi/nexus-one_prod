const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {rangeFor,validDate}=require('../facility-range.js');

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

test('facility portal says Service Date/s and never Service day',()=>{
 const html=fs.readFileSync('facility.html','utf8'),portal=fs.readFileSync('facility-portal.js','utf8'),server=fs.readFileSync('netlify/functions/_shared/facility-portal.cjs','utf8');
 for(const [name,content] of [['facility.html',html],['facility-portal.js',portal],['facility-portal.cjs',server]])assert.ok(!/service day/i.test(content),name+' still says "Service day"');
 assert.ok(html.includes('<label>Service Date/s<input id="serviceDay" type="date" required></label>'));
 assert.ok(html.includes('id="timeframe"'));
 for(const value of ['day','week','month','quarter','year'])assert.ok(html.includes(`<option value="${value}">`),'missing timeframe option '+value);
 assert.ok(html.includes('id="serviceRange"'));
 assert.ok(html.includes('src="/facility-range.js'));
 assert.ok(portal.includes('from:range.from,to:range.to'),'portal must request the selected range');
 assert.ok(portal.includes('summary=data.summary'),'portal counters must come from the range summary');
});
