const DEFAULT_EMAIL_RECIPIENTS = ['fletcher@nexusmt.com', 'jubilee@nexusmt.com'];
const DEFAULT_SMS_RECIPIENTS = ['301-760-8981', '301-500-7946'];

function buildEmailRecipients(primaryEmail) {
  const recipients = [];
  const primary = Array.isArray(primaryEmail) ? primaryEmail : [primaryEmail];
  for (const email of primary.flat(Infinity)) {
    if (email && !recipients.includes(email)) recipients.push(email);
  }
  for (const email of DEFAULT_EMAIL_RECIPIENTS) {
    if (email && !recipients.includes(email)) recipients.push(email);
  }
  return recipients;
}

function buildSmsRecipients(primaryPhone) {
  const recipients = [];
  const primary = Array.isArray(primaryPhone) ? primaryPhone : [primaryPhone];
  for (const phone of primary.flat(Infinity)) {
    if (phone && !recipients.includes(phone)) recipients.push(phone);
  }
  for (const phone of DEFAULT_SMS_RECIPIENTS) {
    if (phone && !recipients.includes(phone)) recipients.push(phone);
  }
  return recipients;
}

// Patient-side recipients for branded patient notifications: the booking's
// primary contact plus the alternate contact stored on the booking, WITHOUT
// the internal default recipients above. Bookings capture alternate_email /
// alternate_phone (booking-contacts.cjs) but, before this change, no
// notification read them. Accepts a raw DB row (snake_case) or a mapped
// booking (camelCase).
function uniqueContacts(values) {
  const recipients = [];
  for (const value of values) {
    const contact = String(value || '').trim();
    if (contact && !recipients.some(existing => existing.toLowerCase() === contact.toLowerCase())) recipients.push(contact);
  }
  return recipients;
}

function buildPatientEmailRecipients(booking) {
  const b = booking || {};
  return uniqueContacts([b.email, b.alternateEmail ?? b.alternate_email]);
}

function buildPatientSmsRecipients(booking) {
  const b = booking || {};
  return uniqueContacts([b.phone, b.alternatePhone ?? b.alternate_phone]);
}

function alternateEmailOf(booking) {
  const b = booking || {};
  return String(b.alternateEmail ?? b.alternate_email ?? '').trim();
}

function alternatePhoneOf(booking) {
  const b = booking || {};
  return String(b.alternatePhone ?? b.alternate_phone ?? '').trim();
}

module.exports = {
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_SMS_RECIPIENTS,
  buildEmailRecipients,
  buildSmsRecipients,
  buildPatientEmailRecipients,
  buildPatientSmsRecipients,
  alternateEmailOf,
  alternatePhoneOf
};
