-- Nex autonomy: public-only content drift and privacy-safe system health.
-- Never store HTML text, visitor messages, patient or account details.
CREATE TABLE IF NOT EXISTS nex_autonomy_snapshots (
 path text PRIMARY KEY,
 digest varchar(64) NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nex_autonomy_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 path text NOT NULL,
 previous_digest varchar(64),
 digest varchar(64) NOT NULL,
 discovered_at timestamptz NOT NULL DEFAULT now(),
 review_id bigint REFERENCES nex_insight_reviews(id),
 UNIQUE(path,digest)
);
CREATE TABLE IF NOT EXISTS nex_autonomy_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_at timestamptz NOT NULL DEFAULT now(),
 status varchar(20) NOT NULL CHECK (status IN ('healthy','degraded')),
 checks jsonb NOT NULL,
 changed_pages integer NOT NULL DEFAULT 0 CHECK(changed_pages>=0)
);
CREATE INDEX IF NOT EXISTS nex_autonomy_runs_time ON nex_autonomy_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS nex_autonomy_changes_time ON nex_autonomy_changes(discovered_at DESC);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON nex_autonomy_snapshots,nex_autonomy_changes,nex_autonomy_runs FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON nex_autonomy_snapshots,nex_autonomy_changes,nex_autonomy_runs FROM authenticated;
 END IF;
END $$;
