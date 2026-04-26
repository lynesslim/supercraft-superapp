-- Login roles and project date tracking.

CREATE TABLE IF NOT EXISTS app_user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('superadmin', 'employee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS app_user_roles_role_idx ON app_user_roles (role);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS expiry_date DATE DEFAULT ((CURRENT_DATE + INTERVAL '1 year')::date);

UPDATE projects
SET start_date = COALESCE(start_date, created_at::date, CURRENT_DATE)
WHERE start_date IS NULL;

UPDATE projects
SET expiry_date = COALESCE(expiry_date, (start_date + INTERVAL '1 year')::date)
WHERE expiry_date IS NULL;

DO $$
BEGIN
  ALTER TABLE projects
  ADD CONSTRAINT projects_expiry_after_start_date_check
  CHECK (expiry_date IS NULL OR start_date IS NULL OR expiry_date >= start_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
