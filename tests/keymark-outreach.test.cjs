const test=require('node:test');
const assert=require('node:assert/strict');
const {TEMPLATES,getTemplate,twilioConfigured}=require('../netlify/functions/_shared/keymark-outreach.cjs');

test('KeyMark exposes only approved minimum-necessary outreach templates',()=>{
 assert.deepEqual(Object.keys(TEMPLATES).sort(),['APPOINTMENT_CONFIRMATION','RIDE_ARRANGED','TRANSPORTATION_CHECK']);
 for(const template of Object.values(TEMPLATES)){
  assert.match(template.sms,/Nexus KeyMark/);
  assert.doesNotMatch(template.sms,/patient name|diagnosis|department|medical record/i);
 }
});

test('unapproved outreach templates are rejected',()=>{
 assert.throws(()=>getTemplate('CUSTOM_FREE_TEXT'),error=>error.code==='TEMPLATE_NOT_APPROVED');
});

test('Twilio requires all three credential values',()=>{
 const previous={sid:process.env.TWILIO_ACCOUNT_SID,token:process.env.TWILIO_AUTH_TOKEN,phone:process.env.TWILIO_PHONE_NUMBER};
 delete process.env.TWILIO_ACCOUNT_SID;delete process.env.TWILIO_AUTH_TOKEN;delete process.env.TWILIO_PHONE_NUMBER;
 assert.equal(twilioConfigured(),false);
 Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC-test',TWILIO_AUTH_TOKEN:'secret',TWILIO_PHONE_NUMBER:'+12025550100'});
 assert.equal(twilioConfigured(),true);
 for(const [key,value] of Object.entries({TWILIO_ACCOUNT_SID:previous.sid,TWILIO_AUTH_TOKEN:previous.token,TWILIO_PHONE_NUMBER:previous.phone})){if(value===undefined)delete process.env[key];else process.env[key]=value}
});
