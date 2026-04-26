import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/utils/auth";

type GenerateRequest = {
  model?: string;
  prompt?: string;
  system?: string;
  temperature?: number;
};

export async function POST(request: Request) {
  const authError = await requireApiRole(["superadmin"]);
  if (authError) return authError;

  let body: GenerateRequest;

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const system = body.system?.trim();

  if (!prompt || !system) {
    return NextResponse.json(
      { error: "Both `system` and `prompt` are required." },
      { status: 400 },
    );
  }

  try {
    const result = await generateText({
      model: openai(body.model ?? "gpt-4o-mini"),
      system,
      prompt,
      temperature: body.temperature ?? 0.4,
      maxOutputTokens: 1600,
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate AI output.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
