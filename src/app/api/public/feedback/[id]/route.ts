import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function getProjectByEmbedKey(
  supabase: ReturnType<typeof createAdminClient>,
  embedKey: string | null | undefined,
) {
  if (!embedKey) return null;

  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("embed_public_key", embedKey)
    .maybeSingle();

  return data as { id: string } | null;
}

function mapFeedbackToSnakeCase(feedback: Record<string, unknown>) {
  return {
    id: feedback.id,
    selector: feedback.selector,
    coordinates: feedback.coordinates,
    commentText: feedback.comment_text,
    author: feedback.author,
    status: feedback.status,
    priority: feedback.priority,
    urlPath: feedback.url_path,
    createdAt: feedback.created_at,
    imageUrls: feedback.image_urls,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedbackId } = await params;
  const { searchParams } = new URL(request.url);
  const embedKey = searchParams.get("embed_key") ?? searchParams.get("embedKey");

  if (typeof embedKey !== "string" || !embedKey) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const project = await getProjectByEmbedKey(supabase, embedKey);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback")
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .eq("id", feedbackId)
    .eq("project_id", project.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Feedback not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(mapFeedbackToSnakeCase(data), { headers: CORS_HEADERS });
}

type UpdateFeedbackPayload = {
  embed_key?: unknown;
  embedKey?: unknown;
  status?: unknown;
  priority?: unknown;
};

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedbackId } = await params;

  let body: UpdateFeedbackPayload;
  try {
    body = (await request.json()) as UpdateFeedbackPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const embedKey = (body.embed_key ?? body.embedKey) as string | undefined;
  const status = body.status;
  const priority = body.priority;

  if (typeof embedKey !== "string" || !embedKey) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const project = await getProjectByEmbedKey(supabase, embedKey);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof status === "string") updates.status = status;
  if (typeof priority === "string") updates.priority = priority;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback")
    .update(updates)
    .eq("id", feedbackId)
    .eq("project_id", project.id)
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Feedback not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(mapFeedbackToSnakeCase(data), { headers: CORS_HEADERS });
}

type PatchFeedbackPayload = {
  embed_key?: unknown;
  embedKey?: unknown;
  status?: unknown;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedbackId } = await params;
  const { searchParams } = new URL(request.url);
  const queryEmbedKey = searchParams.get("embed_key") ?? searchParams.get("embedKey");

  let body: PatchFeedbackPayload = {};
  try {
    body = (await request.json()) as PatchFeedbackPayload;
  } catch {
    // Allow empty body, use query param
  }

  const embedKey = (body.embed_key ?? body.embedKey ?? queryEmbedKey) as string | undefined;
  const status = body.status;

  if (typeof embedKey !== "string" || !embedKey) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (status !== "resolved") {
    return NextResponse.json(
      { error: "Only status resolved is supported." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const project = await getProjectByEmbedKey(supabase, embedKey);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback")
    .update({ status: "resolved" })
    .eq("id", feedbackId)
    .eq("project_id", project.id)
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Feedback not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, ...mapFeedbackToSnakeCase(data) }, { headers: CORS_HEADERS });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedbackId } = await params;
  const { searchParams } = new URL(request.url);
  const embedKey = searchParams.get("embed_key") ?? searchParams.get("embedKey");

  if (typeof embedKey !== "string" || !embedKey) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const project = await getProjectByEmbedKey(supabase, embedKey);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { error } = await supabase
    .from("feedback")
    .delete()
    .eq("id", feedbackId)
    .eq("project_id", project.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}