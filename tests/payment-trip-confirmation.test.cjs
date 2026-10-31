const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','netlify','functions','api.cjs'),'utf8');

test('paid booking notification contains receipt and full trip details',()=>{
 assert.match(source,/function paymentTripConfirmationContent/);
 for(const label of ['Amount paid','Trip date','Pickup time','Pickup','Destination','Service','Trip type'])assert.ok(source.includes(`['${label}'`),`missing ${label}`);
 assert.match(source,/sendPaymentTripConfirmation\(paidBooking,/);
});

test('payment receipt goes only to the contacts saved on the booking (primary + alternate, no internal copies)',()=>{
 // Branded notifications (2026-10-31): recipients are the booking's own
 // primary + alternate contacts; the internal default recipients must not
 // be added to this message.
 const fnStart=source.indexOf('async function sendPaymentTripConfirmation');
 const fnEnd=source.indexOf('async function issueFacilityCompletionInvoice');
 const fnSource=source.slice(fnStart,fnEnd);
 assert.match(fnSource,/buildPatientSmsRecipients\(row\)/);
 assert.match(fnSource,/buildPatientEmailRecipients\(row\)/);
 assert.doesNotMatch(fnSource,/buildSmsRecipients\(|buildEmailRecipients\(/);
 assert.doesNotMatch(source,/maintenance\/resend-payment-trip\/NMT-20260905-8539/);
});
