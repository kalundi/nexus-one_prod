// Netlify scheduled function: runs every 15 minutes to send ride reminders
// Schedule is configured in netlify.toml

const {query} = require('./_shared/db.cjs');

const envEnabled = name => Boolean(process.env[name]);
const siteBase = () => String(process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://nexusmt.com').replace(/\/$/, '');

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

async function sendTeamsAlert(text, title = 'Nexus Medical Transit') {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return {status: 'skipped'};
  const body = {
    '@type': 'MessageCard', '@context': 'https://schema.org/extensions',
    themeColor: '#082f49', summary: title, title, text
  };
  try {
    const r = await fetch(webhookUrl, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    return r.ok ? {status: 'sent'} : {status: 'failed', code: r.status};
  } catch (e) { return {status: 'failed', error: e.message}; }
}

exports.handler = async () => {
  try {
    const result = await query(`
      SELECT
        b.*, 
        COALESCE(e.display_name, u.display_name, b.driver_name) AS driver_name,
        COALESCE(e.email, u.email) AS driver_email,
        COALESCE(e.phone, u.phone) AS driver_phone
      FROM bookings b
      LEFT JOIN employees e
        ON (e.display_name IS NOT NULL AND lower(trim(e.display_name)) = lower(trim(b.driver_name)))
      LEFT JOIN users u
        ON (
          (e.user_id IS NOT NULL AND u.id = e.user_id)
          OR (
            e.user_id IS NULL
            AND u.role = 'DRIVER'
            AND u.active = true
            AND u.display_name IS NOT NULL
            AND lower(trim(u.display_name)) = lower(trim(b.driver_name))
          )
        )
      WHERE b.status NOT IN ('CANCELLED', 'COMPLETED', 'DELIVERED')
        AND (b.reminder_sent IS NULL OR b.reminder_sent = false)
        AND b.trip_date IS NOT NULL
        AND b.trip_time IS NOT NULL
        AND (b.trip_date + b.trip_time) AT TIME ZONE 'America/New_York'
            BETWEEN NOW() + INTERVAL '30 minutes'
                AND NOW() + INTERVAL '60 minutes'
    `);

    if (!result.rows.length) {
      console.log('[Reminders] No upcoming trips in the 30-60 min window.');
      return {statusCode: 200, body: JSON.stringify({reminders: 0})};
    }

    let sent = 0;
    for (const b of result.rows) {
      try {
        const driverName = b.driver_name || 'Your assigned driver';
        const pickupTime = b.trip_time || '';
        const paymentCompleted = ['PAID_IN_FULL', 'DEPOSIT_PAID'].includes(String(b.payment_status || '').toUpperCase());
        const invoicedBooking = ['FACILITY', 'STAFF'].includes(String(b.booking_source || '').toUpperCase());
        const includePaymentLink = !invoicedBooking && !paymentCompleted;
        const payLink = `${siteBase()}/booking-app.html?payBalance=1&bookingReference=${encodeURIComponent(b.reference)}`;
        const paymentLinkText = includePaymentLink ? ` Complete payment before pickup: ${payLink}` : '';
        const dispatchEmail = process.env.COMPANY_EMAIL || 'dispatch@nexusmt.com';
        const dispatchPhone = process.env.DISPATCH_PHONE || null;
        const driverPhone = b.driver_phone || null;
        const driverEmail = b.driver_email || null;

        const patientSms = `Nexus Medical Transit reminder: Your ride (${b.reference}) is in about 1 hour. Driver: ${driverName}. Pickup at ${pickupTime} from ${b.pickup}.${paymentLinkText} Call (888) 760-4990 with questions.`;
        const patientEmail = `
          <div style="font-family:sans-serif;max-width:560px;margin:auto">
            <h2 style="color:#082f49">Your ride is in 1 hour</h2>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Reference</td><td style="padding:8px">${b.reference}</td></tr>
              <tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Driver</td><td style="padding:8px"><strong>${driverName}</strong></td></tr>
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Pickup Time</td><td style="padding:8px"><strong>${pickupTime}</strong></td></tr>
              <tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Pickup Address</td><td style="padding:8px">${b.pickup}</td></tr>
              <tr><td style="padding:8px;font-weight:600;color:#62758a">Destination</td><td style="padding:8px">${b.destination}</td></tr>
              <tr style="background:#f3f8fb"><td style="padding:8px;font-weight:600;color:#62758a">Service</td><td style="padding:8px">${b.service}</td></tr>
            </table>
            ${includePaymentLink ? `<p><strong>Payment:</strong> <a href="${payLink}">Complete payment before pickup</a></p>` : ''}
            <p>Need to cancel or reschedule? Call <strong>(888) 760-4990</strong>.</p>
            <p style="color:#62758a;font-size:13px">Nexus Medical Transit · Washington Metropolitan Area</p>
          </div>`;

        const dispatchHtml = `<h2>⏰ 1-Hour Pickup Alert — ${b.reference}</h2><p><strong>Patient:</strong> ${b.name || '—'} (${b.phone || '—'})</p><p><strong>Driver:</strong> ${driverName}</p><p><strong>Pickup:</strong> ${b.pickup} at <strong>${pickupTime}</strong></p><p><strong>Destination:</strong> ${b.destination}</p><p><strong>Service:</strong> ${b.service}</p><p><strong>Status:</strong> ${b.status}</p>`;
        const teamsMsg = `⏰ **1-Hour Pickup Alert** | Ref: ${b.reference}\n- **Patient:** ${b.name || '—'} | ${b.phone || '—'}\n- **Driver:** ${driverName}\n- **Pickup:** ${b.pickup} at **${pickupTime}**\n- **Destination:** ${b.destination}\n- **Service:** ${b.service}\n- **Status:** ${b.status}`;

        const [patientSmsR, patientEmailR, dispatchEmailR, teamsR] = await Promise.allSettled([
          sendSms(b.phone, patientSms),
          b.email ? sendEmail(b.email, `Ride reminder: ${b.reference} — pickup in 1 hour`, patientEmail) : Promise.resolve({status: 'skipped'}),
          sendEmail(dispatchEmail, `⏰ 1-Hour Alert: ${b.reference} — ${b.name || 'Passenger'}`, dispatchHtml),
          sendTeamsAlert(teamsMsg, '⏰ 1-Hour Pickup Alert — Admin_NMT')
        ]);

        await query(
          `UPDATE bookings SET reminder_sent=true, updated_at=now(),
            notification_status=COALESCE(notification_status,'{}')::jsonb || $2::jsonb
           WHERE reference=$1`,
          [b.reference, JSON.stringify({
            reminder: {
              sentAt: new Date().toISOString(),
              patient_sms: patientSmsR.status === 'fulfilled' ? patientSmsR.value : {status: 'failed', error: patientSmsR.reason?.message},
              patient_email: patientEmailR.status === 'fulfilled' ? patientEmailR.value : {status: 'failed', error: patientEmailR.reason?.message},
              dispatch_email: dispatchEmailR.status === 'fulfilled' ? dispatchEmailR.value : {status: 'failed', error: dispatchEmailR.reason?.message},
              teams: teamsR.status === 'fulfilled' ? teamsR.value : {status: 'failed', error: teamsR.reason?.message}
            }
          })]
        );

        sent++;
        console.log(`[Reminders] Sent all alerts for ${b.reference} (driver: ${driverName})`);
      } catch (err) {
        console.error(`[Reminders] Failed to remind ${b.reference}:`, err.message);
      }
    }

    const driverReminderResult = await query(`
      SELECT
        b.*,
        COALESCE(e.display_name, u.display_name, b.driver_name) AS driver_name,
        COALESCE(e.email, u.email) AS driver_email,
        COALESCE(e.phone, u.phone) AS driver_phone
      FROM bookings b
      LEFT JOIN employees e
        ON (e.display_name IS NOT NULL AND lower(trim(e.display_name)) = lower(trim(b.driver_name)))
      LEFT JOIN users u
        ON (
          (e.user_id IS NOT NULL AND u.id = e.user_id)
          OR (
            e.user_id IS NULL
            AND u.role = 'DRIVER'
            AND u.active = true
            AND u.display_name IS NOT NULL
            AND lower(trim(u.display_name)) = lower(trim(b.driver_name))
          )
        )
      WHERE b.status NOT IN ('CANCELLED', 'COMPLETED', 'DELIVERED')
        AND COALESCE(trim(b.driver_name), '') <> ''
        AND b.trip_date IS NOT NULL
        AND b.trip_time IS NOT NULL
        AND COALESCE((b.notification_status->'driverReminder2h'->>'sentAt'), '') = ''
        AND (b.trip_date + b.trip_time) AT TIME ZONE 'America/New_York'
            BETWEEN NOW() + INTERVAL '105 minutes'
                AND NOW() + INTERVAL '135 minutes'
    `);

    let driverSent = 0;
    for (const b of driverReminderResult.rows || []) {
      try {
        const driverName = b.driver_name || 'Driver';
        const driverPhone = b.driver_phone || null;
        const driverEmail = b.driver_email || null;
        const pickupTime = b.trip_time || '';
        const dispatchPhone = process.env.DISPATCH_PHONE || '(888) 760-4990';
        const smsText = `NEXUS ALERT: Trip ${b.reference} pickup in ~2 hours. Patient: ${b.name || 'Passenger'}. Pickup: ${b.pickup} at ${pickupTime}. Destination: ${b.destination}. Vehicle: ${b.vehicle_unit || 'TBD'}. Call dispatch: ${dispatchPhone}.`;
        const emailHtml = `<h2>⏰ 2-Hour Driver Reminder — ${b.reference}</h2><p><strong>Driver:</strong> ${driverName}</p><p><strong>Patient:</strong> ${b.name || '—'} (${b.phone || '—'})</p><p><strong>Pickup:</strong> ${b.pickup} at <strong>${pickupTime}</strong></p><p><strong>Destination:</strong> ${b.destination}</p><p><strong>Vehicle:</strong> ${b.vehicle_unit || 'TBD'}</p><p><strong>Service:</strong> ${b.service}</p><p><strong>Status:</strong> ${b.status}</p>`;

        const [smsR, emailR] = await Promise.allSettled([
          driverPhone ? sendSms(driverPhone, smsText) : Promise.resolve({status: 'skipped-no-driver-phone'}),
          driverEmail ? sendEmail(driverEmail, `⏰ 2-Hour Driver Reminder: ${b.reference}`, emailHtml) : Promise.resolve({status: 'skipped-no-driver-email'})
        ]);

        await query(
          `UPDATE bookings
           SET updated_at=now(),
               notification_status=COALESCE(notification_status,'{}')::jsonb || $2::jsonb
           WHERE reference=$1`,
          [b.reference, JSON.stringify({
            driverReminder2h: {
              sentAt: new Date().toISOString(),
              driver_sms: smsR.status === 'fulfilled' ? smsR.value : {status: 'failed', error: smsR.reason?.message},
              driver_email: emailR.status === 'fulfilled' ? emailR.value : {status: 'failed', error: emailR.reason?.message}
            }
          })]
        );

        driverSent += 1;
        console.log(`[Reminders] Sent 2-hour driver reminder for ${b.reference}`);
      } catch (err) {
        console.error(`[Reminders] Failed 2-hour driver reminder for ${b.reference}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        patientReminders: sent,
        patientCandidates: result.rows.length,
        driverReminders2h: driverSent,
        driverCandidates2h: (driverReminderResult.rows || []).length
      })
    };
  } catch (err) {
    console.error('[Reminders] Fatal error:', err.message);
    return {statusCode: 500, body: JSON.stringify({error: err.message})};
  }
};
