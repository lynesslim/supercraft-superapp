import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

// ─── CORS Headers ─────────────────────────────────────────────────────────────
// These headers are needed because the WordPress widget (on a different origin)
// will be making requests directly to this endpoint in the browser.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight requests sent by the browser before the actual request.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── Helper: Authenticate embed_key ───────────────────────────────────────────
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

// ─── GET: Fetch open pins for a given embed_key + url_path ────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const embedKey = searchParams.get("embed_key");
  const urlPath = searchParams.get("url_path");

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

  let query = supabase
    .from("feedback")
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .eq("project_id", project.id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (urlPath) {
    query = query.eq("url_path", urlPath);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(data ?? [], { headers: CORS_HEADERS });
}

// ─── POST: Submit a new feedback pin ──────────────────────────────────────────
type FeedbackPinPayload = {
  embed_key?: unknown;
  comment_text?: unknown;
  selector?: unknown;
  coordinates?: unknown;
  url_path?: unknown;
  author?: unknown;
  priority?: unknown;
  metadata?: unknown;
};

export async function POST(request: NextRequest) {
  let body: FeedbackPinPayload;
  try {
    body = (await request.json()) as FeedbackPinPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { embed_key, comment_text, selector, coordinates, url_path, author, priority, metadata } = body;

  if (typeof embed_key !== "string" || !embed_key.trim()) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (typeof comment_text !== "string" || !comment_text.trim()) {
    return NextResponse.json(
      { error: "comment_text is required." },
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

  const project = await getProjectByEmbedKey(supabase, embed_key);
  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      project_id: project.id,
      comment_text: String(comment_text).trim(),
      selector: typeof selector === "string" ? selector : null,
      coordinates: coordinates && typeof coordinates === "object" ? coordinates : null,
      url_path: typeof url_path === "string" ? url_path : null,
      author: typeof author === "string" && author.trim() ? author.trim() : "Anonymous",
      priority: typeof priority === "string" ? priority : "low",
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      status: "open",
      image_urls: [],
    })
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(data, { status: 201, headers: CORS_HEADERS });
}
