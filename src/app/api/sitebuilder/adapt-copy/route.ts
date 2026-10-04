import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourceCopy = body.source_copy || {};
    const blueprint = body.component_blueprint || {};

    const apiKey = process.env.SITEBUILDER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key missing in .env.local" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const selectedModel = process.env.SITEBUILDER_MODEL || "gpt-5.4-nano-2026-03-17";
    const customOpenAI = createOpenAI({ apiKey });

    // Normalize source items to [{ title, description }]
    const rawItems: Array<{ title: string; description: string }> = [];
    if (Array.isArray(sourceCopy.items)) {
      sourceCopy.items.forEach((item: unknown, idx: number) => {
        if (typeof item === "object" && item !== null) {
          const itemObj = item as Record<string, unknown>;
          rawItems.push({
            title: String(itemObj.title || itemObj.heading || `Point ${idx + 1}`),
            description: String(itemObj.description || itemObj.body || ""),
          });
        } else if (typeof item === "string") {
          rawItems.push({
            title: item,
            description: "",
          });
        }
      });
    }

    const fixedSlots = body.fixed_slots;
    const isFixedSlotsMode = Boolean(fixedSlots && typeof fixedSlots === "object");

    let promptContext = `
Source Copy (THIS DEFINES THE TOPIC & MEANING OF THE SECTION):
- Section Type: ${sourceCopy.section_type || "N/A"}
- Heading: ${sourceCopy.heading || "N/A"}
- Subheading: ${sourceCopy.subheading || "N/A"}
- Body Text: ${sourceCopy.body_text || "N/A"}
- CTA Label: ${sourceCopy.cta_label || "N/A"}
- Items Count: ${rawItems.length}
- Items: ${JSON.stringify(rawItems, null, 2)}
${sourceCopy.doc_context ? `- Document Context: ${sourceCopy.doc_context}` : ""}

Target Component Blueprint:
- Title: ${blueprint.component_title || "Target Component"}
- Root Text Slots: ${JSON.stringify(blueprint.root_slots || [], null, 2)}
- Repeater Layout: ${JSON.stringify(blueprint.repeater_layout || { type: "single_grid", column_count: 1, initial_card_counts: [1] }, null, 2)}
`;

    if (isFixedSlotsMode) {
      const fixedPointCount = Array.isArray(fixedSlots.points) ? fixedSlots.points.length : 0;
      
      const getLengthDesc = (str: string) => {
        if (!str || !str.trim()) return "(empty slot - leave empty or minimal)";
        const words = str.trim().split(/\s+/).filter(Boolean).length;
        const chars = str.trim().length;
        const minW = Math.max(1, Math.round(words * 0.85));
        const maxW = Math.max(minW, Math.round(words * 1.15));
        return `"${str}"\n       -> TARGET LENGTH: ~${words} words (STRICT ALLOWABLE: ${minW} to ${maxW} words), ~${chars} chars`;
      };

      promptContext += `
MODE: FIXED STRUCTURE ADAPTATION (RIGHT-CLICK IN-PLACE UPDATE)
The user has right-clicked an existing section on the canvas.
Destination Fixed Text Slots (Do NOT alter layout or add/remove slots):
- Section Heading: ${getLengthDesc(fixedSlots.heading)}
- Section Subheading: ${getLengthDesc(fixedSlots.subheading)}
- Section Badge / Eyebrow: ${getLengthDesc(fixedSlots.badge)}
- Section CTA Button: ${getLengthDesc(fixedSlots.cta)}
- Item Points (${fixedPointCount} total):
${fixedSlots.points && fixedSlots.points.length > 0 ? fixedSlots.points.map((pt: any) => `  * Point ${pt.point_index}:
    - Point Metric / Stat Number: ${pt.point_metric ? `"${pt.point_metric}" (Stat Number / Counter - if not in source copy, author a compelling, domain-appropriate metric like "99.5%", "10x", "$15M+", "500k+")` : "(no metric slot - output \"\")"}
    - Point Heading / Title: ${getLengthDesc(pt.point_heading)} ${pt.point_metric ? `(Stat Label - if not in source copy, author a relevant label matching target length)` : ""}
    - Point Description: ${getLengthDesc(pt.point_description)}`).join("\n") : "  (No repeater points in this section)"}

CRITICAL RULE — STRICT LENGTH & WORD COUNT ADHERENCE (NON-NEGOTIABLE):
Visual UI layouts rely strictly on exact line wrapping, typography balance, card heights, and whitespace harmony.
You must adhere to the target word counts indicated above within the allowable range:

1. TARGET WORD-COUNT FIDELITY:
   - For every slot, your generated text MUST fall within the specified [STRICT ALLOWABLE: min to max words] range.
   - MULTI-SENTENCE PARAGRAPH HEADINGS (e.g. 30–65 words):
     If the destination heading has ~45–55 words (e.g. ~48 words across 2–4 sentences), your adapted heading MUST ALSO BE ~45–55 words across 2–3 rich, articulate sentences!
     CRITICAL: If the source copy brief only has a brief title or phrase, DO NOT stop there. Expand and synthesize the client's value proposition using the source subheading, body text, and Document Context into a full 45–55 word narrative statement.
     ABSOLUTELY FORBIDDEN: Collapsing a ~48-word paragraph heading down to a short 15–20 word sentence. Doing so creates an awkward empty gap in the layout!
   - SHORT HEADINGS (e.g. 3–8 words):
     If the destination heading is short (e.g. 3–6 words), keep your adapted heading strictly short (3–6 words).
   - CARD / ITEM DESCRIPTIONS:
     If a card description target is short (e.g. 4–7 words like "Years guiding businesses toward measurable growth"), your adapted description MUST BE PUNCHY AND STRICTLY 4–7 WORDS!
     ABSOLUTELY FORBIDDEN: Expanding a 4–7 word card description into 11–15 words. That bloats card heights and destroys symmetrical alignment across cards!
   - CARD TITLES / LABELS:
     If the original label is 1–2 words (e.g. "Experience", "Growth", "Projects"), write exactly 1–2 words (e.g. "Advisory", "Outcomes", "Clients").
   - METRIC & STAT COUNTER SLOTS (COUNTERS IN COMPONENT BUT NOT IN SOURCE COPY):
     When the destination component has counters / metric slots (e.g. original was "500+", "52", "25", "99%", "10+"):
     * If the source copy provides specific numbers/metrics, adapt and use them.
     * CRITICAL RULE (COUNTERS NOT IN COPY):
       If the source copy DOES NOT explicitly specify numbers or statistics for these counters:
       DO NOT leave 'metric' empty (""), and DO NOT blindly copy the template's placeholder numbers ("500+ Customers", "52 Completed Projects", "25 Client Satisfaction")!
       YOU MUST INVENT AND AUTHOR CREDIBLE, DOMAIN-APPROPRIATE METRICS AND STAT LABELS tailored to this client's industry and offering!
       Examples:
       - Finance AI SaaS: "99.4%" / "Audit Accuracy", "10x" / "Faster Reconciliation", "2.5M+" / "Invoices Processed", "40hrs" / "Saved Monthly", "$15M+" / "Costs Prevented"
       - B2B Service / Agency: "250+" / "Campaigns Delivered", "98%" / "Client Retention", "14+" / "Industry Awards", "4.9/5" / "Average Rating"
       - Cloud / Infrastructure: "99.99%" / "Guaranteed Uptime", "0ms" / "Latency Overhead", "50M+" / "API Calls Daily", "24/7" / "Expert Support"
       - Healthcare Tech: "100%" / "HIPAA Compliant", "3.2M+" / "Patients Served", "85%" / "Admin Time Reduced"
     * Always format the metric concisely with appropriate suffixes/prefixes (e.g. "+", "%", "x", "k", "M", "$", "/5").
     * Keep the metric to 1–2 tokens (e.g. "99.4%", "10x", "$25M+") and the corresponding title/label to 1–3 words matching the slot's target length.

2. POINT COUNT CONSTRAINTS & ZERO-ITEM SYNTHESIS:
   - For 'adapted_points': you MUST output EXACTLY ${fixedPointCount} items!
   - CRITICAL (ITEMS IN TEMPLATE BUT NOT IN COPY):
     When the destination template has ${fixedPointCount} card/item slots (e.g. marquee pills, feature bullets, service tags, grid cards), but the source copy has 0 items or fewer items:
     YOU MUST INVENT AND AUTHOR ${fixedPointCount} NEW, HIGH-VALUE ITEMS TAILORED SPECIFICALLY TO THIS CLIENT'S BUSINESS, INDUSTRY, AND DOCUMENT CONTEXT!
     ABSOLUTELY FORBIDDEN: Blindly echoing or repeating the template placeholder items (e.g. NEVER return medical/dermatology terms like 'Acne & Acne Scars', 'Eczema & Dermatitis', 'Psoriasis', 'Rosacea' for a Tax & Law firm, or tech terms for a bakery)!
     Author genuine, relevant offerings for the client's domain (e.g. for a Tax & Business Law firm: 'Corporate Tax Strategy', 'M&A Advisory', 'Contract Drafting', 'Regulatory Compliance', 'Entity Formation', 'Employment Agreements', 'Commercial Litigation', 'Cross-Border Planning').
   - If ${fixedPointCount} is 0, return an empty array [].

SELF-AUDIT BEFORE RETURNING JSON:
- Check your generated heading: Did you write ~45–55 words if target was ~48 words? (Do NOT return an 18-word line!)
- Check your generated card descriptions: Did you write ~4–7 words if target was ~4–7 words? (Do NOT return 12–15 words!)
- Check your generated stat counters: If the component has counters but copy had no stats, did you invent impressive, realistic metrics and labels fitting the client's business? (Do NOT repeat "500+ Customers" or leave them blank!)
- Check your generated item pills / cards: Did you author ${fixedPointCount} genuine, industry-appropriate items for this client? (ABSOLUTELY NEVER return template placeholders like "Acne & Acne Scars" or "Eczema"!)
`;
    }

    const systemPrompt = `You are a Senior UI Design Director and Conversion Copywriter.
Your task is to adapt source website copy to fit a specific Elementor component template.

0. SUBJECT-MATTER PRECEDENCE (HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW):
   - The SOURCE COPY is the single source of truth for the topic, meaning, and purpose of the section.
   - The destination component provides ONLY layout: slot count, and target word counts. Its existing text (e.g. badge "Benefits", cards about benefits, medical terms) is placeholder and MUST NOT influence the topic.
   - If the source section_type/heading is about SERVICES (e.g. "What We Do"), the output badge, headings and every point MUST be about the client's actual services (e.g. badge "Our Services" / "What We Do", NOT "Benefits"). NEVER convert services into generic benefits ("Peace of Mind", "Save Time").
   - Same for any other type (features, portfolio, about, process, team, pricing...): keep the source's topic.
   - Use source items verbatim-in-meaning first (condensed to target length). If the template has more slots than source items, author additional complementary items OF THE SAME KIND (extra services for a services section) derived from the document context. Never drift to another topic.
   - Rewrite the eyebrow badge so it names the source section's topic.
   - ITEM MAPPING (MANDATORY): adapted_points[i] for i < number of source items MUST be source item i. Its 'title' MUST be that item's actual name (e.g. "Tax & Accounting Consultant"), only trimmed of filler words if too long (e.g. "Tax & Accounting"). NEVER rename it into an abstract benefit/quality ("Compliance-ready", "Decision clarity", "Expert support"). Its 'description' MUST describe what that service does, using the source item's own wording, condensed.
   - Extra slots beyond the source items: invent other REAL service names (e.g. "Payroll & Bookkeeping", "Annual Compliance Filing"), not benefit phrases.
   - A title that sounds like an adjective/outcome rather than a service/offering is WRONG.

GOALS:
1. STRICT COPY SIZING & CADENCE MATCHING:
   - Match the exact word count (±15%), sentence structure, and visual density of each destination text slot.
   - If the destination heading is a long 40–55 word narrative statement across multiple sentences, you MUST generate a substantive 40–55 word statement. Never truncate it to a short line.
   - If a card description is a short 4–7 word snippet, keep it strictly to 4–7 words. Do not bloat it into a long sentence.
   - If an eyebrow badge is 1–3 words, output a 1–3 word badge.
   - Preserve the design balance, whitespace harmony, and typography cadence of the component.

2. INTELLIGENT STAT COUNTER & METRIC SYNTHESIS:
   - When the template component has counters / stat slots ('point_metric' or numerical counters), but the source copy DOES NOT specify numbers or stats:
     You MUST generate realistic, compelling, domain-specific metrics and labels that make sense for the client's business, industry, and value proposition (e.g. '99.8%' / 'Precision Rate', '10x' / 'Workflow Acceleration', '$25M+' / 'Transactions Managed', '50k+' / 'Active Users', '24/7' / 'Autonomous Support').
     NEVER leave the metric slot empty if the component has a metric slot.
     DO NOT blindly copy template placeholder numbers verbatim if they don't match the client's specific offering.

3. SYMMETRICAL REPEATER BALANCING & FIXED SLOT MAPPING:
   - If in FIXED MODE: output exactly the requested number of 'adapted_points' to match the existing layout without altering the number of slots.
   - If not in fixed mode: check the component's repeater_layout and distribute the items SYMMETRICALLY across all columns in 'layout_plan'.
   - Each item must have a 'metric' (or "" if no metric), a concise 'title' and 'description' matching the template card proportions.

Return strict JSON matching the schema.`;

    const response = await generateObject({
      model: customOpenAI(selectedModel),
      schema: jsonSchema<{
        adapted_slots: {
          heading: string;
          subheading: string;
          badge?: string;
          cta: string;
        };
        adapted_points: Array<{
          metric: string;
          title: string;
          description: string;
        }>;
        layout_plan: {
          columns: Array<{
            column_index: number;
            items: Array<{ title: string; description: string }>;
          }>;
        };
      }>({
        type: "object",
        additionalProperties: false,
        required: ["adapted_slots", "adapted_points", "layout_plan"],
        properties: {
          adapted_slots: {
            type: "object",
            required: ["heading", "subheading", "badge", "cta"],
            additionalProperties: false,
            properties: {
              heading: { type: "string" },
              subheading: { type: "string" },
              badge: { type: "string" },
              cta: { type: "string" },
            },
          },
          adapted_points: {
            type: "array",
            items: {
              type: "object",
              required: ["metric", "title", "description"],
              additionalProperties: false,
              properties: {
                metric: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
          layout_plan: {
            type: "object",
            required: ["columns"],
            additionalProperties: false,
            properties: {
              columns: {
                type: "array",
                items: {
                  type: "object",
                  required: ["column_index", "items"],
                  additionalProperties: false,
                  properties: {
                    column_index: { type: "number" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["title", "description"],
                        additionalProperties: false,
                        properties: {
                          title: { type: "string" },
                          description: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      system: systemPrompt,
      prompt: promptContext,
    });

    return NextResponse.json(
      {
        status: "success",
        adapted_slots: response.object.adapted_slots,
        adapted_points: response.object.adapted_points,
        layout_plan: response.object.layout_plan,
        model_used: selectedModel,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[adapt-copy] Error:", errorMsg);

    // Fallback: If anything fails, return safe fallback so client still inserts without breaking
    return NextResponse.json(
      {
        status: "fallback",
        error: errorMsg,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
