-- Read-only Nex group intelligence. No phone numbers, raw JIDs, names, message bodies, media or transcripts.
-- New events only, from explicitly approved groups. This migration creates no WhatsApp connection.
CREATE TABLE IF NOT EXISTS nex_group_signals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_digest char(64) NOT NULL UNIQUE,
 group_digest char(64) NOT NULL,
 sender_digest char(64) NOT NULL,
 signal_type varchar(16) NOT NULL CHECK (signal_type IN ('task','deadline','question','decision','other')),
 message_type varchar(12) NOT NULL CHECK (message_type='text'),
 occurred_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nex_group_signals_by_group
 ON nex_group_signals(group_digest,received_at DESC);
CREATE INDEX IF NOT EXISTS nex_group_signals_received
 ON nex_group_signals(received_at DESC);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON nex_group_signals FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON nex_group_signals FROM authenticated;
 END IF;
END $$;
