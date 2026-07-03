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

type CheckLicensePayload = {
  embed_code?: unknown;
};

export async function POST(request: NextRequest) {
  let body: CheckLicensePayload;
  try {
    body = (await request.json()) as CheckLicensePayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const embedCode = body.embed_code;

  if (typeof embedCode !== "string" || !embedCode.trim()) {
    return NextResponse.json(
      { error: "embed_code is required." },
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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("embed_public_key", embedCode.trim())
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      { error: projectError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    { valid: !!project },
    { status: 200, headers: CORS_HEADERS },
  );
}
