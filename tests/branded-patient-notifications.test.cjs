'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PatientNotify = require('../netlify/functions/_shared/patient-notifications.cjs');
const { buildPatientEmailRecipients, buildPatientSmsRecipients } = require('../netlify/functions/_shared/notification-routing.cjs');

const RETIRED = ['202-315-9253', '202-270-2174', '12023159253', '12022702174'];
const booking = {
  reference: 'NMT-20261031-0001',
  name: 'Maria Example',
  email: 'maria@example.com',
  phone: '+12405550100',
  alternateEmail: 'son@example.com',
  alternatePhone: '+12405550101',
  date: '2026-11-02',
  time: '09:30',
  pickupTime: '09:30',
  pickup: '100 First Street, Clarksburg, MD',
  destination: '200 Second Street, Rockville, MD',
  service: 'wheelchair',
  driverName: 'Driver Example',
  vehicleUnit: 'WV-254-01',
  status: 'scheduled',
  statusLabel: 'Scheduled',
  tripType: 'ONE_WAY'
};
const v = PatientNotify.view(booking);

const allContents = () => [
  PatientNotify.confirmationContent(v),
  PatientNotify.pendingContent(v, { subject: 'Booking received — awaiting payment — NMT-20261031-0001 | Nexus Medical Transit', statusText: 'is awaiting payment', detail: 'A deposit is required.' }),
  PatientNotify.driverAssignedContent(v),
  PatientNotify.reminderContent(v, {}),
  PatientNotify.statusUpdateContent(v, { summary: 'your pickup time moved to 10:30' }),
  PatientNotify.enRouteContent(v),
  PatientNotify.completedContent(v, {}),
  PatientNotify.completedContent(v, { reviewLink: 'https://example.com/review' }),
  PatientNotify.cancellationContent(v),
  PatientNotify.rescheduleContent(v)
];

test('patient recipients are primary + alternate only, with no internal defaults', () => {
  assert.deepEqual(buildPatientEmailRecipients(booking), ['maria@example.com', 'son@example.com']);
  assert.deepEqual(buildPatientSmsRecipients(booking), ['+12405550100', '+12405550101']);
  // Raw DB row shape (snake_case) works too.
  assert.deepEqual(buildPatientEmailRecipients({ email: 'a@example.com', alternate_email: 'b@example.com' }), ['a@example.com', 'b@example.com']);
  assert.deepEqual(buildPatientSmsRecipients({ phone: '2405550100', alternate_phone: '2405550101' }), ['2405550100', '2405550101']);
  // Duplicates and blanks are dropped.
  assert.deepEqual(buildPatientEmailRecipients({ email: 'a@example.com', alternateEmail: 'A@example.com' }), ['a@example.com']);
  assert.deepEqual(buildPatientSmsRecipients({ phone: '', alternatePhone: null }), []);
});

test('every template carries the brand block and never a retired number', () => {
  for (const content of allContents()) {
    for (const retired of RETIRED) {
      assert.ok(!content.html.includes(retired), `retired number in email: ${retired}`);
      assert.ok(!content.sms.includes(retired), `retired number in SMS: ${retired}`);
      assert.ok(!content.subject.includes(retired), `retired number in subject: ${retired}`);
    }
    assert.match(content.html, /NEXUS MEDICAL TRANSIT/);
    assert.match(content.html, /Our services:/);
    assert.match(content.html, /wheelchair/);
    assert.match(content.html, /ambulance \(BLS\/ALS\)/);
    assert.match(content.html, /For emergencies, call 911/);
    assert.match(content.html, /Clarksburg, MD/);
    assert.match(content.html, /\(888\) 639-5766/);
    assert.match(content.html, /Ambulance Services:<\/strong> 888-760-4990/);
    // No street address is published (Gateway Center Dr number unverified).
    assert.ok(!content.html.includes('Gateway Center'), 'street address must not appear');
    // SMS uses the primary number and never the Ambulance Services number.
    assert.match(content.sms, /^Nexus Medical Transit/);
    assert.match(content.sms, /\(888\) 639-5766/);
    assert.ok(!content.sms.includes('760-4990'), 'SMS must not use the Ambulance Services number');
    // No invented rates, hours, discounts or guarantees.
    assert.ok(!/\$\d/.test(content.sms), 'SMS must not state amounts');
    assert.ok(!/discount|guarantee/i.test(content.html + content.sms), 'no discounts or guarantees');
  }
});

test('subjects match the approved drafts', () => {
  assert.equal(PatientNotify.confirmationContent(v).subject, 'Trip confirmed — NMT-20261031-0001 | Nexus Medical Transit');
  assert.equal(PatientNotify.driverAssignedContent(v).subject, 'Your driver is assigned — NMT-20261031-0001 | Nexus Medical Transit');
  assert.equal(PatientNotify.reminderContent(v, {}).subject, 'Reminder: your ride is in about 2 hours — NMT-20261031-0001 | Nexus Medical Transit');
  assert.equal(PatientNotify.statusUpdateContent(v, { summary: 'x' }).subject, 'Trip update — NMT-20261031-0001 | Nexus Medical Transit');
  assert.equal(PatientNotify.completedContent(v, {}).subject, 'Thank you for riding with Nexus — NMT-20261031-0001');
  assert.equal(PatientNotify.cancellationContent(v).subject, 'Trip cancelled — NMT-20261031-0001 | Nexus Medical Transit');
});

test('STOP/HELP opt-out line appears on the confirmation and completed SMS as drafted', () => {
  assert.match(PatientNotify.confirmationContent(v).sms, /Reply STOP to opt out, HELP for help\./);
  assert.match(PatientNotify.completedContent(v, {}).sms, /Reply STOP to opt out\./);
});

test('completed message omits the review ask until a review link exists', () => {
  const without = PatientNotify.completedContent(v, {});
  assert.ok(!without.html.includes('Leave a review'));
  assert.ok(!without.sms.includes('review'));
  assert.ok(!without.html.includes('{{review_link}}'));
  const withLink = PatientNotify.completedContent(v, { reviewLink: 'https://example.com/review' });
  assert.match(withLink.html, /Leave a review/);
  assert.match(withLink.html, /https:\/\/example\.com\/review/);
  assert.match(withLink.sms, /https:\/\/example\.com\/review/);
  // The rebook path is present either way.
  assert.match(without.html, /Need another ride\?/);
  assert.match(without.sms, /Need another ride\?/);
});

test('alternate-contact copies carry the explanatory intro line', () => {
  const alt = PatientNotify.confirmationContent(v, { forAlternate: true });
  assert.match(alt.html, /listed as an alternate contact for Maria Example's ride/);
  const primary = PatientNotify.confirmationContent(v);
  assert.ok(!primary.html.includes('alternate contact for'));
});

test('patient change summary is plain-language and drops internal-only changes', () => {
  const base = { ...booking, driverName: '', vehicleUnit: '', status: 'submitted', statusLabel: 'Submitted' };
  // Driver assignment.
  let decision = PatientNotify.patientChangeSummary(base, booking);
  assert.equal(decision.kind, 'driver-assigned');
  // En route.
  decision = PatientNotify.patientChangeSummary(booking, { ...booking, status: 'en-route', statusLabel: 'En Route' });
  assert.equal(decision.kind, 'enroute');
  assert.match(decision.summary, /on the way/);
  // Pickup time change.
  decision = PatientNotify.patientChangeSummary(booking, { ...booking, pickupTime: '10:30' });
  assert.equal(decision.kind, 'update');
  assert.match(decision.summary, /pickup time moved to 10:30/);
  // Internal-only changes never reach the patient.
  for (const internalOnly of [
    { notes: 'dispatch note' },
    { phone: '+12405559999' },
    { brokerAcceptedRate: 250 },
    { brokerCompanyName: 'Broker Co' }
  ]) {
    decision = PatientNotify.patientChangeSummary(booking, { ...booking, ...internalOnly });
    assert.equal(decision.kind, 'none', `internal-only change leaked: ${JSON.stringify(internalOnly)}`);
  }
  // Completion and cancellation are handled by their dedicated messages.
  assert.equal(PatientNotify.patientChangeSummary(booking, { ...booking, status: 'completed', statusLabel: 'Completed' }).kind, 'completed');
  assert.equal(PatientNotify.patientChangeSummary(booking, { ...booking, status: 'cancelled', statusLabel: 'Cancelled' }).kind, 'none');
});

test('api.cjs wires the branded patient notifications', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'api.cjs'), 'utf8');
  assert.match(api, /patient-notifications\.cjs/);
  assert.match(api, /notifyPatientTripCompleted/);
  assert.match(api, /patientCopy:false/); // cancel + reschedule routes avoid duplicate patient sends
  assert.match(api, /patientDriverAssigned/); // booking-time auto-assign does not double-notify
  // The patient copy of the trip update is built from the branded templates,
  // and internal recipients exclude the patient's own contacts.
  assert.match(api, /withoutPatientContacts\(buildEmailRecipients\(after\.email\),after,\{email:true\}\)/);
});

test('ride reminders and draft reminders use the branded patient copy', () => {
  const reminders = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'ride-reminders.cjs'), 'utf8');
  assert.match(reminders, /PatientNotify\.reminderContent/);
  assert.match(reminders, /buildPatientSmsRecipients/);
  const drafts = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'booking-draft-reminders.cjs'), 'utf8');
  assert.match(drafts, /Nexus Medical Transit: /);
  assert.match(drafts, /\(888\) 639-5766/);
  assert.ok(!drafts.includes('760-4990'), 'draft reminder must use the primary number');
  assert.match(drafts, /Reply STOP to opt out/);
  assert.match(drafts, /Reply HELP for help/);
});
