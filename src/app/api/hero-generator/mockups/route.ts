import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_hero_mockups")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mockups: data || [] });
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { projectId, imageUrl, promptUsed, accentColor, theme } = body;

  if (!projectId || !imageUrl || !promptUsed) {
    return NextResponse.json({ error: "Missing required fields (projectId, imageUrl, promptUsed)." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Save mockup to project database
  const { data, error } = await supabase
    .from("project_hero_mockups")
    .insert({
      project_id: projectId,
      image_url: imageUrl,
      prompt_used: promptUsed,
      accent_color: accentColor,
      theme: theme || "both"
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mockup: data });
}

export async function DELETE(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const url = new URL(request.url);
  const mockupId = url.searchParams.get("id");

  if (!mockupId) {
    return NextResponse.json({ error: "Mockup ID is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_hero_mockups")
    .delete()
    .eq("id", mockupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
