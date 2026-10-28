const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function checkoutHelpers(){
 const source=fs.readFileSync(require.resolve('../netlify/functions/api.cjs'),'utf8');
 const helpers=source.slice(source.indexOf('async function createStripeCheckoutSession('),source.indexOf('async function calculateBrokerRate('));
 const requests=[];
 const context=vm.createContext({URLSearchParams,envEnabled:()=>true,clean:value=>String(value||'').trim(),siteBase:()=> 'https://nexusmt.com',crypto:{randomUUID:()=> 'unique-id'},process:{env:{STRIPE_SECRET_KEY:'test-key',SQUARE_ACCESS_TOKEN:'test-key',SQUARE_LOCATION_ID:'test-location'}},fetch:async(url,options)=>{requests.push({url,...options});return {ok:true,json:async()=>({id:'checkout-test',url:'https://checkout.stripe.com/test',payment_link:{url:'https://square.link/test'}})};}});
 vm.runInContext(helpers,context);return {context,requests};
}
for(const patientApp of [false,true])test(`Stripe ${patientApp?'patient app':'website'} checkout returns to its own experience`,async()=>{
 const {context,requests}=checkoutHelpers();
 await context.createStripeCheckoutSession(2500,{bookingReference:'NMT-TEST-1',paymentMode:'deposit',patientApp,facilityPortal:false});
 const body=requests[0].body,path=patientApp?'/patient.html':'/booking-app.html';
 for(const [key,result] of [['success_url','success'],['cancel_url','cancelled']]){const url=new URL(body.get(key));assert.equal(url.pathname,path);assert.equal(url.searchParams.get('bookingReference'),'NMT-TEST-1');assert.equal(url.searchParams.get('payment'),result);}
 assert.equal(body.get('line_items[0][price_data][unit_amount]'),'2500');
 assert.equal(requests[0].headers['idempotency-key'],`checkout-NMT-TEST-1-deposit${patientApp?'-patient':''}`);
 if(!patientApp)assert.equal(body.get('metadata[patientApp]'),null);
 assert.equal(body.get('metadata[facilityPortal]'),null);
});
for(const patientApp of [false,true])test(`Square ${patientApp?'patient app':'website'} checkout returns to its own experience`,async()=>{
 const {context,requests}=checkoutHelpers();await context.createSquarePaymentLink(10000,{bookingReference:'NMT-TEST-2',patientApp});
 const body=JSON.parse(requests[0].body),url=new URL(body.checkout_options.redirect_url);
 assert.equal(url.pathname,patientApp?'/patient.html':'/booking-app.html');assert.equal(url.searchParams.get('bookingReference'),'NMT-TEST-2');assert.equal(body.quick_pay.price_money.amount,10000);
});
test('facility Stripe checkout returns both success and cancellation to the portal',async()=>{
 const {context,requests}=checkoutHelpers();await context.createStripeCheckoutSession(2500,{bookingReference:'FAC-TEST',paymentMode:'deposit',facilityPortal:true});
 const body=requests[0].body;
 for(const [key,result] of [['success_url','success'],['cancel_url','cancelled']]){const url=new URL(body.get(key));assert.equal(url.pathname,'/facility-demo.html');assert.equal(url.searchParams.get('payment'),result);assert.equal(url.searchParams.get('bookingReference'),'FAC-TEST');}
 assert.equal(requests[0].headers['idempotency-key'],'checkout-FAC-TEST-deposit-facility');
});
test('facility Square checkout returns to the portal with a separate idempotency key',async()=>{
 const {context,requests}=checkoutHelpers();await context.createSquarePaymentLink(10000,{bookingReference:'FAC-TEST',facilityPortal:true});
 const body=JSON.parse(requests[0].body);assert.equal(new URL(body.checkout_options.redirect_url).pathname,'/facility-demo.html');assert.equal(body.idempotency_key,'square-FAC-TEST-facility');
});
