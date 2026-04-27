import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { validateJsonPayloadSize, validateTextLength } from "@/utils/validation";
import { createAdminClient, createClient } from "@/utils/supabase/server";

type CreateSitemapRequest = {
  brief?: unknown;
  edges?: unknown;
  nodes?: unknown;
  projectId?: unknown;
  projectName?: unknown;
};

function removePurposeFromNode(node: unknown) {
  if (!node || typeof node !== "object") return node;

  const candidate = node as {
    data?: Record<string, unknown>;
  };

  if (!candidate.data || typeof candidate.data !== "object") return node;

  const { purpose: _purpose, ...data } = candidate.data;
  void _purpose;

  return { ...candidate, data };
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}

function createFeedbackPasscode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function getOrCreateProjectId({
  projectId,
  projectName,
  supabase,
}: {
  projectId?: unknown;
  projectName?: unknown;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  if (typeof projectId === "string" && projectId.trim()) {
    const id = projectId.trim();
    const { data, error } = await supabase.from("projects").select("id").eq("id", id).single();

    if (error || !data) {
      throw new Error(error?.message ?? "Project not found.");
    }

    return data.id as string;
  }

  const name =
    typeof projectName === "string" && projectName.trim()
      ? projectName.trim()
      : "Untitled project";
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`,
      staging_base_url: "https://staging.example.com",
      embed_public_key: crypto.randomUUID(),
      feedback_passcode: createFeedbackPasscode(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create project.");
  }

  return data.id as string;
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "sitemaps:create", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let body: CreateSitemapRequest;

  try {
    body = (await request.json()) as CreateSitemapRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json(
      { error: "Both nodes and edges arrays are required." },
      { status: 400 },
    );
  }
  const payloadSizeError = validateJsonPayloadSize(body, "Sitemap");
  if (payloadSizeError) return payloadSizeError;
  const briefError = typeof body.brief === "string" ? validateTextLength(body.brief, "Brief") : null;
  if (briefError) return briefError;

  const supabase = await createClient();

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing Supabase admin client.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let projectId: string;
  try {
    projectId = await getOrCreateProjectId({
      projectId: body.projectId,
      projectName: body.projectName,
      supabase: adminSupabase,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare project.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("sitemaps")
    .insert({
      project_id: projectId,
      brief: typeof body.brief === "string" ? body.brief : "",
      nodes: body.nodes.map(removePurposeFromNode),
      edges: body.edges,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projectId, sitemapId: data.id });
}
