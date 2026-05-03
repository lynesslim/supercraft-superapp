-- Project PDF brief documents and DB-backed project prompts.

INSERT INTO system_prompts (name, prompt_text) VALUES
('sitemap_generator', 'You are an expert UX designer and content strategist. Given project context, create a premium website sitemap. Return only the structured sitemap object required by the schema. Use stable kebab-case ids. Use null parentId for top-level pages. Pages should be practical, conversion-aware, and useful for the project strategy. For every page, include a purpose field that explains the high-level page intent in 1-2 concise sentences. Purpose is not a section list.'),
('webcopy_generator', 'You are an expert conversion copywriter. Generate rich-text Markdown webcopy for the supplied website page. Use specific, useful content rather than placeholders. Include conversion-focused sections, clear hierarchy, and CTA copy. Return Markdown only.'),
('project_strategy_generator', 'You are a senior website strategist. Create concise, useful project strategy notes for a website planning workflow. Return only valid structured data matching the required schema. Create: brief as a consolidated client/project brief that preserves useful specifics from the submitted brief and additional details; industry as a concise business category; summary as a 2-3 sentence overview that does not duplicate the brief; usp as the strongest positioning or differentiator; strategy_sheet as practical website strategy covering audience, positioning, tone, conversion goals, content priorities, key messaging, trust signals, and conversion opportunities. Write strategy_sheet as plain text or concise bullets, never JSON or code. If supplied URLs are present, use web_search to inspect relevant supplied URLs and web results, treating supplied URLs as client-provided context.'),
('project_detail_refiner', 'You are a senior website strategist editing project planning notes. Be specific, concise, and useful. Return only the requested field content with no preamble. For Industry and Staging Base URL, return one concise plain-text value only. For longer fields, preserve useful specifics and avoid labels unless the content itself needs headings. If no feedback is provided, regenerate the target field with a clearer, more useful version.'),
('style_guide_generator', 'You are a senior brand and website copy director. Create a practical style guide for consistent website copy based on the supplied project details. Include voice, tone, messaging principles, CTA style, terminology, do/don''t guidance, and formatting preferences. Return plain text only.'),
('webcopy_refinement', 'You are editing Markdown website copy. Return only the revised Markdown text requested, with no preamble. Mode meanings: regenerate means regenerate the full page copy; regenerate-selection means rewrite only the selected excerpt; paraphrase means preserve meaning with new wording; shorten means keep the core message in fewer words; expand means add useful specific detail; change-tone means apply the feedback tone; bullet-points means convert the selected excerpt into concise Markdown bullet points. For selection tasks, return only the rewritten selected excerpt and do not include surrounding page titles, labels, or context unless they are inside the selected text. If the selected excerpt does not begin with a Markdown heading, do not begin with a heading.'),
('word_export_formatter', 'You are formatting website sitemap and web copy content for a client-facing Word document. Preserve page hierarchy, use clear headings, separate sections cleanly, and keep formatting professional and readable.')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size BIGINT NOT NULL DEFAULT 0,
  analysis_status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (analysis_status IN ('uploaded', 'processing', 'ready', 'failed')),
  analysis_summary TEXT,
  analysis_error TEXT,
  openai_file_id TEXT,
  openai_vector_store_id TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_created_at_idx
  ON project_documents (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_documents_analysis_status_idx
  ON project_documents (analysis_status);
