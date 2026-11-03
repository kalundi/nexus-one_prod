-- Proposed FAQ updates are isolated from Nex's runtime-approved JSON.
-- Human editorial approval is necessary but does NOT publish a change.
CREATE TABLE IF NOT EXISTS nex_knowledge_drafts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id bigint NOT NULL REFERENCES nex_insight_reviews(id),
  question text NOT NULL CHECK(length(question) BETWEEN 12 AND 400),
  answer text NOT NULL CHECK(length(answer) BETWEEN 25 AND 2200),
  source text NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','archived')),
  revision int NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nex_knowledge_drafts_review ON nex_knowledge_drafts(review_id,created_at DESC);
CREATE TABLE IF NOT EXISTS nex_knowledge_draft_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id bigint NOT NULL REFERENCES nex_knowledge_drafts(id),
  revision int NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  source text NOT NULL,
  state varchar(20) NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nex_knowledge_history_draft ON nex_knowledge_draft_history(draft_id,revision DESC);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON nex_knowledge_drafts,nex_knowledge_draft_history FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON nex_knowledge_drafts,nex_knowledge_draft_history FROM authenticated;
 END IF;
END $$;
