import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production RLS migration protects core tables and private brief storage", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260426_production_rls_private_documents.sql", import.meta.url),
    "utf8",
  );

  for (const table of [
    "projects",
    "sitemaps",
    "page_copies",
    "project_documents",
    "app_user_roles",
    "system_prompts",
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }

  assert.match(sql, /VALUES \('project-briefs', 'project-briefs', false\)/);
  assert.match(sql, /ON storage\.objects FOR SELECT/);
});

test("project document UI uses temporary signed URLs", async () => {
  const client = await readFile(
    new URL("../src/app/projects/[id]/ProjectDetailClient.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(new URL("../src/app/projects/[id]/page.tsx", import.meta.url), "utf8");

  assert.match(client, /signedUrl: string/);
  assert.match(client, /href=\{document\.signedUrl\}/);
  assert.match(page, /createSignedDocumentUrl/);
});

test("large PDF workflow uses private signed upload and analysis statuses", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260427_large_pdf_document_workflow.sql", import.meta.url),
    "utf8",
  );
  const dashboard = await readFile(new URL("../src/app/DashboardClient.tsx", import.meta.url), "utf8");
  const uploadRoute = await readFile(
    new URL("../src/app/api/projects/[id]/documents/upload-url/route.ts", import.meta.url),
    "utf8",
  );
  const analyzeRoute = await readFile(
    new URL("../src/app/api/projects/[id]/documents/analyze/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /analysis_status TEXT NOT NULL DEFAULT 'uploaded'/);
  assert.match(migration, /CHECK \(analysis_status IN \('uploaded', 'processing', 'ready', 'failed'\)\)/);
  assert.match(dashboard, /uploadToSignedUrl/);
  assert.match(uploadRoute, /createSignedUploadUrl/);
  assert.match(analyzeRoute, /Document uploaded, AI analysis unavailable/);
});

test("webcopy generation uses extracted PDF text as guided context", async () => {
  const copyRoute = await readFile(
    new URL("../src/app/api/sitemaps/[id]/copies/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(copyRoute, /Sitemap brief and extracted PDF text/);
  assert.match(copyRoute, /PDF-derived context instructions/);
  assert.match(copyRoute, /Treat extracted PDF text as business-understanding guidance/);
  assert.match(copyRoute, /origin story, founder\/background, company history/);
  assert.doesNotMatch(copyRoute, /attached PDF/i);
});
