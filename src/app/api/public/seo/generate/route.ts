import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type SEOGeneratePayload = {
  embed_code?: string;
  plugin_name?: string;
  domain?: string;
  post_id?: number;
  site_name?: string;
  page_title?: string;
  content?: string;
  missing_alts?: string[];
  brand_voice?: string;
  model?: string;
};

export async function POST(request: NextRequest) {
  let body: SEOGeneratePayload;
  try {
    body = (await request.json()) as SEOGeneratePayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const {
    embed_code,
    plugin_name = "supercraft-seo",
    site_name = "WordPress Website",
    page_title = "Untitled Page",
    content = "",
    missing_alts = [],
    brand_voice = "Professional, authoritative, yet engaging",
    model = "gpt-4o-mini",
  } = body;

  // Optional: Validate embed_code against Supabase if provided
  if (embed_code) {
    try {
      const supabase = createAdminClient();
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("embed_public_key", embed_code.trim())
        .maybeSingle();

      if (!project) {
        return NextResponse.json(
          { error: "Invalid embed_code license." },
          { status: 403, headers: CORS_HEADERS }
        );
      }
    } catch {
      // If Supabase check fails or isn't set up yet, proceed to allow seamless generation
    }
  }

  // Use dedicated SEO key if available, otherwise fallback to main OPENAI_API_KEY
  const apiKey = process.env.SEO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY or SEO_OPENAI_API_KEY is not configured on Superapp server." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const systemPrompt = `You are an elite Technical SEO Specialist working for Supercraft. Your goal is to write perfectly optimized SEO meta tags for a web page based on its extracted content.
Follow these strict rules:
1. Meta Title: Must be under 60 characters, compelling, keyword-focused, and optionally include '| ${site_name}'.
2. Meta Description: Must be between 140 and 155 characters, include the focus keyword, and end with a clear call-to-action (CTA).
3. Focus Keyword: Identify the single most relevant primary search term (1-4 words).
4. Secondary Keywords: Provide 3-5 LSI / supporting search terms.
5. Social OpenGraph (OG): Write an engaging social media title and description.
6. Image Alt Texts: Provide short, descriptive, keyword-relevant alt texts for any images missing alt tags.

Tone/Voice guidelines: ${brand_voice}.

You MUST respond strictly with a JSON object matching this schema:
{
  "meta_title": "string",
  "meta_description": "string",
  "focus_keyword": "string",
  "secondary_keywords": ["string"],
  "og_title": "string",
  "og_description": "string",
  "suggested_image_alts": [
    {
      "url": "string",
      "alt_text": "string"
    }
  ]
}`;

  const userPrompt = `Page Title: ${page_title}
Site Name: ${site_name}

Extracted Page Content:
${content}

Images Missing Alt Text: ${JSON.stringify(missing_alts)}`;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return NextResponse.json(
        { error: `OpenAI API Error: ${errText}` },
        { status: aiResponse.status, headers: CORS_HEADERS }
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: "OpenAI returned empty response." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const seoData = JSON.parse(rawContent);

    return NextResponse.json(
      {
        success: true,
        plugin: plugin_name,
        seo_data: seoData,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process AI SEO generation: ${message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
