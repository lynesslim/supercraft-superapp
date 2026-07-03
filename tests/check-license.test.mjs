import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("check-license API endpoint structure and security validation", async () => {
  const code = await readFile(
    new URL("../src/app/api/public/check-license/route.ts", import.meta.url),
    "utf8",
  );

  // Assert that CORS headers are correctly defined and used
  assert.match(code, /CORS_HEADERS/);
  assert.match(code, /"Access-Control-Allow-Origin": "\*"/);
  assert.match(code, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);

  // Assert OPTIONS preflight endpoint is defined
  assert.match(code, /export function OPTIONS\(\)/);

  // Assert POST handler existence and database operations
  assert.match(code, /export async function POST\(/);
  assert.match(code, /createAdminClient\(\)/);
  assert.match(code, /from\("projects"\)/);
  assert.match(code, /eq\("embed_public_key",/);

  // Assert validation logic
  assert.match(code, /embed_code/);
  assert.match(code, /valid: \!\!project/);
});
