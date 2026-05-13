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

type ValidateEmbedPayload = {
  embed_code?: unknown;
  plugin_name?: unknown;
  domain?: unknown;
};

export async function POST(request: NextRequest) {
  let body: ValidateEmbedPayload;
  try {
    body = (await request.json()) as ValidateEmbedPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const embedCode = body.embed_code;
  const pluginName = body.plugin_name;
  const domain = body.domain;

  if (typeof embedCode !== "string" || !embedCode.trim()) {
    return NextResponse.json(
      { error: "embed_code is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (typeof pluginName !== "string" || !pluginName.trim()) {
    return NextResponse.json(
      { error: "plugin_name is required." },
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

  if (!project) {
    return NextResponse.json(
      { error: "Invalid embed_code.", valid: false },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { data: existingRegistration, error: registrationError } = await supabase
    .from("project_plugin_registrations")
    .select("id")
    .eq("project_id", project.id)
    .eq("plugin_name", pluginName.trim())
    .maybeSingle();

  if (registrationError) {
    return NextResponse.json(
      { error: registrationError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!existingRegistration) {
    const { error: insertError } = await supabase
      .from("project_plugin_registrations")
      .insert({
        project_id: project.id,
        plugin_name: pluginName.trim(),
        registered_domain: typeof domain === "string" ? domain.trim() : null,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500, headers: CORS_HEADERS },
      );
    }
  }

  return NextResponse.json(
    {
      valid: true,
      registered: true,
      projectId: project.id,
    },
    { headers: CORS_HEADERS },
  );
}