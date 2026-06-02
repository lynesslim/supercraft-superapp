import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";

type EditRequest = {
  imageUrl: string;
  instruction: string;
  projectId?: string;
};

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "hero:edit", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;
  requireEnv("openai");

  let body: EditRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { imageUrl, instruction, projectId } = body;

  if (!imageUrl || !instruction) {
    return NextResponse.json({ error: "imageUrl and instruction are required." }, { status: 400 });
  }

  try {
    const formDataBody = new FormData();
    formDataBody.append("model", "gpt-image-2");
    formDataBody.append("size", "1152x2048");

    const prompt = `Edit the attached hero mockup image. ${instruction}. Preserve the overall layout and branding. Return the revised mockup.`;
    formDataBody.append("prompt", prompt);

    const resImage = await fetch(imageUrl);
    if (!resImage.ok) {
      throw new Error(`Failed to fetch source image: ${resImage.statusText}`);
    }
    const arrayBuffer = await resImage.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: resImage.headers.get("content-type") || "image/png" });
    formDataBody.append("image", blob, "mockup-source.png");

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    const res = await fetch(`${openaiBaseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formDataBody,
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const apiError = errorBody.error?.message ?? `API error: ${res.status}`;
      throw new Error(apiError);
    }

    const payload = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
    let finalImageUrl = "";
    if (payload.data?.[0]?.url) {
      finalImageUrl = payload.data[0].url;
    } else if (payload.data?.[0]?.b64_json) {
      const b64 = payload.data[0].b64_json;
      finalImageUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
    }

    if (!finalImageUrl) {
      throw new Error("API did not return any image data in the edit response.");
    }

    return NextResponse.json({ success: true, imageUrl: finalImageUrl, prompt });
  } catch (error) {
    logServerError("hero.edit.failed", error);
    return NextResponse.json({
      error: "Failed to edit mockup with GPT Image 2 API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
