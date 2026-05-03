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

async function getProjectByEmbedKeyWithPasscode(
  supabase: ReturnType<typeof createAdminClient>,
  embedKey: string | null | undefined,
) {
  if (!embedKey) return null;

  const { data } = await supabase
    .from("projects")
    .select("id, feedback_passcode")
    .eq("embed_public_key", embedKey)
    .maybeSingle();

  return data as { id: string; feedback_passcode: string | null } | null;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const embedKey = searchParams.get("embed_key");
  const urlPath = searchParams.get("urlPath");
  const includeResolved = searchParams.get("includeResolved") === "1";

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
    .eq("project_id", project.id);

  if (!includeResolved) {
    query = query.eq("status", "open");
  }

  if (urlPath) {
    query = query.eq("url_path", urlPath);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const mapped = (data ?? []).map(mapFeedbackToSnakeCase);
  return NextResponse.json(mapped, { headers: CORS_HEADERS });
}

type FeedbackPinPayload = {
  embedKey?: unknown;
  passcode?: unknown;
  commentText?: unknown;
  selector?: unknown;
  coordinates?: unknown;
  urlPath?: unknown;
  author?: unknown;
  priority?: unknown;
  metadata?: unknown;
  imageUrls?: unknown;
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

  const { embedKey, passcode, commentText, selector, coordinates, urlPath, author, priority, metadata, imageUrls } = body;

  if (typeof embedKey !== "string" || !embedKey.trim()) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const passcodeValue = typeof passcode === "string" ? passcode.trim() : "";

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let project;

  if (passcodeValue) {
    const projectWithPasscode = await getProjectByEmbedKeyWithPasscode(supabase, embedKey);
    if (!projectWithPasscode) {
      return NextResponse.json(
        { error: "Invalid embed key." },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    if (projectWithPasscode.feedback_passcode !== passcodeValue) {
      return NextResponse.json(
        { error: "Invalid passcode." },
        { status: 401, headers: CORS_HEADERS },
      );
    }
    project = projectWithPasscode;
  } else {
    project = await getProjectByEmbedKey(supabase, embedKey);
    if (!project) {
      return NextResponse.json(
        { error: "Invalid embed key." },
        { status: 401, headers: CORS_HEADERS },
      );
    }
  }

  if (typeof commentText !== "string" || !commentText.trim()) {
    return NextResponse.json(
      { error: "commentText is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { data, error } = await supabase
    .from("feedback")
    .insert({
      project_id: project.id,
      comment_text: String(commentText).trim(),
      selector: typeof selector === "string" ? selector : null,
      coordinates: coordinates && typeof coordinates === "object" ? coordinates : null,
      url_path: typeof urlPath === "string" ? urlPath : null,
      author: typeof author === "string" && author.trim() ? author.trim() : "Anonymous",
      priority: typeof priority === "string" ? priority : "low",
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      status: "open",
      image_urls: Array.isArray(imageUrls) ? imageUrls : [],
    })
    .select("id,selector,coordinates,comment_text,author,status,priority,url_path,created_at,image_urls")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(mapFeedbackToSnakeCase(data), { status: 201, headers: CORS_HEADERS });
}