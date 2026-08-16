const DEFAULT_EMAIL_RECIPIENTS = ['fletcher@nexusmt.com', 'jubilee@nexusmt.com'];
const DEFAULT_SMS_RECIPIENTS = ['202-270-2174', '301-760-8981', '202-315-9253', '301-500-7946'];

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

module.exports = {
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_SMS_RECIPIENTS,
  buildEmailRecipients,
  buildSmsRecipients
};
