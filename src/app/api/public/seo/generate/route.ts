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

  const apiKey = process.env.SEO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY or SEO_OPENAI_API_KEY is not configured on Superapp server." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const systemPrompt = `You are an elite Technical SEO Specialist working for Supercraft.

CRITICAL LANGUAGE RULE:
You MUST analyze the Page Title and Extracted Page Content to detect its primary language (e.g., Bahasa Melayu, English, Chinese, Tamil, etc.).
All generated output fields (meta_title, meta_description, focus_keyword, secondary_keywords, og_title, og_description, suggested_image_alts) MUST be written EXCLUSIVELY in that exact same primary language.
- If the page content is in Bahasa Melayu, write 100% in Bahasa Melayu. Do NOT use Chinese or English.
- If the page content is in English, write 100% in English.
- If the page content is in Chinese, write 100% in Chinese.

CRITICAL TERMINOLOGY & ACCURACY RULE:
- You MUST faithfully adopt the exact brand names, product titles, technical terms, and specific vocabulary used in the Extracted Page Content.
- Do NOT invent non-existent features, hallucinate unmentioned product benefits, or substitute completely different wording/descriptions that are not directly grounded in the actual page text.
- The Focus Keyword, Meta Title, and Meta Description MUST accurately summarize what the page actually presents.

IMAGE ALT RULE (TOKEN EFFICIENT FILENAME & CONTEXT ANALYSIS):
- For images missing ALT tags, analyze their filename (e.g., "kasut-larian-merah.jpg") and surrounding page context.
- Produce short, highly descriptive, keyword-relevant ALT text matching the page language and image subject.

Optimization Goal: Score 90-100/100 on All in One SEO (AIOSEO) analyzer.

Follow these strict rules:
1. Focus Keyword: Identify the single most high-volume primary search term (1-4 words) matching the page language and page content terminology.

2. Meta Title:
   - MUST be between 48 and 60 characters long. NEVER shorter than 45 characters.
   - MUST start with or prominently include the exact Focus Keyword near the beginning.
   - MUST include a strong emotional / power benefit hook grounded in the actual page copy and primary language.
   - End with '| ${site_name}'.

3. Meta Description:
   - MUST be strictly between 140 and 158 characters long. NEVER shorter than 135 characters.
   - Structure into 2 clear sentences in the page's primary language:
     Sentence 1: Prominently feature the Focus Keyword and key product/service value proposition using faithful page terminology.
     Sentence 2: Highlight key customer benefits mentioned on the page and end with a compelling Call-To-Action (CTA).

4. Secondary Keywords: Provide 3-5 LSI / supporting search terms present in the page copy.
5. Social OpenGraph (OG): Write an engaging social media title and description.
6. Image Alt Texts: Provide short, descriptive, keyword-relevant alt texts based on filename + page context for any images missing alt tags.

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

  // Extract clean image filenames and URLs for fast, token-efficient text analysis
  const imageInfo = Array.isArray(missing_alts)
    ? missing_alts.map((url) => ({
        url,
        filename: typeof url === "string" ? url.split("/").pop()?.split("?")[0] : "",
      }))
    : [];

  const userPrompt = `Page Title: ${page_title}
Site Name: ${site_name}

Extracted Page Content:
${content}

Images Missing Alt Text (URLs & Filenames):
${JSON.stringify(imageInfo, null, 2)}`;

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
        temperature: 0.2,
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

    const parsedSEO = JSON.parse(rawContent);

    return NextResponse.json(parsedSEO, {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
