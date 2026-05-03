import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";
import { requireEnv } from "@/utils/env";
import { rateLimitByRequest } from "@/utils/rate-limit";
import { logServerError } from "@/utils/server-log";
import { validateJsonPayloadSize, validateTextLength } from "@/utils/validation";

type GenerateRequest = {
  model?: string;
  prompt?: string;
  system?: string;
  temperature?: number;
};

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;
  const limited = rateLimitByRequest(request, "admin:generate", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  requireEnv("openai");

  let body: GenerateRequest;

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const system = body.system?.trim();
  const payloadSizeError = validateJsonPayloadSize(body, "Generate request");
  if (payloadSizeError) return payloadSizeError;

  if (!prompt || !system) {
    return NextResponse.json(
      { error: "Both `system` and `prompt` are required." },
      { status: 400 },
    );
  }
  const promptError = validateTextLength(prompt, "Prompt");
  if (promptError) return promptError;
  const systemError = validateTextLength(system, "System prompt");
  if (systemError) return systemError;

  try {
    const model = body.model ?? "gpt-5-mini";
    console.log("[DEBUG] /api/generate model:", model, "prompt length:", prompt?.length);
const result = await generateText({
      model: openai(model),
      system,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 4000,
    });
    console.log("[DEBUG] /api/generate result text length:", result.text?.length ?? 0);

    return NextResponse.json({ text: result.text });
  } catch (error) {
    logServerError("admin.generate.failed", error);
    return NextResponse.json({ error: "Unable to generate AI output." }, { status: 500 });
  }
}
