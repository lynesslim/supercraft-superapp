import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { createAdminClient } from "@/utils/supabase/server";

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

  let body: EditRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { imageUrl, instruction } = body;

  if (!imageUrl || !instruction) {
    return NextResponse.json({ error: "imageUrl and instruction are required." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: edgeResult, error: edgeError } = await supabase.functions.invoke("edit-hero", {
      body: { imageUrl, instruction },
    });

    if (edgeError) {
      throw new Error(edgeError.message);
    }

    if (!edgeResult?.url) {
      throw new Error("Edge function did not return an image URL.");
    }

    return NextResponse.json({
      success: true,
      imageUrl: edgeResult.url,
      prompt: edgeResult.prompt,
    });
  } catch (error) {
    logServerError("hero.edit.failed", error);
    return NextResponse.json({
      error: "Failed to edit mockup with GPT Image 2 API.",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
