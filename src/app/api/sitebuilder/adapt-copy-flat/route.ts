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

type FlatSlot = {
  id: string;
  widget_type?: string;
  field?: string;
  text: string;
  word_count?: number;
  depth?: number;
  parent_id?: string | null;
  group_id?: string;
  group_title?: string;
  card_index?: number | null;
  is_card?: boolean;
  item_index?: number | null;
  hint_role?: string;
};

/**
 * Structure-agnostic copy adaptation with Card Grouping, Custom User Prompts, and Iterative Revision.
 * Supports:
 * 1. Structured section copy adaptation.
 * 2. Prompt-driven manual page adaptation guided by global business context.
 * 3. Iterative revision with user feedback / comments for single slot or entire section.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourceCopy = body.source_copy || {};
    const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt.trim() : "";
    const businessContext = body.business_context || null;
    const revisionInstruction = typeof body.revision_instruction === "string" ? body.revision_instruction.trim() : "";
    const targetSlotId = typeof body.target_slot_id === "string" ? body.target_slot_id.trim() : "";
    const targetSlotIds: string[] = Array.isArray(body.target_slot_ids)
      ? body.target_slot_ids.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))
      : (targetSlotId ? [targetSlotId] : []);
    const slots: FlatSlot[] = Array.isArray(body.slots) ? body.slots : [];

    if (slots.length === 0) {
      return NextResponse.json(
        { status: "error", error: "No slots provided" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const apiKey = process.env.SITEBUILDER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key missing in .env.local" },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const selectedModel = process.env.SITEBUILDER_MODEL || "gpt-5.4-nano-2026-03-17";
    const customOpenAI = createOpenAI({ apiKey });

    const rawItems: Array<{ title: string; description: string }> = [];
    if (Array.isArray(sourceCopy.items) && sourceCopy.items.length > 0) {
      sourceCopy.items.forEach((item: unknown, idx: number) => {
        if (typeof item === "object" && item !== null) {
          const itemObj = item as Record<string, unknown>;
          rawItems.push({
            title: String(itemObj.title || itemObj.heading || `Item ${idx + 1}`),
            description: String(itemObj.description || itemObj.body || ""),
          });
        } else if (typeof item === "string") {
          rawItems.push({
            title: item,
            description: "",
          });
        }
      });
    } else if (businessContext && Array.isArray(businessContext.services)) {
      // Fallback: Populate item points directly from global business context services
      businessContext.services.forEach((s: { title?: string; description?: string }, idx: number) => {
        rawItems.push({
          title: s.title || `Service ${idx + 1}`,
          description: s.description || "",
        });
      });
    }

    // Group slots into Section Header and Individual Card Units
    const sectionSlots: FlatSlot[] = [];
    const cardGroupsMap = new Map<number, { title: string; slots: FlatSlot[] }>();

    slots.forEach((s) => {
      if (s.is_card && typeof s.card_index === "number" && s.card_index >= 0) {
        if (!cardGroupsMap.has(s.card_index)) {
          cardGroupsMap.set(s.card_index, {
            title: s.group_title || `Card ${s.card_index + 1}`,
            slots: [],
          });
        }
        cardGroupsMap.get(s.card_index)!.slots.push(s);
      } else {
        sectionSlots.push(s);
      }
    });

    const sortedCardIndexes = Array.from(cardGroupsMap.keys()).sort((a, b) => a - b);
    const totalCards = sortedCardIndexes.length;
    const targetSet = new Set(targetSlotIds);
    const hasTargetFilter = targetSet.size > 0;

    const fmtSlotLine = (s: FlatSlot) => {
      const wc = s.word_count ?? s.text.trim().split(/\s+/).filter(Boolean).length;
      const min = Math.max(1, Math.round(wc * 0.8));
      const max = Math.max(min, Math.round(wc * 1.2));
      const isTarget = targetSet.has(s.id) ? " *** [ADAPT / REWRITE TARGET] ***" : (hasTargetFilter ? " (REFERENCE CONTEXT ONLY - DO NOT REWRITE)" : "");
      return `  - [slot id: ${s.id}] widget=${s.widget_type || "?"}.${s.field || "?"} target: ~${wc} words (${min}–${max} words allowable)${isTarget}\n      Current text: ${JSON.stringify(s.text)}`;
    };

    let promptSlotsBlock = "";

    if (sectionSlots.length > 0) {
      promptSlotsBlock += `================================================================================\nSECTION HEADER & GLOBAL SLOTS (Shared text introducing the section):\n`;
      promptSlotsBlock += sectionSlots.map(fmtSlotLine).join("\n") + "\n\n";
    }

    if (totalCards > 0) {
      promptSlotsBlock += `================================================================================\nREPEATED CARD UNITS (${totalCards} cards detected in this component layout):\n`;
      sortedCardIndexes.forEach((cIdx, cardSeq) => {
        const cardObj = cardGroupsMap.get(cIdx)!;
        const sourceItem = rawItems[cardSeq];
        const isMapped = Boolean(sourceItem);

        promptSlotsBlock += `--------------------------------------------------------------------------------\n`;
        promptSlotsBlock += `CARD ${cardSeq + 1} of ${totalCards}:\n`;
        if (isMapped) {
          promptSlotsBlock += `MAPPED SERVICE/ITEM: "${sourceItem.title}"\n`;
          promptSlotsBlock += `SERVICE DETAILS: "${sourceItem.description || "N/A"}"\n`;
          promptSlotsBlock += `ALL slots below are inside this SAME Card ${cardSeq + 1}. They MUST DESCRIBE "${sourceItem.title}" together coherently:\n`;
        } else {
          promptSlotsBlock += `CARD OFFERING (Synthesize from business context):\n`;
          promptSlotsBlock += `ALL slots below are inside this SAME Card ${cardSeq + 1} and must describe this offering together coherently:\n`;
        }
        promptSlotsBlock += cardObj.slots.map(fmtSlotLine).join("\n") + "\n\n";
      });
    }

    let contextBlock = "";
    if (businessContext) {
      contextBlock += `================================================================================\nBUSINESS CONTEXT:\n`;
      if (businessContext.business_name) contextBlock += `- Company: ${businessContext.business_name}\n`;
      if (businessContext.summary) contextBlock += `- Overview: ${businessContext.summary}\n`;
      if (businessContext.target_audience) contextBlock += `- Target Audience: ${businessContext.target_audience}\n`;
      if (businessContext.brand_voice) contextBlock += `- Brand Voice: ${businessContext.brand_voice}\n`;
      contextBlock += "\n";
    }

    if (userPrompt) {
      contextBlock += `================================================================================\nUSER INSTRUCTION / SECTION PROMPT:\n"${userPrompt}"\n(You MUST author and adapt the copywriting specifically fulfilling this instruction!)\n\n`;
    }

    if (revisionInstruction) {
      contextBlock += `================================================================================\nREVISION FEEDBACK FROM USER (HIGH PRIORITY):\n"${revisionInstruction}"\n(You MUST revise the copy to explicitly address this feedback!)\n\n`;
    }

    if (hasTargetFilter) {
      contextBlock += `================================================================================\nTARGET SLOTS TO REWRITE & RETURN:\n${JSON.stringify(targetSlotIds)}\n`;
      contextBlock += `CRITICAL SELECTIVE REWRITE INSTRUCTION:\n`;
      contextBlock += `- You must ONLY generate and return rewritten text for the target slot IDs listed above!\n`;
      contextBlock += `- Do NOT return updates for non-target slots; leave them out of your updates.\n`;
      contextBlock += `- The other slots in the section are provided as rich reference context (what the rest of the card or section says) so that your rewritten text matches the topic, tone, and intra-card coherence.\n\n`;
    }

    const systemPrompt = `You are a Senior UI Design Director and Conversion Copywriter for Supercraft.
You adapt website copy to fit an EXISTING component layout on the canvas, WITHOUT changing the layout or slots.

CRITICAL RULE 1 — STRICT INTRA-CARD COHERENCE & GROUPING (NON-NEGOTIABLE):
The component text slots are grouped into SECTION HEADER and individual CARD UNITS (Card 1, Card 2, etc.).
Every slot listed under CARD X belongs to the EXACT SAME visual card on the webpage!

- SINGLE SUBJECT PER CARD:
  * Card 1 is 100% dedicated to Service/Item 1.
  * Card 2 is 100% dedicated to Service/Item 2.
  * Every single slot within Card X (Heading, Description, Tag Pills, Button/CTA) MUST DESCRIBE THE EXACT SAME SERVICE / ITEM!
  * Card Heading: The official service/item name (e.g. "Tax & Accounting").
  * Card Description: A clear, articulate paragraph specifically describing WHAT THIS SERVICE DOES and how it helps the client.
    ABSOLUTELY FORBIDDEN: Having a description talk about Tax while the heading says Accounting, or having a button say "Explore Tax Services" while the card is about Accounting!
  * Deliverable / Tag Pills (short button/list slots inside the card, ~1–2 words):
    These must be distinct sub-services, deliverables, or offerings OF THIS SPECIFIC SERVICE (e.g. for Tax & Accounting: "Tax Planning", "Compliance", "GST Filing", "Advisory").
    ABSOLUTELY FORBIDDEN: Repeating the card heading as a tag pill! Tag pills must be distinct deliverables or practice areas within this service.
  * Card CTA Button: The specific action button for THIS SPECIFIC SERVICE (e.g. "Explore Tax Services →", "Explore Accounting →", "Explore Secretarial →").

CRITICAL RULE 2 — PROMPT & CONTEXT ADHERENCE:
- When a USER INSTRUCTION / PROMPT is provided, follow it strictly as the guiding direction for the section topic.
- When REVISION FEEDBACK is provided, revise the text to directly implement the feedback.
- The placeholder text in the component (e.g. "CRM", "Invoicing", "Benefits") is dummy template data and MUST NOT contaminate the topic.

CRITICAL RULE 3 — SCOPE & SELECTIVE ADAPTATION:
- When TARGET SLOTS TO REWRITE are specified, you MUST ONLY return updates for those exact slot IDs.
- Do NOT return updates for non-target slots; they must remain unchanged.
- If NO target slots are specified, return updates for all provided slots.
- Adhere strictly to the target word counts indicated for each slot.
- Paragraph descriptions: write rich, full sentences matching the target length.
- Short pills/labels: keep strictly to 1–2 words.
- Output clean text without HTML tags (unless slot explicitly requires it).`;

    const prompt = `${contextBlock}SOURCE COPY & TOPIC CONTEXT:
- Section Type: ${sourceCopy.section_type || "Custom Section"}
- Section Heading: ${sourceCopy.heading || "N/A"}
- Section Subheading: ${sourceCopy.subheading || "N/A"}
- Section Body: ${sourceCopy.body_text || "N/A"}
- Section CTA: ${sourceCopy.cta_label || "N/A"}
${sourceCopy.doc_context ? `- Document Context:\n${sourceCopy.doc_context}` : ""}

SLOTS GROUPED BY CARD & SECTION:
${promptSlotsBlock}`;

    const response = await generateObject({
      model: customOpenAI(selectedModel),
      schema: jsonSchema<{
        structure_notes: string;
        updates: Array<{ id: string; role: string; text: string }>;
      }>({
        type: "object",
        additionalProperties: false,
        required: ["structure_notes", "updates"],
        properties: {
          structure_notes: { type: "string" },
          updates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "role", "text"],
              properties: {
                id: { type: "string" },
                role: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      }),
      system: systemPrompt,
      prompt,
    });

    const validIds = new Set(slots.map((s) => s.id));
    const updates = (response.object.updates || []).filter(
      (u) => validIds.has(u.id) && (!hasTargetFilter || targetSet.has(u.id)) && typeof u.text === "string" && u.text.trim()
    );

    return NextResponse.json(
      {
        status: "success",
        updates,
        structure_notes: response.object.structure_notes,
        model_used: selectedModel,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[adapt-copy-flat] Error:", errorMsg);
    return NextResponse.json(
      { status: "fallback", error: errorMsg },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
