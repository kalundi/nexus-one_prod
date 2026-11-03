-- Non-identifying Nex conversation analytics. No questions, transcripts, IPs or patient IDs.
CREATE TABLE IF NOT EXISTS nex_intent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 response_mode varchar(40) NOT NULL,
 intent varchar(40) NOT NULL,
 terms text[] NOT NULL DEFAULT '{}',
 sources text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_nex_intent_events_created ON nex_intent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nex_intent_events_intent_created ON nex_intent_events(intent,created_at DESC);
-- Access is server-side only; restrict direct client roles when present.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON nex_intent_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON nex_intent_events FROM authenticated;
  END IF;
END $$;
