const test=require('node:test'),assert=require('node:assert/strict');
const {bookingContacts}=require('../netlify/functions/_shared/booking-contacts.cjs');
test('primary email is mandatory while alternate contacts may be empty',()=>{
 for(const email of [undefined,'','  ','bad','a@b'])assert.throws(()=>bookingContacts({email}),e=>e.statusCode===400);
 assert.deepEqual(bookingContacts({email:' primary@example.com ',alternatePhone:' ',alternateEmail:''}),{email:'primary@example.com',alternatePhone:null,alternateEmail:null});
});
test('alternate contacts normalize and validate without replacing the primary email',()=>{
 assert.deepEqual(bookingContacts({email:'primary@example.com',alternatePhone:'(240) 555-0123',alternateEmail:' alternate@example.com '}),{email:'primary@example.com',alternatePhone:'+12405550123',alternateEmail:'alternate@example.com'});
 assert.equal(bookingContacts({email:'p@example.com',alternatePhone:'+44 20 7946 0123'}).alternatePhone,'+442079460123');
 for(const alternatePhone of ['123','abc2405550123','not a phone'])assert.throws(()=>bookingContacts({email:'p@example.com',alternatePhone}),e=>e.statusCode===400);
 assert.throws(()=>bookingContacts({email:'p@example.com',alternateEmail:'invalid'}),e=>e.statusCode===400);
});
