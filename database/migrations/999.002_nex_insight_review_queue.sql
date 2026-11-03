-- Store only AI-generated, aggregate insight recommendations for editorial review.
-- No visitor messages, IPs, question text, patient data or model prompts.
CREATE TABLE IF NOT EXISTS nex_insight_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL,
 period_days smallint NOT NULL CHECK(period_days BETWEEN 1 AND 90),
 suggestion text NOT NULL CHECK (length(suggestion) BETWEEN 1 AND 12000),
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),
 reviewed_at timestamptz,
 reviewed_by text,
 CHECK ((status='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
     OR (status<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS nex_insight_reviews_recent ON nex_insight_reviews(created_at DESC);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON nex_insight_reviews FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON nex_insight_reviews FROM authenticated; END IF;
END $$;
