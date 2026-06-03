import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

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



// Vary prompts slightly for index diversity
const visualStyles = [
  "featuring an ultra-minimalist split-screen layout, high-end typography, clean spacing, and modern design accent highlights",
  "arranged in a sleek Bento-box UI dashboard layout, with structured preview cards, beautiful micro-widgets, and premium details",
  "showcasing a vibrant SaaS style landing page with glassmorphic cards, soft premium shadows, futuristic glowing elements, and dark tech theme highlights",
  "focused on bold editorial typography, organic asymmetrical alignment, refined grid layout, and a luxury boutique aesthetic",
  "styled as a clean corporate design with elegant column grids, premium brand illustrations, conversion-optimized call-to-actions, and professional structure"
];

async function imageUrlToBase64DataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: ${url}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`[ERROR] Failed to convert image URL to base64: ${url}`, err);
    return url;
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

  const { projectId, referenceIds, theme, accentColor = "#a3b840", logoUrl, additionalInstruction = "", customReferenceUrls } = body;



  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    // 1. Fetch system prompt
    const { data: promptRow } = await supabase
      .from("system_prompts")
      .select("prompt_text")
      .eq("name", "hero_mockup_prompt")
      .maybeSingle();

    const systemPromptBase = promptRow?.prompt_text || 
      "Generate a premium landing page hero section mockup. Color palette includes {{accent_color}}. Theme setting: {{theme}}. Styled with: {{aesthetics}}.";

    // Fetch active project details
    const { data: projectRow } = await supabase
      .from("projects")
      .select("name, summary, industry")
      .eq("id", projectId)
      .maybeSingle();

    const projectName = projectRow?.name || "Active Project";
    const projectSummary = projectRow?.summary || "A premium digital product workspace.";
    const projectIndustry = projectRow?.industry || "Technology";

    // 2. Fetch selected references dynamically
    let refsData: Array<{ title: string; tags: string[]; image_url: string }> = [];
    if (referenceIds && referenceIds.length > 0) {
      const { data: refs } = await supabase
        .from("hero_references")
        .select("title, tags, image_url")
        .in("id", referenceIds);
      if (refs) {
        refsData = refs;
      }
    }

    // Fallback if no references are selected
    if (refsData.length === 0 && (!customReferenceUrls || customReferenceUrls.length === 0)) {
      const { data: defaultRefs } = await supabase
        .from("hero_references")
        .select("title, tags, image_url")
        .limit(5);
      if (defaultRefs) {
        refsData = defaultRefs;
      }
    }

    // Merge custom reference uploads into the variation queue
    if (customReferenceUrls && customReferenceUrls.length > 0) {
      for (const url of customReferenceUrls) {
        refsData.push({
          title: "Custom Reference",
          tags: ["Custom", "Upload"],
          image_url: url,
        });
      }
    }

    // Cap parallel variations at 5
    const variationsCount = Math.min(refsData.length, 5);

    console.log(`[DEBUG] Dispatched parallel gpt-image-2 requests. Count: ${variationsCount}`);

    // 3. Generate variations in parallel (each mapped to a specific chosen template)
    const generationPromises = Array.from({ length: variationsCount }).map(async (_, idx) => {
      const ref = refsData[idx];
      const aestheticsText = `${ref.title} (${ref.tags.join(", ")})`;
      const imageUrlText = ref.image_url;

      let promptVariation = systemPromptBase
        .replaceAll("{{accent_color}}", accentColor)
        .replaceAll("{{theme}}", theme)
        .replaceAll("{{additionalinstruction}}", additionalInstruction)
        .replaceAll("{{aesthetics}}", additionalInstruction || aestheticsText) // legacy fallback
        .replaceAll("{{project_name}}", projectName)
        .replaceAll("{{project_summary}}", projectSummary)
        .replaceAll("{{industry}}", projectIndustry)
        .replaceAll("{{imageURL}}", "the attached layout reference image")
        .replaceAll("{{logoURL}}", logoUrl ? "the attached company logo image" : "");


      if (logoUrl && !systemPromptBase.includes("{{logoURL}}")) {
        promptVariation += ` Fully integrate the company logo from the attached company logo image.`;
      }

      const finalSize = "1152x2048";

      console.log(`[DEBUG] Invoking Supabase Edge Function generate-hero, variation ${idx}`);

      const { data: edgeResult, error: edgeError } = await supabase.functions.invoke("generate-hero", {
        body: {
          prompt: promptVariation,
          imageUrl: imageUrlText || undefined,
          logoUrl: logoUrl || undefined,
          size: finalSize,
        },
      });

      if (edgeError) {
        throw new Error(edgeError.message);
      }

      if (!edgeResult?.url) {
        throw new Error("Edge function did not return an image URL.");
      }

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

    return NextResponse.json({
      success: true,
      options: successfulImages
    });

  } catch (error) {
    logServerError("hero.generate.failed", error);
    return NextResponse.json({ 
      error: "Failed to generate mockups with GPT Image 2 API.",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
