import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type GenerateRequest = {
  projectId: string;
  referenceIds: string[];
  theme: "light" | "dark" | "both";
  accentColor?: string;
  logoUrl?: string;
  additionalInstruction?: string;
  customReferenceUrls?: string[];
};

async function processGeneration(
  supabase: SupabaseClient,
  jobId: string,
  body: GenerateRequest
) {
  try {
    const { projectId, referenceIds, theme, accentColor = "#a3b840", logoUrl, additionalInstruction = "", customReferenceUrls } = body;

    const { data: promptRow } = await supabase
      .from("system_prompts")
      .select("prompt_text")
      .eq("name", "hero_mockup_prompt")
      .maybeSingle();

    const systemPromptBase = promptRow?.prompt_text ||
      "Generate a premium landing page hero section mockup. Color palette includes {{accent_color}}. Theme setting: {{theme}}. Styled with: {{aesthetics}}.";

    const { data: projectRow } = await supabase
      .from("projects")
      .select("name, summary, industry")
      .eq("id", projectId)
      .maybeSingle();

    const projectName = projectRow?.name || "Active Project";
    const projectSummary = projectRow?.summary || "A premium digital product workspace.";
    const projectIndustry = projectRow?.industry || "Technology";

    let refsData: Array<{ title: string; tags: string[]; image_url: string }> = [];
    if (referenceIds && referenceIds.length > 0) {
      const { data: refs } = await supabase
        .from("hero_references")
        .select("title, tags, image_url")
        .in("id", referenceIds);
      if (refs) refsData = refs;
    }

    if (refsData.length === 0 && (!customReferenceUrls || customReferenceUrls.length === 0)) {
      const { data: defaultRefs } = await supabase
        .from("hero_references")
        .select("title, tags, image_url")
        .limit(5);
      if (defaultRefs) refsData = defaultRefs;
    }

    if (customReferenceUrls && customReferenceUrls.length > 0) {
      for (const url of customReferenceUrls) {
        refsData.push({ title: "Custom Reference", tags: ["Custom", "Upload"], image_url: url });
      }
    }

    const variationsCount = Math.min(refsData.length, 5);

    console.log(`[DEBUG] Dispatched parallel gpt-image-2 requests. Count: ${variationsCount}`);

    const generationPromises = Array.from({ length: variationsCount }).map(async (_, idx) => {
      const ref = refsData[idx];
      const aestheticsText = `${ref.title} (${ref.tags.join(", ")})`;
      const imageUrlText = ref.image_url;

      let promptVariation = systemPromptBase
        .replaceAll("{{accent_color}}", accentColor)
        .replaceAll("{{theme}}", theme)
        .replaceAll("{{additionalinstruction}}", additionalInstruction)
        .replaceAll("{{aesthetics}}", additionalInstruction || aestheticsText)
        .replaceAll("{{project_name}}", projectName)
        .replaceAll("{{project_summary}}", projectSummary)
        .replaceAll("{{industry}}", projectIndustry)
        .replaceAll("{{imageURL}}", "the attached layout reference image")
        .replaceAll("{{logoURL}}", logoUrl ? "the attached company logo image" : "");

      if (logoUrl && !systemPromptBase.includes("{{logoURL}}")) {
        promptVariation += ` Fully integrate the company logo from the attached company logo image.`;
      }

      console.log(`[DEBUG] Invoking Supabase Edge Function generate-hero, variation ${idx}`);

      const { data: edgeResult, error: edgeError } = await supabase.functions.invoke("generate-hero", {
        body: {
          prompt: promptVariation,
          imageUrl: imageUrlText || undefined,
          logoUrl: logoUrl || undefined,
          size: "1152x2048",
        },
      });

      if (edgeError) throw new Error(edgeError.message);
      if (!edgeResult?.url) throw new Error("Edge function did not return an image URL.");

      return {
        url: edgeResult.url,
        prompt: promptVariation,
        width: edgeResult.width,
        height: edgeResult.height,
      };
    });

    const results = await Promise.allSettled(generationPromises);

    const successfulImages = results
      .filter((r): r is PromiseFulfilledResult<{ url: string; prompt: string; width: number; height: number }> => r.status === "fulfilled")
      .map(r => r.value);

    if (successfulImages.length === 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map(r => r.reason?.message || "Unknown error");
      throw new Error(`All generation requests failed. Details: ${errors.join(" | ")}`);
    }

    await supabase
      .from("mockup_jobs")
      .update({ status: "completed", result: { options: successfulImages } })
      .eq("id", jobId);

  } catch (error) {
    logServerError("hero.generate.failed", error);
    await supabase
      .from("mockup_jobs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", jobId);
  }
}

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;

  const limited = rateLimitByRequest(request, "hero:generate", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;

  let body: GenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const { data: job, error: insertError } = await supabase
      .from("mockup_jobs")
      .insert({ project_id: projectId, status: "pending" })
      .select("id")
      .single();

    if (insertError || !job) {
      throw new Error(insertError?.message || "Failed to create job.");
    }

    processGeneration(supabase, job.id, body);

    return NextResponse.json({ success: true, jobId: job.id });

  } catch (error) {
    logServerError("hero.generate.create_job.failed", error);
    return NextResponse.json({
      error: "Failed to start generation job.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
