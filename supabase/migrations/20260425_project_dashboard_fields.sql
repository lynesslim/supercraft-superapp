-- Project 2.0 dashboard fields.
-- Run this against the Supabase database to store project brief and strategy
-- output directly on each project row.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS additional_details TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS usp TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS strategy_sheet TEXT;
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE
  DEFAULT timezone('utc'::text, now()) NOT NULL;
