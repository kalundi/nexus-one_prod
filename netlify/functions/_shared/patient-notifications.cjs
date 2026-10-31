// Branded patient-facing notification templates for Nexus Medical Transit.
// Implements the templates Anthony approved on 2026-10-31 (see
// branded-patient-notifications-2026-10-31.md): a standard brand block on
// every patient email, a standard SMS pattern, (888) 639-5766 as the primary
// book/rebook number, 888-760-4990 as Ambulance Services in the email footer
// only, and one marketing element per message at most, after the trip facts.
// The retired 202 numbers must never appear here. No rates, hours, discounts
// or guarantees are stated. Pure content builders — sending lives in callers.

const PRIMARY_PHONE = '(888) 639-5766';
const CUSTOMER_SERVICE_PHONE = '888-760-4990';
const SITE_URL = 'https://nexusmt.com';
const BOOKING_URL = 'https://mynexusride.com';
const LOGO_URL = 'https://nexusmt.com/nexus-logo.png';

const clean = value => String(value ?? '').trim();
const esc = value => clean(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function firstName(name) {
  return clean(name).split(/\s+/)[0] || '';
}

// Normalize a booking from either a raw DB row (snake_case) or a mapBooking()
// result (camelCase) into the fields the templates use.
function view(booking) {
  const b = booking || {};
  const name = clean(b.name);
  return {
    reference: clean(b.reference),
    name,
    firstName: firstName(name),
    email: clean(b.email),
    phone: clean(b.phone),
    alternateEmail: clean(b.alternateEmail ?? b.alternate_email),
    alternatePhone: clean(b.alternatePhone ?? b.alternate_phone),
    date: clean(b.date ?? b.trip_date),
    time: clean(b.time ?? b.trip_time).slice(0, 5),
    pickupTime: clean(b.pickupTime ?? b.pickup_time) || clean(b.time ?? b.trip_time).slice(0, 5),
    appointmentTime: clean(b.submittedAppointmentTime ?? b.appointmentTime ?? ''),
    pickup: clean(b.pickup),
    destination: clean(b.destination),
    service: clean(b.service),
    driverName: clean(b.driverName ?? b.driver_name),
    vehicleUnit: clean(b.vehicleUnit ?? b.vehicle_unit),
    status: clean(b.status),
    statusLabel: clean(b.statusLabel ?? b.status),
    tripType: clean(b.tripType ?? b.trip_type),
    returnTripDate: clean(b.returnTripDate ?? b.return_trip_date),
    returnTripTime: clean(b.returnTripTime ?? b.return_trip_time)
  };
}

function emailHeader() {
  return `<div style="background:#082f49;padding:18px 24px;border-radius:8px 8px 0 0"><img src="${LOGO_URL}" alt="Nexus Medical Transit" height="36" style="display:block;border:0"><div style="color:#ffffff;font-family:Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:.4px">NEXUS MEDICAL TRANSIT</div><div style="color:#c9d9e4;font-family:Arial,sans-serif;font-size:13px;margin-top:2px">Non-emergency medical transport — Maryland · Washington DC · Northern Virginia</div></div>`;
}

function emailFooter(v) {
  return `<p>Thank you for choosing Nexus Medical Transit.</p><p>— The Nexus Medical Transit team<br><strong>Book or rebook:</strong> ${PRIMARY_PHONE} · <a href="${BOOKING_URL}">mynexusride.com</a><br><strong>Ambulance Services:</strong> ${CUSTOMER_SERVICE_PHONE}</p><div style="border-top:1px solid #dbe6ee;margin-top:20px;padding-top:12px;color:#62758a;font-size:13px;line-height:1.6"><p style="margin:0 0 6px"><strong>Our services:</strong> wheelchair · stretcher &amp; bariatric · ambulance (BLS/ALS) · dialysis &amp; recurring rides · hospital discharge · medical shuttle — with door-through-door support.</p><p style="margin:0 0 6px">Nexus Medical Transit · Clarksburg, MD · Serving Maryland, Washington DC &amp; Northern Virginia<br>Dispatch ${PRIMARY_PHONE} · Ambulance Services ${CUSTOMER_SERVICE_PHONE} · nexusmt.com</p><p style="margin:0 0 6px">Nexus provides planned, scheduled medical transport. <strong>For emergencies, call 911.</strong></p><p style="margin:0">You're receiving this because you were listed as a contact on booking ${esc(v.reference)}.</p></div>`;
}

// Wrap inner body HTML in the standard branded email shell (header + footer).
function emailShell(v, bodyHtml) {
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#153247;line-height:1.5">${emailHeader()}<div style="padding:20px 24px">${bodyHtml}</div><div style="padding:0 24px 20px">${emailFooter(v)}</div></div>`;
}

function detailTable(rows) {
  const visible = rows.filter(([, value]) => clean(value) !== '');
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${visible.map(([label, value, bold], index) => `<tr${index % 2 === 0 ? ' style="background:#f3f8fb"' : ''}><td style="padding:8px;font-weight:600;color:#62758a;vertical-align:top">${esc(label)}</td><td style="padding:8px">${bold ? `<strong>${esc(value)}</strong>` : esc(value)}</td></tr>`).join('')}</table>`;
}

function greeting(v, { forAlternate = false } = {}) {
  const lines = [`<p>Hi ${esc(v.firstName || 'there')},</p>`];
  if (forAlternate) lines.push(`<p>You're listed as an alternate contact for ${esc(v.name || 'a patient')}'s ride with Nexus Medical Transit, so we're keeping you in the loop.</p>`);
  return lines.join('');
}

function confirmationContent(v, options = {}) {
  const driverRow = v.driverName
    ? ['Driver', v.driverName, true]
    : ['Driver', "We'll send your driver's name before pickup."];
  const returnRow = clean(v.tripType).toUpperCase() === 'ROUND_TRIP' && (v.returnTripDate || v.returnTripTime)
    ? ['Return trip', `${v.returnTripDate || v.date} at ${v.returnTripTime || 'TBD'}`]
    : null;
  const body = `${greeting(v, options)}<p>Your ride with Nexus Medical Transit is confirmed. Here are your trip details:</p>${detailTable([
    ['Booking reference', v.reference, true],
    ['Passenger', v.name],
    ['Date', v.date],
    ['Pickup time', v.pickupTime, true],
    ['Appointment time', v.appointmentTime],
    ['Pickup', v.pickup],
    ['Destination', v.destination],
    ['Service', v.service],
    driverRow,
    ...(returnRow ? [returnRow] : []),
    ...(options.paymentLine ? [['Payment', options.paymentLine]] : [])
  ])}<p>Please be ready at your pickup time. Your driver provides door-through-door support — they'll come to the door and help you to the vehicle.</p><p>Need to change or cancel? Call us at <strong>${PRIMARY_PHONE}</strong> as early as you can.</p>`;
  return {
    subject: `Trip confirmed — ${v.reference} | Nexus Medical Transit`,
    sms: `Nexus Medical Transit: Hi ${v.firstName || 'there'}, your trip ${v.reference} is confirmed for ${v.date} at ${v.pickupTime}. Pickup: ${v.pickup}. Destination: ${v.destination}. Questions or to book again: ${PRIMARY_PHONE}. Reply STOP to opt out, HELP for help.`,
    html: emailShell(v, body)
  };
}

// Pending variants of the confirmation (deposit required / pending approval /
// facility received). `subject` is the patient-facing subject line.
function pendingContent(v, { subject, statusText, detail } = {}, options = {}) {
  const body = `${greeting(v, options)}<p>Booking <strong>${esc(v.reference)}</strong> ${esc(statusText)}.</p><p>${esc(detail)}</p>${detailTable([
    ['Passenger', v.name],
    ['Date', v.date],
    ['Pickup time', v.pickupTime, true],
    ['Pickup', v.pickup],
    ['Destination', v.destination],
    ['Service', v.service]
  ])}<p>Questions? Call us at <strong>${PRIMARY_PHONE}</strong>.</p>`;
  return {
    subject,
    sms: `Nexus Medical Transit: Hi ${v.firstName || 'there'}, booking ${v.reference} ${statusText}. ${detail} Questions or to book again: ${PRIMARY_PHONE}. Reply STOP to opt out, HELP for help.`,
    html: emailShell(v, body)
  };
}

function driverAssignedContent(v, options = {}) {
  const body = `${greeting(v, options)}<p>Good news — your ride on <strong>${esc(v.date)}</strong> is staffed.</p>${detailTable([
    ['Driver', v.driverName, true],
    ['Vehicle', v.vehicleUnit],
    ['Pickup time', v.pickupTime, true],
    ['Pickup', v.pickup],
    ['Destination', v.destination],
    ['Booking reference', v.reference]
  ])}<p>Please be ready at your pickup time. ${esc(v.driverName || 'Your driver')} will come to the door and assist you to the vehicle — that's our door-through-door support, on every ride.</p><p>Running late or need a change? Call <strong>${PRIMARY_PHONE}</strong>.</p>`;
  return {
    subject: `Your driver is assigned — ${v.reference} | Nexus Medical Transit`,
    sms: `Nexus Medical Transit: Your driver for trip ${v.reference} is ${v.driverName || 'assigned'}${v.vehicleUnit ? ` (vehicle ${v.vehicleUnit})` : ''}, pickup ${v.date} at ${v.pickupTime} from ${v.pickup}. Questions: ${PRIMARY_PHONE}.`,
    html: emailShell(v, body)
  };
}

function reminderContent(v, { paymentLink = null } = {}, options = {}) {
  const body = `${greeting(v, options)}<p>A quick reminder — your Nexus ride is in about <strong>2 hours</strong>.</p>${detailTable([
    ['Pickup time', v.pickupTime, true],
    ['Driver', v.driverName],
    ['Pickup', v.pickup],
    ['Destination', v.destination],
    ['Service', v.service],
    ['Booking reference', v.reference]
  ])}<p>Please be ready at your pickup time; your driver will come to the door.</p>${paymentLink ? `<p><strong>Payment:</strong> <a href="${esc(paymentLink)}">Complete payment before pickup</a></p>` : ''}<p>Need to cancel or reschedule? Call <strong>${PRIMARY_PHONE}</strong> right away.</p>`;
  return {
    subject: `Reminder: your ride is in about 2 hours — ${v.reference} | Nexus Medical Transit`,
    sms: `Nexus Medical Transit reminder: Hi ${v.firstName || 'there'}, your ride ${v.reference} is in about 2 hours. Driver: ${v.driverName || 'your assigned driver'}. Pickup at ${v.pickupTime} from ${v.pickup}.${paymentLink ? ` Complete payment before pickup: ${paymentLink}` : ''} Questions: ${PRIMARY_PHONE}.`,
    html: emailShell(v, body)
  };
}

function statusUpdateContent(v, { summary } = {}, options = {}) {
  const body = `${greeting(v, options)}<p>There's an update on your ride: <strong>${esc(summary)}</strong>.</p>${detailTable([
    ['Status', v.statusLabel],
    ['Date / pickup time', `${v.date} at ${v.pickupTime}`],
    ['Pickup', v.pickup],
    ['Destination', v.destination],
    ['Driver / vehicle', v.driverName ? `${v.driverName}${v.vehicleUnit ? ` / ${v.vehicleUnit}` : ''}` : 'To be assigned'],
    ['Booking reference', v.reference]
  ])}<p>Questions about this change? Call <strong>${PRIMARY_PHONE}</strong>.</p>`;
  return {
    subject: `Trip update — ${v.reference} | Nexus Medical Transit`,
    sms: `Nexus Medical Transit: Update on trip ${v.reference}: ${summary}. Pickup: ${v.date} at ${v.pickupTime}, ${v.pickup} to ${v.destination}. Questions: ${PRIMARY_PHONE}.`,
    html: emailShell(v, body)
  };
}

function enRouteContent(v, options = {}) {
  const content = statusUpdateContent(v, { summary: 'your driver is on the way' }, options);
  return {
    ...content,
    sms: `Nexus Medical Transit: Good news — your driver is on the way for trip ${v.reference}. Pickup at ${v.pickupTime} from ${v.pickup}. Questions: ${PRIMARY_PHONE}.`
  };
}

function completedContent(v, { reviewLink = '' } = {}, options = {}) {
  const link = clean(reviewLink);
  const reviewHtml = link ? `<p><strong>How did we do?</strong> If you have a moment, a quick review helps other families and patients in Maryland, DC and Northern Virginia find us when they need a ride: <a href="${esc(link)}">Leave a review</a></p>` : '';
  const body = `${greeting(v, options)}<p>Your trip <strong>${esc(v.reference)}</strong> on ${esc(v.date)} (${esc(v.pickup)} → ${esc(v.destination)}) is complete. Thank you for riding with Nexus Medical Transit — we hope the ride made the day a little easier.</p>${reviewHtml}<p><strong>Need another ride?</strong> Many of our riders book with us again for follow-up appointments, dialysis and recurring treatments, hospital discharges, and everyday medical visits. Booking again is easy:</p><ul><li>Call <strong>${PRIMARY_PHONE}</strong></li><li>Book at <strong>mynexusride.com</strong></li><li>Just mention your last trip reference, ${esc(v.reference)}, and we'll take it from there.</li></ul>`;
  return {
    subject: `Thank you for riding with Nexus — ${v.reference}`,
    sms: `Nexus Medical Transit: Thank you for riding with us, ${v.firstName || 'there'} — trip ${v.reference} is complete.${link ? ` If we did well, a quick review helps other families find us: ${link}` : ''} Need another ride? Call ${PRIMARY_PHONE} or book at mynexusride.com. Reply STOP to opt out.`,
    html: emailShell(v, body)
  };
}

function cancellationContent(v, options = {}) {
  const body = `${greeting(v, options)}<p>Your trip <strong>${esc(v.reference)}</strong> — ${esc(v.date)} at ${esc(v.pickupTime)}, ${esc(v.pickup)} → ${esc(v.destination)} — has been cancelled as requested. No further action is needed.</p><p>If this cancellation was a mistake, or you'd like to reschedule instead, call us at <strong>${PRIMARY_PHONE}</strong> and we'll set it back up.</p><p>When you need us again — a follow-up appointment, a discharge, a recurring treatment — we're here: <strong>${PRIMARY_PHONE}</strong> · <strong>mynexusride.com</strong>.</p>`;
  return {
    subject: `Trip cancelled — ${v.reference} | Nexus Medical Transit`,
    sms: `Nexus Medical Transit: Trip ${v.reference} on ${v.date} has been cancelled. Sorry we won't see you this time. To rebook: ${PRIMARY_PHONE} or mynexusride.com.`,
    html: emailShell(v, body)
  };
}

// Reschedule reuses the §4.4 status-update pattern with the new date/time as
// the update summary (per the approved draft, §4.6 note).
function rescheduleContent(v, options = {}) {
  return statusUpdateContent(v, { summary: `your trip has been rescheduled to ${v.date} at ${v.pickupTime || v.time}` }, options);
}

const STATUS_SUMMARIES = {
  EN_ROUTE: 'your driver is on the way',
  ARRIVED_PICKUP: 'your driver has arrived',
  ARRIVED: 'your driver has arrived',
  PATIENT_ON_BOARD: 'your trip is underway',
  IN_TRANSIT: 'your trip is underway',
  SCHEDULED: 'your trip is scheduled'
};

// Decide what (if anything) the patient should be told about a trip change,
// in plain language. Internal-only changes (trip notes, patient contact
// details, submitter/broker terms, driver confirmed rate) never reach the
// patient. Returns {kind, summary, parts:[{kind,summary}]} where kind is one
// of 'driver-assigned' | 'enroute' | 'update' | 'completed' | 'none'. The
// 'completed' kind is a signal for callers to use completedContent() (the
// dedicated completed-trip message) instead of a generic update.
function patientChangeSummary(beforeBooking, afterBooking) {
  const before = view(beforeBooking);
  const after = view(afterBooking);
  const parts = [];
  const statusKey = clean(after.status).toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  const statusChanged = clean(before.status).toUpperCase() !== clean(after.status).toUpperCase();
  if (statusChanged && statusKey === 'COMPLETED') return { kind: 'completed', summary: 'your trip is complete', parts: [{ kind: 'completed', summary: 'your trip is complete' }] };
  if (statusChanged && statusKey === 'CANCELLED') return { kind: 'none', summary: '', parts: [] };
  const driverChanged = before.driverName !== after.driverName || before.vehicleUnit !== after.vehicleUnit;
  if (driverChanged && after.driverName) parts.push({ kind: 'driver-assigned', summary: `your driver is ${after.driverName}` });
  if (statusChanged && STATUS_SUMMARIES[statusKey]) {
    parts.push({ kind: statusKey === 'EN_ROUTE' ? 'enroute' : 'update', summary: STATUS_SUMMARIES[statusKey] });
  } else if (statusChanged) {
    parts.push({ kind: 'update', summary: `your trip status is now ${after.statusLabel || after.status}` });
  }
  if (before.pickupTime !== after.pickupTime && after.pickupTime) parts.push({ kind: 'update', summary: `your pickup time moved to ${after.pickupTime}` });
  if ((before.date !== after.date || before.time !== after.time) && after.date) parts.push({ kind: 'update', summary: `your trip moved to ${after.date} at ${after.pickupTime || after.time}` });
  if (before.pickup !== after.pickup || before.destination !== after.destination) parts.push({ kind: 'update', summary: 'your pickup or destination changed' });
  if (before.service !== after.service && after.service) parts.push({ kind: 'update', summary: `your service changed to ${after.service}` });
  if (driverChanged && !after.driverName) parts.push({ kind: 'update', summary: 'your driver assignment is being updated' });
  if (!parts.length) return { kind: 'none', summary: '', parts: [] };
  // A driver assignment is the headline when it is the change; an en-route
  // status outranks it because it is time-critical.
  const enroute = parts.find(part => part.kind === 'enroute');
  const headline = enroute || parts[0];
  return { kind: headline.kind, summary: headline.summary, parts };
}

module.exports = {
  PRIMARY_PHONE,
  CUSTOMER_SERVICE_PHONE,
  SITE_URL,
  LOGO_URL,
  esc,
  firstName,
  view,
  emailHeader,
  emailFooter,
  emailShell,
  detailTable,
  confirmationContent,
  pendingContent,
  driverAssignedContent,
  reminderContent,
  statusUpdateContent,
  enRouteContent,
  completedContent,
  cancellationContent,
  rescheduleContent,
  patientChangeSummary
};
