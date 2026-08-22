const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeE164,formatPhoneDisplay}=require('../netlify/functions/_shared/phone.cjs');

test('normalizes North American and international numbers to E.164',()=>{
 assert.equal(normalizeE164('(240) 555-0101'),'+12405550101');
 assert.equal(normalizeE164('+44 20 7946 0958'),'+442079460958');
 assert.equal(normalizeE164('+33 1 42 68 53 00'),'+33142685300');
 assert.equal(normalizeE164('555-0101'),'');
});

test('formats stored numbers for readable display',()=>{
 assert.equal(formatPhoneDisplay('+12405550101'),'+1 (240) 555-0101');
 assert.match(formatPhoneDisplay('+442079460958'),/^\+44 /);
});

test('shared client validates phone fields without truncating international numbers',()=>{
 const platform=fs.readFileSync(path.resolve(__dirname,'..','platform.js'),'utf8');
 assert.match(platform,/window\.NexusPhone=\{normalize,display\}/);
 assert.match(platform,/\[1-9\]\\d\{7,14\}/);
 assert.match(platform,/maxlength=24|input\.maxLength=24/);
});
