CREATE TABLE IF NOT EXISTS social_publish_history (
  id BIGSERIAL PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/New_York')::date,
  channel TEXT NOT NULL,
  post_id TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_publish_history_channel_date
  ON social_publish_history(channel, run_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS social_channel_credentials (
  channel TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  credential_hint TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
