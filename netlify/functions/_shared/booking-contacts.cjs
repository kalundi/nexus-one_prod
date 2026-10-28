const {normalizeE164}=require('./phone.cjs');
function bookingContacts(body){
 const email=String(body.email??'').trim(),alternateEmail=String(body.alternateEmail??'').trim(),phone=String(body.alternatePhone??'').trim();
 const fail=message=>{throw Object.assign(Error(message),{statusCode:400});};
 const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
 if(!email)fail('Enter the primary email address.');
 if(!validEmail(email))fail('Please enter a valid primary email address.');
 if(alternateEmail&&!validEmail(alternateEmail))fail('Please enter a valid alternate email address.');
 const alternatePhone=phone?normalizeE164(phone):null;
 if(phone&&(!/^\+?[\d\s().-]+$/.test(phone)||!alternatePhone))fail('Enter a valid alternate phone number, including country code for international numbers.');
 return {email,alternateEmail:alternateEmail||null,alternatePhone};
}
module.exports={bookingContacts};
