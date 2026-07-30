// Netlify scheduled function: runs every 15 minutes to send ride reminders
// Schedule is configured in netlify.toml

const {query} = require('./_shared/db.cjs');

const envEnabled = name => Boolean(process.env[name]);

async function sendSms(to, body) {
  if (!envEnabled('TWILIO_ACCOUNT_SID') || !envEnabled('TWILIO_AUTH_TOKEN') || !envEnabled('TWILIO_PHONE_NUMBER') || !to) return {status: 'skipped'};
  const form = new URLSearchParams({To: to, From: process.env.TWILIO_PHONE_NUMBER, Body: body});
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded'},
    body: form
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || 'Twilio request failed');
  return {status: 'sent', id: data.sid};
}

async function sendEmail(to, subject, html) {
  if (!envEnabled('SENDGRID_API_KEY') || !envEnabled('SENDGRID_FROM_EMAIL') || !to) return {status: 'skipped'};
  const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'content-type': 'application/json'},
    body: JSON.stringify({
      personalizations: [{to: [{email: to}]}],
      from: {email: process.env.SENDGRID_FROM_EMAIL, name: 'Nexus Medical Transit'},
      subject,
      content: [{type: 'text/html', value: html}]
    })
  });
  if (!r.ok) throw new Error(`SendGrid request failed (${r.status})`);
  return {status: 'sent'};
}

exports.handler = async () => {
  try {
    // Find bookings with a trip starting in the next 60–75 minutes that haven't been reminded yet
    const result = await query(`
      SELECT *
      FROM bookings
      WHERE status NOT IN ('CANCELLED', 'COMPLETED')
        AND (reminder_sent IS NULL OR reminder_sent = false)
        AND trip_date IS NOT NULL
        AND trip_time IS NOT NULL
        AND (trip_date + trip_time) AT TIME ZONE 'America/New_York'
            BETWEEN NOW() + INTERVAL '60 minutes'
                AND NOW() + INTERVAL '75 minutes'
    `);

    if (!result.rows.length) {
      console.log('[Reminders] No upcoming trips in the 60–75 min window.');
      return {statusCode: 200, body: JSON.stringify({reminders: 0})};
    }

    let sent = 0;
    for (const b of result.rows) {
      try {
        const smsBody = `Nexus Medical Transit reminder: Your ride (${b.reference}) is in approximately 1 hour. Pickup: ${b.pickup} at ${b.trip_time}. Reply CANCEL to cancel.`;
        const emailHtml = `
          <div style="font-family:sans-serif;max-width:560px;margin:auto">
            <h2 style="color:#082f49">Your ride is in 1 hour</h2>
            <p>This is a reminder for your upcoming Nexus Medical Transit trip.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Reference</td><td style="padding:8px">${b.reference}</td></tr>
              <tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Service</td><td style="padding:8px">${b.service}</td></tr>
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Pickup</td><td style="padding:8px">${b.pickup}</td></tr>
              <tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Destination</td><td style="padding:8px">${b.destination}</td></tr>
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Date &amp; Time</td><td style="padding:8px">${b.trip_date} at ${b.trip_time}</td></tr>
            </table>
            <p>Need to cancel or reschedule? Visit <a href="https://nexusmt.com/?book=1">nexusmt.com</a> or call <strong>(888) 760-4990</strong>.</p>
            <p style="color:#62758a;font-size:13px">Nexus Medical Transit · Washington Metropolitan Area</p>
          </div>`;

        const [smsResult, emailResult] = await Promise.allSettled([
          sendSms(b.phone, smsBody),
          b.email ? sendEmail(b.email, `Ride reminder: ${b.reference} — in 1 hour`, emailHtml) : Promise.resolve({status: 'skipped'})
        ]);

        await query(
          `UPDATE bookings SET reminder_sent=true, updated_at=now(),
            notification_status=COALESCE(notification_status,'{}')::jsonb || $2::jsonb
           WHERE reference=$1`,
          [b.reference, JSON.stringify({
            reminder: {
              sentAt: new Date().toISOString(),
              sms: smsResult.status === 'fulfilled' ? smsResult.value : {status: 'failed', error: smsResult.reason?.message},
              email: emailResult.status === 'fulfilled' ? emailResult.value : {status: 'failed', error: emailResult.reason?.message}
            }
          })]
        );

        sent++;
        console.log(`[Reminders] Sent reminder for ${b.reference}`);
      } catch (err) {
        console.error(`[Reminders] Failed to remind ${b.reference}:`, err.message);
      }
    }

    return {statusCode: 200, body: JSON.stringify({reminders: sent, total: result.rows.length})};
  } catch (err) {
    console.error('[Reminders] Fatal error:', err.message);
    return {statusCode: 500, body: JSON.stringify({error: err.message})};
  }
};
