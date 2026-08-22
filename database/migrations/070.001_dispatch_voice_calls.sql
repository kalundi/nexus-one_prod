CREATE TABLE IF NOT EXISTS dispatch_voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_call_sid text UNIQUE,
  direction text NOT NULL DEFAULT 'INBOUND' CHECK (direction IN ('INBOUND','OUTBOUND_CALLBACK')),
  caller_phone text NOT NULL,
  called_number text,
  call_status text NOT NULL DEFAULT 'RECEIVED',
  callback_token_hash text,
  callback_twilio_sid text,
  callback_requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  callback_requested_at timestamptz,
  callback_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_voice_calls_created_at
  ON dispatch_voice_calls(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_voice_calls_callback_token
  ON dispatch_voice_calls(callback_token_hash)
  WHERE callback_token_hash IS NOT NULL;

