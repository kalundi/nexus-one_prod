-- WhatsApp Business coexistence intake. Deliberately stores no raw chat content,
-- phone numbers, contacts, media, names, message text or imported history.
CREATE TABLE IF NOT EXISTS nex_whatsapp_message_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 provider_message_id text NOT NULL,
 phone_number_id text NOT NULL,
 contact_digest varchar(64) NOT NULL,
 direction varchar(16) NOT NULL CHECK(direction IN ('inbound','outbound_app')),
 message_type varchar(32) NOT NULL,
 occurred_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(phone_number_id,provider_message_id,direction)
);
CREATE INDEX IF NOT EXISTS nex_whatsapp_events_received_idx
 ON nex_whatsapp_message_events(received_at DESC);
CREATE INDEX IF NOT EXISTS nex_whatsapp_events_contact_idx
 ON nex_whatsapp_message_events(contact_digest,received_at DESC);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON nex_whatsapp_message_events FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON nex_whatsapp_message_events FROM authenticated;
 END IF;
END $$;
