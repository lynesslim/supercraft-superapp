import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type ExtractRequest = {
  mockupImageUrl: string;
  projectId: string;
};

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "hero:extract-assets", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  requireEnv("openai");

  let body: ExtractRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { mockupImageUrl, projectId } = body;
  if (!mockupImageUrl || !projectId) {
    return NextResponse.json({ error: "mockupImageUrl and projectId are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    // Fetch both system prompts in parallel
    const [bgResult, iconResult] = await Promise.all([
      supabase.from("system_prompts").select("prompt_text").eq("name", "extract_background_prompt").maybeSingle(),
      supabase.from("system_prompts").select("prompt_text").eq("name", "extract_iconography_prompt").maybeSingle(),
    ]);

    const bgPromptBase = bgResult.data?.prompt_text || "Extract the background from this mockup. Remove all text and UI. Return a clean 16:9 background.";
    const iconPromptBase = iconResult.data?.prompt_text || "Generate matching UI iconography based on this mockup design. Return a 9:16 asset sheet.";

    // Fetch source image once for reuse
    const srcResponse = await fetch(mockupImageUrl);
    if (!srcResponse.ok) {
      throw new Error(`Failed to fetch source mockup image: ${srcResponse.statusText}`);
    }
    const srcArrayBuffer = await srcResponse.arrayBuffer();
    const srcMimeType = srcResponse.headers.get("content-type") || "image/png";

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    // Dispatch both extraction tasks in parallel
    const [backgroundResult, iconographyResult] = await Promise.allSettled([
      dispatchExtraction(openaiApiKey!, openaiBaseUrl, srcArrayBuffer, srcMimeType, bgPromptBase, "2048x1152"),
      dispatchExtraction(openaiApiKey!, openaiBaseUrl, srcArrayBuffer, srcMimeType, iconPromptBase, "1152x2048"),
    ]);

    const results: Array<{ asset_type: "background" | "sheet"; image_url: string; prompt_used: string }> = [];

    if (backgroundResult.status === "fulfilled") {
      results.push({ asset_type: "background", ...backgroundResult.value });
    } else {
      logServerError("extract.background.failed", backgroundResult.reason);
    }

    if (iconographyResult.status === "fulfilled") {
      results.push({ asset_type: "sheet", ...iconographyResult.value });
    } else {
      logServerError("extract.iconography.failed", iconographyResult.reason);
    }

    if (results.length === 0) {
      throw new Error("Both extraction tasks failed. Check server logs for details.");
    }

    return NextResponse.json({ success: true, assets: results });
  } catch (error) {
    logServerError("hero.extract-assets.failed", error);
    return NextResponse.json({
      error: "Failed to extract assets from mockup.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

async function dispatchExtraction(
  apiKey: string,
  baseUrl: string,
  srcImage: ArrayBuffer,
  mimeType: string,
  prompt: string,
  size: string,
) {
  const formData = new FormData();
  formData.append("model", "gpt-image-2");
  formData.append("prompt", prompt);
  formData.append("size", size);
  const blob = new Blob([srcImage], { type: mimeType });
  formData.append("image", blob, "mockup-source.png");

  const res = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message ?? `API error: ${res.status}`);
  }

  const payload = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  let imageUrl = "";
  if (payload.data?.[0]?.url) {
    imageUrl = payload.data[0].url;
  } else if (payload.data?.[0]?.b64_json) {
    const b64 = payload.data[0].b64_json;
    imageUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
  }

  if (!imageUrl) {
    throw new Error("API did not return image data.");
  }

  return { image_url: imageUrl, prompt_used: prompt };
}
