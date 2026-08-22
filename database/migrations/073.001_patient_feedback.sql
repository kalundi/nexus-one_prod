CREATE TABLE IF NOT EXISTS patient_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_reference text NOT NULL UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  booking_reference text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category text NOT NULL CHECK (category IN ('DRIVER','TIMELINESS','COMMUNICATION','BOOKING','ACCESSIBILITY','LIVECARE','OTHER')),
  suggestion text NOT NULL CHECK (char_length(suggestion) BETWEEN 10 AND 2000),
  contact_permission boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'LIVECARE',
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','REVIEWING','RESOLVED','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_created ON patient_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_status ON patient_feedback(status,created_at DESC);
ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE patient_feedback FROM anon, authenticated;
