const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizePhone,classifySmsKeyword,twilioSignature,verifyTwilioSignature}=require('../netlify/functions/_shared/sms-consent.cjs');

test('normalizes North American phone numbers',()=>{assert.equal(normalizePhone('(888) 760-4990'),'+18887604990');assert.equal(normalizePhone('+1 202 315 9253'),'+12023159253')});
test('recognizes exact SMS control keywords',()=>{assert.equal(classifySmsKeyword(' stop '),'STOP');assert.equal(classifySmsKeyword('UNSUBSCRIBE'),'STOP');assert.equal(classifySmsKeyword('please stop'),'');assert.equal(classifySmsKeyword('START'),'START');assert.equal(classifySmsKeyword('anything','HELP'),'HELP')});
test('validates Twilio webhook signatures',()=>{const url='https://nexusmt.com/webhooks/twilio/sms';const params={Body:'STOP',From:'+12025550100',MessageSid:'SM123'};const token='test-token';const signature=twilioSignature(url,params,token);assert.equal(verifyTwilioSignature({url,params,signature,token}),true);assert.equal(verifyTwilioSignature({url,params,signature:'invalid',token}),false)});
