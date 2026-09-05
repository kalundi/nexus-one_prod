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

test('one-time resend verifies payment before contacting the saved recipients',()=>{
 assert.match(source,/maintenance\/resend-payment-trip\/NMT-20260905-8539/);
 assert.match(source,/\['DEPOSIT_PAID','PAID_IN_FULL','PAID'\]\.includes\(paymentStatus\)/);
 assert.match(source,/buildSmsRecipients\(row\.phone\)/);
 assert.match(source,/buildEmailRecipients\(row\.email\)/);
 assert.match(source,/PAYMENT_CONFIRMATION_RESENT/);
});
