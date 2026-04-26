import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

type SavePromptRequest = {
  name?: unknown;
  prompt_text?: unknown;
};

export async function GET() {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

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

  let body: SavePromptRequest;

  try {
    body = (await request.json()) as SavePromptRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const promptText = typeof body.prompt_text === "string" ? body.prompt_text.trim() : "";

  if (!name || !promptText) {
    return NextResponse.json({ error: "Prompt name and text are required." }, { status: 400 });
  }

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
