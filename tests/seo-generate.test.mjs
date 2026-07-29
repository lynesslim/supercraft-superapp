import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SEO generate API endpoint structure and validation checks", async () => {
  const code = await readFile(
    new URL("../src/app/api/public/seo/generate/route.ts", import.meta.url),
    "utf8"
  );

  // 1. Assert CORS preflight and headers
  assert.match(code, /CORS_HEADERS/);
  assert.match(code, /"Access-Control-Allow-Origin": "\*"/);
  assert.match(code, /export function OPTIONS\(\)/);

  // 2. Assert POST handler
  assert.match(code, /export async function POST\(/);

  // 3. Assert JSON parsing & payload validation
  assert.match(code, /request\.json\(\)/);
  assert.match(code, /Invalid JSON body/);

  // 4. Assert API Key resolution (SEO_OPENAI_API_KEY || OPENAI_API_KEY)
  assert.match(code, /SEO_OPENAI_API_KEY/);
  assert.match(code, /OPENAI_API_KEY/);

  // 5. Assert License / Embed validation lookup
  assert.match(code, /embed_public_key/);
  assert.match(code, /Invalid embed_code/);

  // 6. Assert OpenAI Call with Structured JSON format
  assert.match(code, /response_format: \{ type: "json_object" \}/);
  assert.match(code, /meta_title/);
  assert.match(code, /meta_description/);
});
