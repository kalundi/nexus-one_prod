const { Client } = require('pg');
const api = require('../netlify/functions/api.cjs');

async function main() {
  const ref = process.argv[2] || 'NMT-20260808-5136';
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const bookingResult = await client.query(
    'SELECT reference,name,service,pickup,destination,trip_date,trip_time,status,booking_source,driver_name FROM bookings WHERE reference=$1 LIMIT 1',
    [ref]
  );
  const requestResult = await client.query(
    'SELECT id,booking_reference,request_status,broker_name,pickup,destination,trip_date,trip_time,submitted_by FROM broker_requests WHERE booking_reference=$1 ORDER BY created_at DESC LIMIT 1',
    [ref]
  );

  await client.end();

  const booking = bookingResult.rows[0];
  const brokerRequest = requestResult.rows[0];

  if (!booking) {
    console.log(JSON.stringify({ ok: false, error: 'booking_not_found', reference: ref }));
    process.exit(1);
  }
  if (!brokerRequest) {
    console.log(JSON.stringify({ ok: false, error: 'broker_request_not_found', reference: ref }));
    process.exit(1);
  }

  const toEmail = String(brokerRequest.submitted_by || '').trim() || 'dispatch@nexusmt.com';

  const emailResult = await api.sendBrokerRequestConfirmation(
    brokerRequest,
    toEmail,
    brokerRequest.broker_name || 'Broker request'
  );

  const teamsResult = await api.sendBookingTeamsAlert(
    {
      reference: booking.reference,
      name: booking.name || brokerRequest.broker_name || 'Broker Request',
      pickup: booking.pickup,
      destination: booking.destination,
      date: booking.trip_date,
      time: String(booking.trip_time || '').slice(0, 5),
      status: booking.status,
      booking_source: booking.booking_source,
      driver_name: booking.driver_name,
    },
    'Broker Confirmation Review Required - Admin_NMT',
    'Broker Confirmation Intake'
  );

  console.log(
    JSON.stringify({
      ok: true,
      reference: ref,
      toEmail,
      env: {
        sendgridConfigured: Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL),
        teamsConfigured: Boolean(process.env.TEAMS_WEBHOOK_URL),
      },
      emailResult,
      teamsResult,
    })
  );
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
