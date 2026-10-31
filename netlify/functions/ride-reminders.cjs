const Teams=require('./_shared/teams.cjs');
const {sendEmail}=require('./_shared/email.cjs');
// Netlify scheduled function: runs every 15 minutes to send ride reminders
// Schedule is configured in netlify.toml

const {query} = require('./_shared/db.cjs');
const {sendSms} = require('./_shared/sms-consent.cjs');
const PatientNotify = require('./_shared/patient-notifications.cjs');
const {buildPatientSmsRecipients} = require('./_shared/notification-routing.cjs');

const envEnabled = name => Boolean(process.env[name]);
const siteBase = () => String(process.env.SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://nexusmt.com').replace(/\/$/, '');


async function sendTeamsAlert(text,title){return Teams.sendTeamsAlert(text,title);}
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
      WHERE b.status NOT IN ('CANCELLED', 'COMPLETED', 'DELIVERED', 'MOCK')
        AND upper(COALESCE(b.booking_source,'')) <> 'MOCK'
        AND (b.reminder_sent IS NULL OR b.reminder_sent = false)
        AND b.duplicate_of IS NULL
        AND b.trip_date IS NOT NULL
        AND b.trip_time IS NOT NULL
        AND (b.trip_date + b.trip_time) AT TIME ZONE 'America/New_York'
            BETWEEN NOW() + INTERVAL '105 minutes'
                AND NOW() + INTERVAL '135 minutes'
    `);

    if (!result.rows.length) {
      console.log('[Reminders] No upcoming trips in the 2-hour window.');
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
        const dispatchEmail = process.env.COMPANY_EMAIL || 'dispatch@nexusmt.com';
        const dispatchPhone = process.env.DISPATCH_PHONE || null;
        const driverPhone = b.driver_phone || null;
        const driverEmail = b.driver_email || null;

        // Patient copy: branded reminder (approved draft §4.3) to the primary
        // contact plus the alternate contact stored on the booking.
        const reminderView = PatientNotify.view({...b, driverName});
        const reminderContent = PatientNotify.reminderContent(reminderView, {paymentLink: includePaymentLink ? payLink : null});
        const reminderAltContent = PatientNotify.reminderContent(reminderView, {paymentLink: includePaymentLink ? payLink : null}, {forAlternate: true});
        const patientPhones = buildPatientSmsRecipients(b);
        const patientSmsPromise = patientPhones.length
          ? Promise.allSettled(patientPhones.map(phone => sendSms(phone, reminderContent.sms))).then(results => {
              const sent = results.find(r => r.status === 'fulfilled' && r.value?.status === 'sent');
              const failed = results.find(r => r.status === 'rejected');
              return sent ? sent.value : (failed ? {status: 'failed', error: failed.reason?.message} : {status: 'skipped'});
            })
          : Promise.resolve({status: 'skipped'});
        const patientEmailPromise = (async () => {
          const sends = [];
          if (b.email) sends.push(sendEmail(b.email, reminderContent.subject, reminderContent.html));
          if (b.alternate_email) sends.push(sendEmail(b.alternate_email, reminderAltContent.subject, reminderAltContent.html));
          if (!sends.length) return {status: 'skipped'};
          const results = await Promise.allSettled(sends);
          const sent = results.find(r => r.status === 'fulfilled' && r.value?.status === 'sent');
          const failed = results.find(r => r.status === 'rejected');
          return sent ? sent.value : (failed ? {status: 'failed', error: failed.reason?.message} : {status: 'skipped'});
        })();

        const dispatchHtml = `<h2>⏰ 2-Hour Pickup Alert — ${b.reference}</h2><p><strong>Patient:</strong> ${b.name || '—'} (${b.phone || '—'})</p><p><strong>Driver:</strong> ${driverName}</p><p><strong>Pickup:</strong> ${b.pickup} at <strong>${pickupTime}</strong></p><p><strong>Destination:</strong> ${b.destination}</p><p><strong>Service:</strong> ${b.service}</p><p><strong>Status:</strong> ${b.status}</p>`;
        const teamsMsg = `⏰ **2-Hour Pickup Alert** | Ref: ${b.reference}\n- **Patient:** ${b.name || '—'} | ${b.phone || '—'}\n- **Driver:** ${driverName}\n- **Pickup:** ${b.pickup} at **${pickupTime}**\n- **Destination:** ${b.destination}\n- **Service:** ${b.service}\n- **Status:** ${b.status}`;

        const [patientSmsR, patientEmailR, dispatchEmailR, teamsR] = await Promise.allSettled([
          patientSmsPromise,
          patientEmailPromise,
          sendEmail(dispatchEmail, `⏰ 2-Hour Alert: ${b.reference} — ${b.name || 'Passenger'}`, dispatchHtml),
          sendTeamsAlert(teamsMsg, '⏰ 2-Hour Pickup Alert — Admin_NMT')
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
