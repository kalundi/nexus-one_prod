BEGIN;

-- Ensure organizations table exists
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all required organizations columns exist (in case table was created without them)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS name text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active boolean;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Update defaults for any existing rows
UPDATE organizations SET active = COALESCE(active, true) WHERE active IS NULL;
UPDATE organizations SET created_at = COALESCE(created_at, now()) WHERE created_at IS NULL;
UPDATE organizations SET updated_at = COALESCE(updated_at, now()) WHERE updated_at IS NULL;
UPDATE organizations SET display_name = COALESCE(display_name, 'Default Organization') WHERE display_name IS NULL;

-- Create a default organization for development (idempotent)
INSERT INTO organizations (name, slug, display_name, active, created_at, updated_at)
VALUES ('Nexus Medical Transit', 'nexus-default', 'Nexus Medical Transit', true, now(), now())
ON CONFLICT (name) DO NOTHING;

-- Add organization_id column to users if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Add foreign key constraint if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'users' AND constraint_name = 'fk_users_organization'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_organization 
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Populate organization_id for existing users who don't have one
UPDATE users 
SET organization_id = (SELECT id FROM organizations WHERE name = 'Nexus Medical Transit' LIMIT 1)
WHERE organization_id IS NULL;

-- Set NOT NULL constraint on organization_id after populating
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;

INSERT INTO schema_migrations(version,description) VALUES('004.001','Create organizations table and link users to organizations') ON CONFLICT(version) DO NOTHING;

COMMIT;
