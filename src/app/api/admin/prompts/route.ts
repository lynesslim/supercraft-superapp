import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { createAdminClient } from "@/utils/supabase/server";
import { validateJsonPayloadSize, validateTextLength } from "@/utils/validation";

type SavePromptRequest = {
  name?: unknown;
  prompt_text?: unknown;
};

export async function GET(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "admin:prompts:get", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("system_prompts")
    .select("id,name,prompt_text,updated_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prompts: data ?? [] });
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "admin:prompts:post", { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  let body: SavePromptRequest;

  try {
    body = (await request.json()) as SavePromptRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const promptText = typeof body.prompt_text === "string" ? body.prompt_text.trim() : "";
  const payloadSizeError = validateJsonPayloadSize(body, "Prompt");
  if (payloadSizeError) return payloadSizeError;

  if (!name || !promptText) {
    return NextResponse.json({ error: "Prompt name and text are required." }, { status: 400 });
  }
  const nameError = validateTextLength(name, "Prompt name", 120);
  if (nameError) return nameError;
  const promptError = validateTextLength(promptText, "Prompt text");
  if (promptError) return promptError;

  const supabase = createAdminClient();
  const { error } = await supabase.from("system_prompts").upsert(
    {
      name,
      prompt_text: promptText,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "name" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
