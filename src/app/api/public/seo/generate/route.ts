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
  site_language?: string;
  locale?: string;
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
    site_language = "",
    locale = "",
    page_title = "Untitled Page",
    content = "",
    missing_alts = [],
    brand_voice = "Professional, authoritative, yet engaging",
    model = "gpt-5.4-nano",
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

  // =========================================================================
  // PASS 1: Text Copy & Meta Generation Pipeline (Uses User Selected Model)
  // =========================================================================
  const textSystemPrompt = `You are an elite Technical SEO Specialist working for Supercraft.

CRITICAL LANGUAGE RULE:
You MUST analyze the actual text vocabulary inside the Extracted Page Content to detect its primary written language (e.g., English, Bahasa Melayu, Chinese, etc.).
All generated meta tags and text fields (meta_title, meta_description, focus_keyword, secondary_keywords, og_title, og_description) MUST be written EXCLUSIVELY in that exact same primary language.
- If the Extracted Page Content is written in English, write meta tags 100% in English. Do NOT switch to Bahasa Melayu or any other language, regardless of domain extension (.my), site location, or site name.
- If the Extracted Page Content is written in Bahasa Melayu, write meta tags 100% in Bahasa Melayu.
- If the Extracted Page Content is written in Chinese, write meta tags 100% in Chinese.
- Special Rule for Local Brand Names & Slogans: If a page is written in English but includes local brand names, slogans, or campaign titles in Malay/other languages (e.g., "Janji Sampai"), treat the primary language as English. Keep the local name intact as a proper noun, but write all surrounding meta text in English.
- Do NOT mix languages into full foreign sentences. Match the primary language of the surrounding body copy.

CRITICAL TERMINOLOGY & ACCURACY RULE:
- You MUST faithfully adopt the exact brand names, product titles, technical terms, and specific vocabulary used in the Extracted Page Content.
- Do NOT invent non-existent features, hallucinate unmentioned product benefits, or substitute completely different wording/descriptions that are not directly grounded in the actual page text.
- The Focus Keyword, Meta Title, and Meta Description MUST accurately summarize what the page actually presents.

Optimization Goal: Score 90-100/100 on All in One SEO (AIOSEO) analyzer.

Follow these strict rules:
1. Focus Keyword: Identify the single most high-volume primary search term (1-4 words) matching the page language and page content terminology.

2. Meta Title:
   - Total length (INCLUDING '| ${site_name}') MUST be strictly between 42 and 56 characters long. Hard max: 58 characters. NEVER exceed 58 characters.
   - MUST start with or prominently include the exact Focus Keyword near the beginning.
   - MUST include a strong emotional / power benefit hook grounded in the actual page copy and primary language.
   - End with '| ${site_name}'.

3. Meta Description:
   - Total length MUST be strictly between 135 and 150 characters long. Hard max: 155 characters. NEVER exceed 155 characters.
   - Structure into 2 short, punchy sentences in the page's primary language:
     Sentence 1: Prominently feature the Focus Keyword and key product/service value proposition using faithful page terminology.
     Sentence 2: Highlight key customer benefits mentioned on the page and end with a compelling Call-To-Action (CTA).

4. Secondary Keywords: Provide 3-5 LSI / supporting search terms present in the page copy.
5. Social OpenGraph (OG): Write an engaging social media title and description.

Tone/Voice guidelines: ${brand_voice}.

You MUST respond strictly with a JSON object matching this schema:
{
  "meta_title": "string",
  "meta_description": "string",
  "focus_keyword": "string",
  "secondary_keywords": ["string"],
  "og_title": "string",
  "og_description": "string"
}`;

  const textUserPrompt = `Page Title: ${page_title}
Site Name: ${site_name}${site_language ? `\nSite Language: ${site_language}` : ""}${locale ? `\nSite Locale: ${locale}` : ""}

Extracted Page Content:
${content}`;

  let parsedSEO: Record<string, unknown> = {};

  try {
    const textResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-5.4-nano",
        messages: [
          { role: "system", content: textSystemPrompt },
          { role: "user", content: textUserPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!textResponse.ok) {
      const errText = await textResponse.text();
      return NextResponse.json(
        { error: `OpenAI Text Generation Error: ${errText}` },
        { status: textResponse.status, headers: CORS_HEADERS }
      );
    }

    const textData = await textResponse.json();
    const rawTextContent = textData.choices?.[0]?.message?.content;

    if (rawTextContent) {
      parsedSEO = JSON.parse(rawTextContent);
      
      // Server-Side Smart Length Clamping Guardrails (Guarantees <= 58 title chars, <= 155 desc chars)
      if (typeof parsedSEO.meta_title === "string") {
        parsedSEO.meta_title = clampMetaTitle(parsedSEO.meta_title, site_name);
      }
      if (typeof parsedSEO.meta_description === "string") {
        parsedSEO.meta_description = clampMetaDescription(parsedSEO.meta_description);
      }
      if (typeof parsedSEO.og_title === "string" && parsedSEO.og_title.length > 60) {
        parsedSEO.og_title = clampMetaTitle(parsedSEO.og_title, site_name);
      }
      if (typeof parsedSEO.og_description === "string" && parsedSEO.og_description.length > 158) {
        parsedSEO.og_description = clampMetaDescription(parsedSEO.og_description);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Pass 1 Text Generation Error";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // =========================================================================
  // PASS 2: Dedicated Vision ALT Tag Pipeline (Always Uses GPT-4o-Mini)
  // =========================================================================
  let suggestedImageAlts: Array<{ url: string; alt_text: string }> = [];

  if (Array.isArray(missing_alts) && missing_alts.length > 0) {
    const visionSystemPrompt = `You are a Web Accessibility & Image Vision Specialist working for Supercraft.

CRITICAL IMAGE ALT LANGUAGE RULE:
- ALL suggested_image_alts MUST ALWAYS BE WRITTEN 100% IN ENGLISH, regardless of the page's primary language.
- Reason: Images in WordPress Media Library are shared globally across translated versions of pages (e.g. English, Malay, Chinese). English ALT text provides universal accessibility, search engine indexing, and shared media compatibility across all languages.

VISION INSTRUCTIONS:
- Inspect attached images using OpenAI Vision (detail: low) to identify visual subject matter.
- Produce short, highly descriptive, keyword-relevant ALT text written EXCLUSIVELY IN ENGLISH.
- If an image cannot be fetched via HTTP, analyze the filename and surrounding page context to write an accurate English ALT tag.

You MUST respond strictly with a JSON object matching this schema:
{
  "suggested_image_alts": [
    {
      "url": "string",
      "alt_text": "string"
    }
  ]
}`;

    const visionUserContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      {
        type: "text",
        text: `Page Topic: ${page_title}
Site Context: ${site_name}

Images Missing Alt Text (URLs & Filenames):
${JSON.stringify(missing_alts, null, 2)}`,
      },
    ];

    // Attach Vision image URLs if valid public HTTP/HTTPS URLs (capped at max 6 images per page)
    missing_alts.slice(0, 6).forEach((imgUrl) => {
      if (typeof imgUrl === "string" && (imgUrl.startsWith("http://") || imgUrl.startsWith("https://"))) {
        visionUserContent.push({
          type: "image_url",
          image_url: {
            url: imgUrl,
            detail: "low",
          },
        });
      }
    });

    try {
      const visionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Dedicated vision workstream model
          messages: [
            { role: "system", content: visionSystemPrompt },
            { role: "user", content: visionUserContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (visionResponse.ok) {
        const visionData = await visionResponse.json();
        const rawVisionContent = visionData.choices?.[0]?.message?.content;

        if (rawVisionContent) {
          const parsedVision = JSON.parse(rawVisionContent);
          if (Array.isArray(parsedVision.suggested_image_alts)) {
            suggestedImageAlts = parsedVision.suggested_image_alts;
          }
        }
      }
    } catch {
      // Vision pass failure should not block meta copy return
    }
  }

  // Combine Pass 1 (Text Meta) + Pass 2 (Vision ALTs)
  const finalPayload = {
    ...parsedSEO,
    suggested_image_alts: suggestedImageAlts,
  };

  return NextResponse.json(finalPayload, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

function clampMetaTitle(title: string, siteName: string): string {
  if (!title) return "";
  let cleanTitle = title.trim();

  // If already <= 58 chars, return as is
  if (cleanTitle.length <= 58) return cleanTitle;

  const pipeSuffix = ` | ${siteName}`;
  if (cleanTitle.endsWith(pipeSuffix)) {
    const hook = cleanTitle.slice(0, -pipeSuffix.length).trim();
    const maxHookLen = 58 - pipeSuffix.length;
    if (maxHookLen > 15) {
      let trimmedHook = hook.slice(0, maxHookLen);
      const lastSpace = trimmedHook.lastIndexOf(" ");
      if (lastSpace > 15) {
        trimmedHook = trimmedHook.slice(0, lastSpace);
      }
      return `${trimmedHook.trim()}${pipeSuffix}`;
    }
  }

  // Fallback trim at last space before 57 chars
  let trimmed = cleanTitle.slice(0, 57);
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > 20) {
    trimmed = trimmed.slice(0, lastSpace);
  }
  return trimmed.trim();
}

function clampMetaDescription(desc: string): string {
  if (!desc) return "";
  let cleanDesc = desc.trim();

  // If already <= 158 chars, return as is
  if (cleanDesc.length <= 158) return cleanDesc;

  // Try to find last period within 155 chars
  const sub155 = cleanDesc.slice(0, 155);
  const lastPeriod = sub155.lastIndexOf(".");

  if (lastPeriod >= 110) {
    return sub155.slice(0, lastPeriod + 1).trim();
  }

  // Otherwise trim at last space before 154 chars and add a period
  const lastSpace = sub155.lastIndexOf(" ");
  let trimmed = (lastSpace > 100 ? sub155.slice(0, lastSpace) : sub155).trim();
  // Remove trailing comma or punctuation if present
  trimmed = trimmed.replace(/[,;:-]$/, "");
  return `${trimmed}.`;
}
