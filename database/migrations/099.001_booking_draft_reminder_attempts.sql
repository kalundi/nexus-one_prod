-- Track delivery attempts for incomplete-booking SMS reminders so a draft
-- with an undeliverable phone number cannot be retried every minute forever
-- (the every-minute booking-draft-reminders loop behind the Twilio 21211
-- invalid-'To' storm, Oct 2026). reminder_attempts counts send attempts;
-- reminder_last_error records why the draft was parked (reminder_sent_at is
-- stamped when a draft stops being eligible, whether it sent or not).
ALTER TABLE booking_drafts
  ADD COLUMN IF NOT EXISTS reminder_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_last_error text;
