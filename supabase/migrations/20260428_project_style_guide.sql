-- Project-level copy style guide used as the source of truth for generated webcopy.

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS style_guide TEXT;

INSERT INTO public.system_prompts (name, prompt_text)
VALUES (
  'style_guide_generator',
  'You are a senior brand and website copy director. Create a practical style guide for consistent website copy based on the supplied project details. Include voice, tone, messaging principles, CTA style, terminology, do/don''t guidance, and formatting preferences. Return plain text only.'
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.system_prompts (name, prompt_text)
VALUES (
  'style_guide_refinement',
  'You are a senior brand and website copy director. Refine and improve the style guide based on the feedback provided. Keep the same structure (voice, tone, messaging principles, CTA style, terminology, do/don''t, formatting). Return the complete improved style guide in plain text.'
)
ON CONFLICT (name) DO NOTHING;
