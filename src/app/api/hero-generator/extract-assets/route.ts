import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

type ExtractRequest = {
  mockupImageUrl: string;
  projectId: string;
};

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin", "employee"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "hero:extract-assets", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

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

    // Invoke the edge function to handle the heavy image proxying
    const { data: edgeResult, error: edgeError } = await supabase.functions.invoke("extract-assets", {
      body: {
        mockupImageUrl,
        bgPrompt: bgPromptBase,
        iconPrompt: iconPromptBase,
      },
    });

    if (edgeError) {
      throw new Error(edgeError.message);
    }

    if (!edgeResult?.assets || edgeResult.assets.length === 0) {
      throw new Error("Edge function did not return any assets.");
    }

    return NextResponse.json({ success: true, assets: edgeResult.assets });
  } catch (error) {
    logServerError("hero.extract-assets.failed", error);
    return NextResponse.json({
      error: "Failed to extract assets from mockup.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
