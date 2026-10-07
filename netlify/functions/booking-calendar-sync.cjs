const { query } = require('./_shared/db.cjs');
const { calendarConfig, syncBookingCalendar, cancelBookingCalendar } = require('./_shared/booking-calendar.cjs');

exports.handler = async () => {
  if (String(process.env.NEXUS_TEST_MODE || '').toLowerCase() === 'true') {
    return { statusCode: 200, body: JSON.stringify({ processed: 0, reason: 'test-mode' }) };
  }
  if (!calendarConfig().mailbox) {
    return { statusCode: 200, body: JSON.stringify({ processed: 0, reason: 'calendar-mailbox-not-configured' }) };
  }
  try {
    const result = await query(`SELECT b.*,s.booking_reference
      FROM booking_calendar_sync s
      JOIN bookings b ON b.reference=s.booking_reference
      WHERE s.sync_status='FAILED' AND s.attempt_count<10
      ORDER BY s.updated_at ASC LIMIT 50`);
    const outcomes = [];
    for (const booking of result.rows || []) {
      const status = String(booking.status || '').toUpperCase().replaceAll('-', '_');
      const outcome = status === 'CANCELLED'
        ? await cancelBookingCalendar(booking.reference)
        : await syncBookingCalendar(booking);
      outcomes.push({ reference: booking.reference, status: outcome.status });
    }
    return { statusCode: 200, body: JSON.stringify({ processed: outcomes.length, outcomes }) };
  } catch (error) {
    console.error('[BOOKING_CALENDAR_RETRY]', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Calendar retry failed' }) };
  }
};
