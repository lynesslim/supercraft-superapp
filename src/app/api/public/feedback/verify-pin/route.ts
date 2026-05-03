import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type VerifyPinPayload = {
  embedKey?: unknown;
  passcode?: unknown;
};

export async function POST(request: NextRequest) {
  let body: VerifyPinPayload;
  try {
    body = (await request.json()) as VerifyPinPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { embedKey, passcode } = body;

  if (typeof embedKey !== "string" || !embedKey.trim()) {
    return NextResponse.json(
      { error: "embed_key is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (typeof passcode !== "string" || !passcode.trim()) {
    return NextResponse.json(
      { error: "passcode is required." },
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

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, feedback_passcode")
    .eq("embed_public_key", embedKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed key." },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  if (!project.feedback_passcode) {
    return NextResponse.json(
      { error: "Passcode not set for this project." },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const isValid = project.feedback_passcode === passcode;

  return NextResponse.json(
    { valid: isValid },
    { headers: CORS_HEADERS },
  );
}