import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("adhoc hero mockup generation supports optional project_id and adhoc payload", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260724_mockup_jobs_optional_project.sql", import.meta.url),
    "utf8"
  );
  const generateRoute = await readFile(
    new URL("../src/app/api/hero-generator/generate/route.ts", import.meta.url),
    "utf8"
  );
  const clientComponent = await readFile(
    new URL("../src/app/hero-generator/HeroGeneratorClient.tsx", import.meta.url),
    "utf8"
  );

  // Assert SQL migration drops NOT NULL constraint
  assert.match(migration, /ALTER TABLE mockup_jobs ALTER COLUMN project_id DROP NOT NULL/);

  // Assert API route handles optional projectId, adhocName, adhocDetails
  assert.match(generateRoute, /projectId\?: string/);
  assert.match(generateRoute, /adhocName\?: string/);
  assert.match(generateRoute, /adhocDetails\?: string/);
  assert.match(generateRoute, /project_id: jobProjectId/);
  assert.doesNotMatch(generateRoute, /if \(!projectId\) \{/);

  // Assert Client UI supports adhoc mode, inputs, and conditionally hides save to project
  assert.match(clientComponent, /generationMode/);
  assert.match(clientComponent, /adhocName/);
  assert.match(clientComponent, /adhocDetails/);
  assert.match(clientComponent, /Ad-Hoc Generation/);
  assert.match(clientComponent, /Ad-Hoc One-Off/);
});
