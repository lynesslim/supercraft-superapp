import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

type GenerateRequest = {
  projectId?: string;
  adhocName?: string;
  adhocDetails?: string;
  referenceIds: string[];
  theme: "light" | "dark" | "both";
  accentColor?: string;
  logoUrl?: string;
  additionalInstruction?: string;
  customReferenceUrls?: string[];
  instructionImages?: Array<{
    index?: number;
    label?: string;
    url: string;
    fileName?: string;
  }>;
};

async function processGeneration(
  supabase: SupabaseClient,
  jobId: string,
  body: GenerateRequest
) {
  try {
    const {
      projectId,
      adhocName,
      adhocDetails,
      referenceIds,
      theme,
      accentColor = "#a3b840",
      logoUrl,
      additionalInstruction = "",
      customReferenceUrls,
      instructionImages = [],
    } = body;

    const { data: promptRow } = await supabase
      .from("system_prompts")
      .select("prompt_text")
      .eq("name", "hero_mockup_prompt")
      .maybeSingle();

    const systemPromptBase = promptRow?.prompt_text ||
      "Generate a premium landing page hero section mockup. Color palette includes {{accent_color}}. Theme setting: {{theme}}. Styled with: {{aesthetics}}.";

    let projectName = "Active Project";
    let projectSummary = "A premium digital product workspace.";
    let projectIndustry = "Technology";

    if (projectId) {
      const { data: projectRow } = await supabase
        .from("projects")
        .select("name, summary, industry")
        .eq("id", projectId)
        .maybeSingle();

      if (projectRow) {
        projectName = projectRow.name || projectName;
        projectSummary = projectRow.summary || projectSummary;
        projectIndustry = projectRow.industry || projectIndustry;
      }
    } else {
      projectName = adhocName?.trim() || "";
      projectSummary = adhocDetails?.trim() || additionalInstruction?.trim() || "A digital product landing page.";
      projectIndustry = "General";
    }

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

    console.log(`[DEBUG] Dispatched parallel gpt-image-2 requests. Count: ${variationsCount}, InstructionImages: ${instructionImages.length}`);

    // Build context description for any uploaded instruction/product images
    let instructionImagesContext = "";
    if (instructionImages && instructionImages.length > 0) {
      const imageDescriptions = instructionImages.map((img, i) => {
        const label = img.label || `@Image ${img.index || i + 1}`;
        const name = img.fileName ? ` (filename: "${img.fileName}")` : "";
        return `- ${label}${name}: attached reference asset [Image ${i + 1}]`;
      }).join("\n");

      instructionImagesContext = `[Attached Product & Context Images]:
${imageDescriptions}

CRITICAL VISUAL REQUIREMENT:
The user has attached ${instructionImages.length} specific product/context image(s) listed above. Whenever the instructions mention ${instructionImages.map((img, i) => img.label || `@Image ${img.index || i + 1}`).join(", ")}, you MUST accurately recognize that specific item from the attached input images and visibly integrate it as the central hero visual asset in the mockup. Do not replace it with an arbitrary generic stock placeholder.`;
    }

    const userInstructions = additionalInstruction?.trim() || "";
    let combinedInstructions = userInstructions;
    if (instructionImagesContext) {
      combinedInstructions = userInstructions
        ? `${userInstructions}\n\n${instructionImagesContext}`
        : instructionImagesContext;
    }

    const generationPromises = Array.from({ length: variationsCount }).map(async (_, idx) => {
      const ref = refsData[idx];
      const aestheticsText = `${ref.title} (${ref.tags.join(", ")})`;
      const imageUrlText = ref.image_url;

      let promptVariation = systemPromptBase
        .replaceAll("{{accent_color}}", accentColor)
        .replaceAll("{{theme}}", theme)
        .replaceAll("{{additionalinstructions}}", combinedInstructions || "Create a clean, high-converting hero layout.")
        .replaceAll("{{additionalinstruction}}", combinedInstructions || "Create a clean, high-converting hero layout.")
        .replaceAll("{{aesthetics}}", aestheticsText)
        .replaceAll("{{project_name}}", projectName)
        .replaceAll("{{project_summary}}", projectSummary)
        .replaceAll("{{industry}}", projectIndustry)
        .replaceAll("{{imageURL}}", "the attached layout reference image")
        .replaceAll("{{logoURL}}", logoUrl ? "the attached company logo image" : "");

      if (combinedInstructions && !promptVariation.includes(combinedInstructions)) {
        promptVariation += `\n\n[Additional Instructions & Context]:\n${combinedInstructions}`;
      }

      if (logoUrl && !promptVariation.includes("attached company logo")) {
        promptVariation += ` Fully integrate the company logo from the attached company logo image.`;
      }

      console.log(`[DEBUG] Executing gpt-image-2 generation for variation ${idx}`);

      return executeImageGeneration({
        prompt: promptVariation,
        imageUrl: imageUrlText || undefined,
        logoUrl: logoUrl || undefined,
        instructionImages: instructionImages.length > 0 ? instructionImages : undefined,
        size: "1152x2048",
        supabase,
      });
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

async function executeImageGeneration({
  prompt,
  imageUrl,
  logoUrl,
  instructionImages = [],
  size = "1152x2048",
  supabase,
}: {
  prompt: string;
  imageUrl?: string;
  logoUrl?: string;
  instructionImages?: Array<{ url: string; label?: string; fileName?: string; index?: number }>;
  size?: string;
  supabase: SupabaseClient;
}): Promise<{ url: string; prompt: string; width: number; height: number }> {
  const [widthStr, heightStr] = size.split("x");
  const width = parseInt(widthStr, 10) || 1152;
  const height = parseInt(heightStr, 10) || 2048;

  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (openaiApiKey) {
    try {
      console.log(`[executeImageGeneration] Dispatching direct OpenAI edits call with gpt-image-2`);
      const formData = new FormData();
      formData.append("model", "gpt-image-2");
      formData.append("prompt", prompt);
      formData.append("size", size);

      const totalImages = (imageUrl ? 1 : 0) + (logoUrl ? 1 : 0) + instructionImages.length;
      const imageKey = totalImages > 1 ? "image[]" : "image";

      if (imageUrl) {
        try {
          const res = await fetch(imageUrl);
          if (res.ok) {
            const blob = await res.blob();
            formData.append(imageKey, blob, "reference-layout.png");
          } else {
            console.warn(`[executeImageGeneration] Failed to fetch layout reference image: ${res.status}`);
          }
        } catch (e) {
          console.warn("[executeImageGeneration] Reference image fetch error:", e);
        }
      }

      if (logoUrl) {
        try {
          const res = await fetch(logoUrl);
          if (res.ok) {
            const blob = await res.blob();
            formData.append(imageKey, blob, "logo.png");
          } else {
            console.warn(`[executeImageGeneration] Failed to fetch logo image: ${res.status}`);
          }
        } catch (e) {
          console.warn("[executeImageGeneration] Logo image fetch error:", e);
        }
      }

      if (instructionImages.length > 0) {
        for (const [idx, item] of instructionImages.entries()) {
          const itemUrl = item.url;
          if (!itemUrl) continue;
          const rawFileName = item.fileName || `instruction-image-${idx + 1}.png`;
          const safeFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          try {
            const res = await fetch(itemUrl);
            if (res.ok) {
              const blob = await res.blob();
              formData.append(imageKey, blob, `instruction-${idx + 1}-${safeFileName}`);
            } else {
              console.warn(`[executeImageGeneration] Failed to fetch instruction image ${idx + 1}: ${res.status}`);
            }
          } catch (e) {
            console.warn(`[executeImageGeneration] Error fetching instruction image ${idx + 1}:`, e);
          }
        }
      }

      const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const apiResponse = await fetch(`${openaiBaseUrl}/images/edits`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`[executeImageGeneration] OpenAI API error: ${apiResponse.status}`, errorText);
        throw new Error(`OpenAI image edit error: ${apiResponse.status} - ${errorText}`);
      }

      const payload = (await apiResponse.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
      let generatedUrl = "";
      if (payload.data?.[0]?.url) {
        generatedUrl = payload.data[0].url;
      } else if (payload.data?.[0]?.b64_json) {
        const b64 = payload.data[0].b64_json;
        generatedUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
      }

      if (!generatedUrl) {
        throw new Error("OpenAI API returned success but payload has no image data.");
      }

      return {
        url: generatedUrl,
        prompt,
        width,
        height,
      };
    } catch (directErr) {
      console.error("[executeImageGeneration] Direct generation failed, falling back to edge function:", directErr);
    }
  }

  // Fallback to Supabase Edge Function
  console.log(`[executeImageGeneration] Invoking fallback Supabase Edge Function generate-hero`);
  const { data: edgeResult, error: edgeError } = await supabase.functions.invoke("generate-hero", {
    body: {
      prompt,
      imageUrl: imageUrl || undefined,
      logoUrl: logoUrl || undefined,
      instructionImages: instructionImages.length > 0 ? instructionImages : undefined,
      size,
    },
  });

  if (edgeError) throw new Error(edgeError.message);
  if (!edgeResult?.url) throw new Error("Edge function did not return an image URL.");

  return {
    url: edgeResult.url,
    prompt,
    width: edgeResult.width || width,
    height: edgeResult.height || height,
  };
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

  const supabase = createAdminClient();

  let jobProjectId = projectId || null;

  if (!jobProjectId) {
    // If ad-hoc mode, use an existing project ID as fallback to satisfy FK constraint if migration has not run
    const { data: fallbackProject } = await supabase
      .from("projects")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fallbackProject?.id) {
      jobProjectId = fallbackProject.id;
    }
  }

  try {
    const { data: job, error: insertError } = await supabase
      .from("mockup_jobs")
      .insert({ project_id: jobProjectId, status: "pending" })
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
