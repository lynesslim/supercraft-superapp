import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

type CommentPayload = {
  embed_key?: unknown;
  embedKey?: unknown;
  author_type?: unknown;
  authorType?: unknown;
  body?: unknown;
};

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

  const { data: feedback } = await supabase
    .from("feedback")
    .select("id")
    .eq("id", feedbackId)
    .eq("project_id", project.id)
    .maybeSingle();

  if (!feedback) {
    return NextResponse.json(
      { error: "Feedback pin not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback_comments")
    .select("id,feedback_id,body,author_type,created_at")
    .eq("feedback_id", feedbackId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const mapped = (data ?? []).map((c) => ({
    id: c.id,
    feedbackId: c.feedback_id,
    body: c.body,
    authorType: c.author_type,
    createdAt: c.created_at,
  }));

  return NextResponse.json(mapped, { headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: feedbackId } = await params;

  let body: CommentPayload;
  try {
    body = (await request.json()) as CommentPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const embedKey = (body.embed_key ?? body.embedKey) as string | undefined;
  const authorType = (body.author_type ?? body.authorType) as string | undefined;
  const commentBody = body.body;

  if (typeof embedKey !== "string" || !embedKey) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (typeof commentBody !== "string" || !commentBody.trim()) {
    return NextResponse.json(
      { error: "body is required." },
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

  const { data: feedback, error: feedbackError } = await supabase
    .from("feedback")
    .select("id")
    .eq("id", feedbackId)
    .eq("project_id", project.id)
    .maybeSingle();

  if (feedbackError || !feedback) {
    return NextResponse.json(
      { error: "Feedback pin not found." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback_comments")
    .insert({
      feedback_id: feedbackId,
      body: String(commentBody).trim(),
      author_type: typeof authorType === "string" ? authorType : "client",
    })
    .select("id,feedback_id,body,author_type,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    {
      id: data.id,
      feedbackId: data.feedback_id,
      body: data.body,
      authorType: data.author_type,
      createdAt: data.created_at,
    },
    { status: 201, headers: CORS_HEADERS },
  );
}