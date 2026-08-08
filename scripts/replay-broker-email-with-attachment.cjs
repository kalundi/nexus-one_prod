const { Client } = require('pg');
const webhook = require('../netlify/functions/broker-email-webhook.cjs');

async function run() {
  const payloadText = [
    'Company: Go Transportation & Translation',
    'Patient: LUZ PEREDA',
    'Reference: 4474-78405-4',
    'CRM: 0385028026',
    'Pickup: 100 Test Plaza, Baltimore MD 21201',
    'Destination: 200 Demo Ave, Towson MD 21204',
    'Date: 8/10/2026',
    'Time: 10:30 AM',
    'Service: Wheelchair',
    'Rate Quote: $145.00',
  ].join('\n');

  const payload = {
    from: 'driverdeveloper@gotandt.com',
    sender_name: 'GO T&T Intake Test',
    to: 'fletcher@nexusmt.com',
    subject: 'GO T&T: **REVISED CONFIRMATION** for LUZ PEREDA 4474-78405-4 on 8/10/2026 PLEASE CONFIRM RECEIPT CRM:0385028026',
    text: [
      'Company: Wrong Company In Body',
      'Pickup: 999 Wrong Place, Baltimore MD',
      'Destination: 888 Wrong Place, Towson MD',
      'Date: 8/11/2026',
      'Time: 09:00 AM',
      'Rate Quote: $5.00',
    ].join('\n'),
    messageId: `test-pdf-priority-${Date.now()}`,
    internetMessageId: `test-pdf-priority-${Date.now()}`,
    receivedDateTime: new Date().toISOString(),
    attachments: [
      {
        filename: 'confirmation-source.txt',
        type: 'text/plain',
        content: Buffer.from(payloadText, 'utf8').toString('base64'),
      },
    ],
  };

  const response = await webhook.handler({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('WEBHOOK_STATUS', response.statusCode);
  console.log('WEBHOOK_BODY', response.body);

  const body = JSON.parse(response.body || '{}');
  if (!body.booking_reference) return;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const bookingRef = String(body.booking_reference);
  const booking = await client.query(
    'SELECT reference,name,service,pickup,destination,trip_date,trip_time,broker_company_name,notes FROM bookings WHERE reference=$1 LIMIT 1',
    [bookingRef]
  );
  const attachments = await client.query(
    'SELECT id,file_name,mime_type,created_at FROM booking_attachments WHERE booking_reference=$1 ORDER BY created_at DESC',
    [bookingRef]
  );

  console.log('BOOKING_ROW', JSON.stringify(booking.rows[0] || null));
  console.log('ATTACHMENTS', JSON.stringify(attachments.rows || []));

  await client.end();
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
