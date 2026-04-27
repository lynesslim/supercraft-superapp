-- Large PDF workflow: storage-first uploads and delayed AI document analysis.

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS analysis_summary TEXT,
  ADD COLUMN IF NOT EXISTS analysis_error TEXT,
  ADD COLUMN IF NOT EXISTS openai_file_id TEXT,
  ADD COLUMN IF NOT EXISTS openai_vector_store_id TEXT,
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  ALTER TABLE public.project_documents
    ADD CONSTRAINT project_documents_analysis_status_check
    CHECK (analysis_status IN ('uploaded', 'processing', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS project_documents_analysis_status_idx
  ON public.project_documents (analysis_status);

UPDATE storage.buckets
SET public = false,
    file_size_limit = 62914560,
    allowed_mime_types = ARRAY['application/pdf']::text[]
WHERE id = 'project-briefs';
