-- Migration to support optional project_id in mockup_jobs for ad-hoc generations

ALTER TABLE mockup_jobs ALTER COLUMN project_id DROP NOT NULL;
