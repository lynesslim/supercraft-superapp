import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { createAdminClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await params;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_assets")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assets: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await params;

  let body: { imageUrl: string; assetType: string; promptUsed: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { imageUrl, assetType, promptUsed } = body;
  if (!imageUrl || !assetType || !promptUsed) {
    return NextResponse.json({ error: "imageUrl, assetType, and promptUsed are required." }, { status: 400 });
  }

  if (!["background", "sheet"].includes(assetType)) {
    return NextResponse.json({ error: "assetType must be 'background' or 'sheet'." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_assets")
    .insert({
      project_id: id,
      image_url: imageUrl,
      asset_type: assetType,
      prompt_used: promptUsed,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, asset: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const { id } = await params;
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId");

  if (!assetId) {
    return NextResponse.json({ error: "assetId query parameter is required." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_assets")
    .delete()
    .eq("id", assetId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
