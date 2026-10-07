'use strict';

const crypto = require('node:crypto');
const { graphFetch } = require('./ms-graph.cjs');
const { query } = require('./db.cjs');

const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function calendarConfig(env = process.env) {
  return {
    mailbox: clean(env.M365_CALENDAR_MAILBOX_ADDRESS),
    timeZone: clean(env.M365_CALENDAR_TIME_ZONE) || 'Eastern Standard Time'
  };
}

function isCalendarEligible(booking = {}) {
  const status = clean(booking.status).toUpperCase().replaceAll('-', '_');
  const paymentStatus = clean(booking.payment_status || booking.paymentStatus).toUpperCase();
  if (!status || ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'PENDING_DISPATCH_CONFIRMATION', 'REQUESTED', 'CANCELLED'].includes(status)) return false;
  if (booking.requires_deposit === true || booking.requiresDeposit === true) {
    return ['DEPOSIT_PAID', 'PAID_IN_FULL'].includes(paymentStatus);
  }
  return true;
}

function formatTime(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function durationMinutes(value) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 12 * 60) : 30;
}

function eventPayload(booking, { timeZone = 'Eastern Standard Time' } = {}) {
  const date = clean(booking.trip_date || booking.date).slice(0, 10);
  const time = formatTime(booking.trip_time || booking.pickupTime || booking.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) throw new Error('Booking needs a valid pickup date and time for calendar sync');

  const [year, month, day] = date.split('-').map(Number);
  const validatedDate = new Date(Date.UTC(year, month - 1, day));
  if (validatedDate.getUTCFullYear() !== year || validatedDate.getUTCMonth() !== month - 1 || validatedDate.getUTCDate() !== day) {
    throw new Error('Booking needs a valid pickup date and time for calendar sync');
  }
  const [hour, minute] = time.split(':').map(Number);
  const endMinutes = hour * 60 + minute + durationMinutes(booking.estimated_duration || booking.estimatedDuration);
  const endDate = new Date(Date.UTC(year, month - 1, day + Math.floor(endMinutes / 1440)));
  const endDateText = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
  const endTimeText = `${String(Math.floor((endMinutes % 1440) / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;
  const reference = clean(booking.reference || booking.id);
  const rider = clean(booking.name || booking.passenger_name) || 'Rider';
  const pickup = clean(booking.pickup || booking.pickup_address) || 'Not provided';
  const destination = clean(booking.destination || booking.dropoff_address) || 'Not provided';
  const service = clean(booking.service || booking.service_type) || 'Medical transportation';
  const details = [
    `<p><strong>Booking reference:</strong> ${escapeHtml(reference)}</p>`,
    `<p><strong>Rider:</strong> ${escapeHtml(rider)}</p>`,
    `<p><strong>Service:</strong> ${escapeHtml(service)}</p>`,
    `<p><strong>Pickup:</strong> ${escapeHtml(pickup)}</p>`,
    `<p><strong>Destination:</strong> ${escapeHtml(destination)}</p>`
  ];
  const tripType = clean(booking.trip_type || booking.tripType).toUpperCase();
  if (tripType === 'ROUND_TRIP' && (booking.return_trip_date || booking.returnTripDate)) {
    details.push(`<p><strong>Return:</strong> ${escapeHtml(`${clean(booking.return_trip_date || booking.returnTripDate)} ${clean(booking.return_trip_time || booking.returnTripTime)}`)}</p>`);
  } else if (tripType === 'RECURRING') {
    const days = booking.recurrence_days || booking.recurrenceDays || [];
    details.push(`<p><strong>Recurring:</strong> ${escapeHtml(Array.isArray(days) ? days.join(', ') : '')} through ${escapeHtml(booking.recurrence_end_date || booking.recurrenceEndDate || '')}</p>`);
  }

  return {
    subject: `Nexus ride pickup — ${rider} (${reference})`,
    body: { contentType: 'HTML', content: details.join('') },
    start: { dateTime: `${date}T${time}`, timeZone },
    end: { dateTime: `${endDateText}T${endTimeText}`, timeZone },
    sensitivity: 'private',
    showAs: 'busy',
    isReminderOn: false,
    transactionId: crypto.createHash('sha256').update(`nexus-booking-calendar:${reference}`).digest('hex')
  };
}

async function persistSyncState(dbQuery, reference, patch) {
  await dbQuery(`INSERT INTO booking_calendar_sync(booking_reference,sync_status,graph_event_id,last_error,attempt_count,synced_at,updated_at)
    VALUES($1,$2,$3,$4,1,CASE WHEN $2='SYNCED' THEN now() ELSE NULL END,now())
    ON CONFLICT(booking_reference) DO UPDATE SET sync_status=EXCLUDED.sync_status,
      graph_event_id=COALESCE(EXCLUDED.graph_event_id,booking_calendar_sync.graph_event_id),
      last_error=EXCLUDED.last_error,attempt_count=booking_calendar_sync.attempt_count+1,
      synced_at=CASE WHEN EXCLUDED.sync_status='SYNCED' THEN now() ELSE booking_calendar_sync.synced_at END,updated_at=now()`,
  [reference, patch.status, patch.eventId || null, patch.error || null]);
}

async function syncBookingCalendar(booking, { env = process.env, dbQuery = query, graph = graphFetch } = {}) {
  const { mailbox, timeZone } = calendarConfig(env);
  const reference = clean(booking?.reference || booking?.id);
  if (!mailbox) return { status: 'skipped', reason: 'calendar-mailbox-not-configured' };
  if (!reference || !isCalendarEligible(booking)) return { status: 'skipped', reason: 'booking-not-calendar-eligible' };
  try {
    const existingResult = await dbQuery('SELECT graph_event_id FROM booking_calendar_sync WHERE booking_reference=$1', [reference]);
    const existingId = existingResult.rows?.[0]?.graph_event_id;
    const target = `/users/${encodeURIComponent(mailbox)}/calendar/events`;
    const payload = eventPayload(booking, { timeZone });
    let saved;
    if (existingId) {
      delete payload.transactionId;
      saved = await graph(`${target}/${encodeURIComponent(existingId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      saved = { ...saved, id: existingId };
    } else {
      saved = await graph(target, { method: 'POST', body: JSON.stringify(payload) });
    }
    await persistSyncState(dbQuery, reference, { status: 'SYNCED', eventId: saved?.id || existingId });
    return { status: 'synced', eventId: saved?.id || existingId };
  } catch (error) {
    await persistSyncState(dbQuery, reference, { status: 'FAILED', error: clean(error.message).slice(0, 500) }).catch(() => {});
    console.error('[BOOKING_CALENDAR_SYNC]', reference, error.message);
    return { status: 'failed' };
  }
}

async function cancelBookingCalendar(reference, { env = process.env, dbQuery = query, graph = graphFetch } = {}) {
  const mailbox = calendarConfig(env).mailbox;
  const ref = clean(reference);
  if (!mailbox || !ref) return { status: 'skipped' };
  try {
    const result = await dbQuery('SELECT graph_event_id FROM booking_calendar_sync WHERE booking_reference=$1', [ref]);
    const eventId = result.rows?.[0]?.graph_event_id;
    if (!eventId) return { status: 'skipped', reason: 'calendar-event-not-found' };
    try {
      await graph(`/users/${encodeURIComponent(mailbox)}/calendar/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    } catch (error) {
      if (!/\(404\)/.test(error.message)) throw error;
    }
    await dbQuery("UPDATE booking_calendar_sync SET sync_status='CANCELLED',last_error=NULL,attempt_count=attempt_count+1,updated_at=now() WHERE booking_reference=$1", [ref]);
    return { status: 'cancelled' };
  } catch (error) {
    await persistSyncState(dbQuery, ref, { status: 'FAILED', error: clean(error.message).slice(0, 500) }).catch(() => {});
    console.error('[BOOKING_CALENDAR_CANCEL]', ref, error.message);
    return { status: 'failed' };
  }
}

module.exports = { calendarConfig, isCalendarEligible, eventPayload, syncBookingCalendar, cancelBookingCalendar };
