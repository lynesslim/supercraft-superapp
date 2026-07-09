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
  plugin_name?: unknown;
  domain?: unknown;
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
  const pluginName = typeof body.plugin_name === "string" ? body.plugin_name.trim() : "supercraft-master-plugin";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";

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

  if (!project) {
    return NextResponse.json(
      { error: "Invalid license key.", valid: false },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const { data: existingRegistration, error: registrationError } = await supabase
    .from("project_plugin_registrations")
    .select("id, registered_domain")
    .eq("project_id", project.id)
    .eq("plugin_name", pluginName)
    .maybeSingle();

  if (registrationError) {
    return NextResponse.json(
      { error: registrationError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (existingRegistration) {
    // Normalize domains to bare hostnames for comparison
    // (handles mismatch between "https://site.com" vs "site.com")
    const normalizeDomain = (d: string): string => {
      try {
        const withProto = d.includes("://") ? d : `https://${d}`;
        return new URL(withProto).hostname.toLowerCase();
      } catch {
        return d.toLowerCase();
      }
    };
    const existingDomain = existingRegistration.registered_domain ? normalizeDomain(existingRegistration.registered_domain.trim()) : "";
    const incomingDomain = domain ? normalizeDomain(domain) : "";

    if (!existingDomain && incomingDomain) {
      const { error: updateError } = await supabase
        .from("project_plugin_registrations")
        .update({ registered_domain: domain })
        .eq("id", existingRegistration.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    } else if (existingDomain && incomingDomain && existingDomain !== incomingDomain) {
      return NextResponse.json(
        { error: `This license is already registered on another domain: ${existingRegistration.registered_domain}`, valid: false },
        { status: 409, headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(
      { valid: true, registered: true },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const { error: insertError } = await supabase
    .from("project_plugin_registrations")
    .insert({
      project_id: project.id,
      plugin_name: pluginName,
      registered_domain: domain ? domain : null,
    });

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    { valid: true, registered: true },
    { status: 200, headers: CORS_HEADERS },
  );
}
