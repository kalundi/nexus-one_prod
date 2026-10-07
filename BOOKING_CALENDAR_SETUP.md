# Booking calendar sync

The booking API can create private events in a configured Microsoft 365 mailbox calendar. Personal Teams calendars are Outlook calendars surfaced in Teams. This integration uses Microsoft Graph calendar events; the existing Teams incoming webhook remains a channel message integration and is not used for calendar entries.

## Configuration and deployment

1. Apply the new migration with the normal database migration process (`npm run db:migrate`): `081.001_booking_calendar_sync.sql`.
2. Configure these protected Netlify environment variables in production:
   - `M365_CALENDAR_MAILBOX_ADDRESS`: explicit target calendar mailbox. For the requested personal calendar, use `fletcher@nexusmt.com` only if that mailbox is the intended event owner.
   - `M365_CALENDAR_TIME_ZONE`: Microsoft Graph/Windows time zone identifier, e.g. `Eastern Standard Time`.
   - Existing `M365_TENANT_ID`, `M365_CLIENT_ID`, and `M365_CLIENT_SECRET` are used for app-only Graph authentication.
3. Grant the app registration Microsoft Graph **Application** permission `Calendars.ReadWrite` and admin-consent it. Scope app-only access to only the designated mailbox using Exchange Online Application RBAC where available; do not grant broad mailbox access unnecessarily. The existing mail-intake `Mail.Read` permission does not permit calendar writes.
4. Deploy after migration and consent. Deploy previews/test mode deliberately skip calendar writes.

## Behavior

- One private, busy event per eligible booking is created at its scheduled pickup date/time, using the configured time zone and estimated route duration (30-minute fallback).
- Calendar sync waits until a booking is no longer pending payment/approval; deposit-required trips wait for `DEPOSIT_PAID` or `PAID_IN_FULL`. Pending coverage statuses are also held back.
- The event includes rider name, service type, pickup/destination, booking reference, and return or recurrence summary when present, according to the requested dispatch-detail preference. It has no attendees and no reminder.
- Repeated syncs update the mapped Graph event. Cancellation deletes it. Sync status and failures are retained in `booking_calendar_sync`; transient `FAILED` records are not automatically retried yet.
- This version creates one event per booking, including a single outbound pickup event for round-trip/recurring bookings; return/recurrence details are included in the body. It does not backfill existing bookings.
- Calendar writes are best-effort and do not invalidate the booking if Graph is unavailable. The API logs failures under `[BOOKING_CALENDAR_SYNC]` / `[BOOKING_CALENDAR_CANCEL]`; the scheduled `booking-calendar-sync` function retries failures every ten minutes, up to ten attempts.

## Local validation

`node --test tests/booking-calendar.test.cjs` exercises eligibility, privacy, event times, idempotent update, cancellation, safe skip, and failure handling with a mocked Graph client. It does not contact Microsoft 365 or send a real event.
