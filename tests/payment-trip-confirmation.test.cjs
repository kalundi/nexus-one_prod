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

test('payment receipt goes only to the phone and email saved on the booking',()=>{
 assert.match(source,/const smsRecipients=clean\(row\.phone\)\?\[clean\(row\.phone\)\]:\[\],emailRecipients=clean\(row\.email\)\?\[clean\(row\.email\)\]:\[\]/);
 assert.doesNotMatch(source,/maintenance\/resend-payment-trip\/NMT-20260905-8539/);
});
