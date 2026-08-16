CREATE TABLE IF NOT EXISTS booking_drafts (
 draft_token text PRIMARY KEY,
 name text,
 phone text NOT NULL,
 email text,
 current_step text NOT NULL DEFAULT 'RIDER',
 last_activity_at timestamptz NOT NULL DEFAULT now(),
 reminder_due_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
 reminder_sent_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_drafts_reminder_due
 ON booking_drafts(reminder_due_at)
 WHERE reminder_sent_at IS NULL AND completed_at IS NULL;

INSERT INTO schema_migrations(version,description)
VALUES('066.001','Add five-minute incomplete booking SMS reminders')
ON CONFLICT(version) DO NOTHING;
