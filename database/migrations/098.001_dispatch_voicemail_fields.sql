ALTER TABLE dispatch_voice_calls
  ADD COLUMN IF NOT EXISTS recording_sid text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS transcription_sid text,
  ADD COLUMN IF NOT EXISTS transcription_text text,
  ADD COLUMN IF NOT EXISTS transcription_status text,
  ADD COLUMN IF NOT EXISTS voicemail_status text,
  ADD COLUMN IF NOT EXISTS voicemail_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS voicemail_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dispatch_voice_calls_voicemail_received
  ON dispatch_voice_calls(voicemail_received_at DESC)
  WHERE voicemail_received_at IS NOT NULL;
