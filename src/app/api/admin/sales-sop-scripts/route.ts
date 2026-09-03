import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("system_prompts")
      .select("prompt_text,updated_at")
      .eq("name", "sales_sop_scripts")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ scripts: null });
    }

    if (data?.prompt_text) {
      try {
        const parsed = JSON.parse(data.prompt_text);
        return NextResponse.json({ scripts: parsed, updatedAt: data.updated_at });
      } catch {
        return NextResponse.json({ scripts: null });
      }
    }

    return NextResponse.json({ scripts: null });
  } catch {
    return NextResponse.json({ scripts: null });
  }
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body || typeof body.scripts !== "object") {
      return NextResponse.json({ error: "Invalid scripts payload" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("system_prompts").upsert(
      {
        name: "sales_sop_scripts",
        prompt_text: JSON.stringify(body.scripts),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
