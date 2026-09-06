"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Copy,
  Check,
  Send,
  ChevronLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Pencil,
  Save,
  RotateCcw,
  PhoneCall,
  Clock,
  CheckCircle2,
  PhoneOff,
  ShieldCheck,
  GitBranch,
  Plus,
  Trash2,
  X,
  ExternalLink,
  Split,
  AlertTriangle,
  Info,
  CornerDownRight,
  Settings2,
  Database,
} from "lucide-react";

export type NodeType = "message" | "decision" | "button" | "note" | "arrow";

export interface ActionButtonConfig {
  label: string;
  actionType: "navigate_category" | "open_url";
  target: string; // category id e.g. "qualification" or URL e.g. "/sales-sop/call"
  color?: "lime" | "sky" | "emerald" | "amber" | "purple" | "stone";
}

export interface FlowchartBranch {
  id: string;
  label: string;
  badgeColor?: string;
  nodes: FlowNode[];
}

export interface FlowNode {
  id: string;
  type: NodeType;
  title?: string;
  text?: string;
  badgeColor?: string;
  connectorLabel?: string;

  // For Decision / Branching
  decisionQuestion?: string;
  branches?: FlowchartBranch[];

  // For Button Node
  buttonConfig?: ActionButtonConfig;

  // For Note / Rule Node
  noteVariant?: "warning" | "info" | "success";
}

export interface FlowchartCategoryConfig {
  id: string;
  label: string;
  iconName?: string;
  nodes: FlowNode[];
}

export const BADGE_COLORS: Record<string, { label: string; class: string }> = {
  lime: { label: "Supercraft Lime", class: "bg-[#a3b840]/20 text-[#c8db5a] border-[#a3b840]/30" },
  green: { label: "Emerald Green", class: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  sky: { label: "Sky Blue", class: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  purple: { label: "Purple", class: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  amber: { label: "Amber / Yellow", class: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  rose: { label: "Rose / Red", class: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  gray: { label: "Neutral Gray", class: "bg-white/10 text-white/80 border-white/20" },
};

export const BUTTON_COLORS: Record<string, { label: string; class: string }> = {
  lime: { label: "Supercraft Lime", class: "bg-[#a3b840] text-[#111310] hover:bg-[#b8ce49]" },
  sky: { label: "Sky Blue", class: "bg-sky-400 text-slate-950 hover:bg-sky-300" },
  emerald: { label: "Emerald Green", class: "bg-emerald-400 text-slate-950 hover:bg-emerald-300" },
  amber: { label: "Amber", class: "bg-amber-400 text-stone-950 hover:bg-amber-300" },
  purple: { label: "Purple", class: "bg-purple-400 text-slate-950 hover:bg-purple-300" },
  stone: { label: "Neutral Stone", class: "border border-white/15 bg-white/10 text-white hover:bg-white/20" },
};

// =========================================================================
// DEFAULT OFFICIAL 10-PAGE FLOWCHART DATA
// =========================================================================
const DEFAULT_CATEGORIES: FlowchartCategoryConfig[] = [
  {
    id: "first-contact",
    label: "1. First Contact Flowchart",
    nodes: [
      {
        id: "fc_note_start",
        type: "note",
        text: "⚡ 1. New Inbound Lead Arrives via Form / WhatsApp",
        noteVariant: "info",
      },
      {
        id: "fc_init_msg",
        type: "message",
        connectorLabel: "Send WhatsApp Immediately",
        title: "💬 Initial Inbound WhatsApp Message",
        badgeColor: "green",
        text: "Hi [Name] 👋 [Your Name] here from Supercraft.\n\nJust saw your enquiry about your website. Thanks for reaching out 😊\n\nI'll give you a quick call now — just want to understand what you're looking for and see how we can help.",
      },
      {
        id: "fc_decision_call",
        type: "decision",
        connectorLabel: "Then Call Straightaway",
        decisionQuestion: "📞 Call Attempt #1 (Live Phone Result)",
        branches: [
          {
            id: "br_call_answered",
            label: "🟢 Call Answered",
            badgeColor: "green",
            nodes: [
              {
                id: "fc_btn_call_sop",
                type: "button",
                buttonConfig: {
                  label: "Proceed to BD Call Script →",
                  actionType: "open_url",
                  target: "/sales-sop/call",
                  color: "emerald",
                },
              },
            ],
          },
          {
            id: "br_text_pref",
            label: "💬 Text Preferred / Call Rejected",
            badgeColor: "sky",
            nodes: [
              {
                id: "fc_msg_rejected",
                type: "message",
                title: "Transition to WhatsApp Message",
                badgeColor: "sky",
                text: "Of course, no problem at all 👍 We can go through everything here 😊\n\nFirst, is this for a completely new website or are you looking to redesign an existing one?",
              },
              {
                id: "fc_btn_go_wa_main",
                type: "button",
                buttonConfig: {
                  label: "Next: Go to WhatsApp Main Flow →",
                  actionType: "navigate_category",
                  target: "qualification",
                  color: "sky",
                },
              },
            ],
          },
          {
            id: "br_no_answer",
            label: "🟡 No Answer (Ringing / Missed)",
            badgeColor: "amber",
            nodes: [
              {
                id: "fc_msg_missed1",
                type: "message",
                title: "Missed Call #1 WhatsApp Message",
                badgeColor: "amber",
                text: "Hi [Name] 👋 Just tried giving you a quick call regarding your website enquiry.\n\nNo worries if you're tied up 😊\n\nI'll check back with you a little later. If it's easier, you can also reply to me here anytime 👍",
              },
              {
                id: "fc_btn_go_no_answer",
                type: "button",
                buttonConfig: {
                  label: "Next: 3-Attempt Protocol →",
                  actionType: "navigate_category",
                  target: "no-answer",
                  color: "amber",
                },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "qualification",
    label: "2. WhatsApp Main Flowchart",
    nodes: [
      {
        id: "q_stage1_decision",
        type: "decision",
        decisionQuestion: "Stage 1: Discover Business / Current Situation",
        branches: [
          {
            id: "br_stage1_new",
            label: "🌱 Option A: Completely New Website",
            badgeColor: "lime",
            nodes: [
              {
                id: "q_msg_stage1_new",
                type: "message",
                title: "New Website Discovery Question",
                badgeColor: "lime",
                text: "Got it 👍\n\nCan you share a little more about the business — what do you mainly offer, and who are your main customers?",
              },
            ],
          },
          {
            id: "br_stage1_redesign",
            label: "🔄 Option B: Existing Website Redesign",
            badgeColor: "lime",
            nodes: [
              {
                id: "q_msg_stage1_redesign",
                type: "message",
                title: "Redesign Discovery Question",
                badgeColor: "lime",
                text: "Got it 👍 Could you send me your current website link?\n\nAlso, what's prompting the redesign at the moment? What would you ideally like the new website to do better?",
              },
            ],
          },
        ],
      },
      {
        id: "q_msg_stage2",
        type: "message",
        connectorLabel: "Prospect replies with business background",
        title: "Stage 2: Discover Commercial Objective",
        badgeColor: "sky",
        text: "Understood 👌\n\nAnd what's the main objective you're hoping to achieve with the new website?\n\nWould you say it's mainly to generate more enquiries, strengthen the brand and credibility, better communicate your products/services — or a combination of these?",
      },
      {
        id: "q_stage3_decision",
        type: "decision",
        connectorLabel: "Prospect states primary objective",
        decisionQuestion: "Stage 3: Strategic Observation & Relevant Proof",
        branches: [
          {
            id: "br_stage3_brand",
            label: "🏢 Brand & Credibility",
            badgeColor: "purple",
            nodes: [
              {
                id: "q_msg_stage3_brand",
                type: "message",
                title: "Brand Observation & Relevant Proof",
                badgeColor: "purple",
                text: "Got it. Yes, this is definitely something we can help with 👍\n\nFrom what you've shared, I think the opportunity isn't just to make the website look more modern, but to reposition the company digitally so the website better reflects the credibility and scale of the business.\n\nLet me share a couple of relevant projects we've worked on 👇\n[Case Study 1]\n[Case Study 2]",
              },
            ],
          },
          {
            id: "br_stage3_leadgen",
            label: "🎯 Lead Generation & Conversion",
            badgeColor: "purple",
            nodes: [
              {
                id: "q_msg_stage3_leadgen",
                type: "message",
                title: "Lead-Gen Observation & Relevant Proof",
                badgeColor: "purple",
                text: "Got it. Yes, this is definitely something we can help with 👍\n\nFrom what you've shared, I think the opportunity isn't just redesigning the website, but rethinking the structure, messaging and user journey around converting more visitors into enquiries.\n\nLet me share a couple of relevant projects we've worked on 👇\n[Case Study 1]\n[Case Study 2]",
              },
            ],
          },
          {
            id: "br_stage3_product",
            label: "📦 Product / Service Comm",
            badgeColor: "purple",
            nodes: [
              {
                id: "q_msg_stage3_product",
                type: "message",
                title: "Product Observation & Relevant Proof",
                badgeColor: "purple",
                text: "Got it. Yes, this is definitely something we can help with 👍\n\nFrom what you've shared, I think the opportunity is to simplify how your products/services are presented and structure the website around what your different customer segments actually need.\n\nLet me share a couple of relevant projects we've worked on 👇\n[Case Study 1]\n[Case Study 2]",
              },
            ],
          },
        ],
      },
      {
        id: "q_msg_stage4",
        type: "message",
        connectorLabel: "Explain what we prepare before asking for meeting",
        title: "Stage 4: Sell the Strategy Proposal",
        badgeColor: "lime",
        text: "Typically, the next step on our end is to prepare a detailed strategy proposal for you.\n\nBefore we propose any design, our team will first:\n🔎 Audit your existing website and digital presence\n📊 Research your key competitors and how they're positioning themselves online\n💡 Identify opportunities to improve the website based on your objective of [OBJECTIVE]\n🖥 Put together our recommended website strategy, structure and creative direction\n\nSo when we meet, it won't just be a generic company presentation — we'll actually walk you through what we think Supercraft can do for [Company].",
      },
      {
        id: "q_msg_stage5",
        type: "message",
        connectorLabel: "Propose meeting to present proposal",
        title: "Stage 5: Propose the Meeting (Merdeka 118 / Office)",
        badgeColor: "sky",
        text: "Would you be open to scheduling a meeting for us to walk you through the proposal? 😊\n\nWe can meet at your office, or you're welcome to come by ours at Merdeka 118.\n\nIt'll give us a chance to take you through our findings and recommendations properly, and you can decide from there whether our approach makes sense for you 👍",
      },
      {
        id: "q_msg_stage6",
        type: "message",
        connectorLabel: "Before dedicating research hours, align on investment",
        title: "Stage 6: Pre-Qualify Budget (RM8,000 – RM12,000 Range)",
        badgeColor: "amber",
        text: "Great 👍\n\nJust so we're aligned before our team starts preparing the proposal — based on what you've shared so far, we'd likely recommend a fully custom website rather than a template-based build.\n\nThat would typically include the website strategy, UX and sitemap planning, copywriting, custom UI design, mobile optimisation, development and the necessary enquiry/conversion features.\n\nFor a project of this nature, the investment would typically sit around **RM8,000–RM12,000**, depending on the final scope.\n\nWould that be within a range you're comfortable considering if you feel the strategy and direction we present makes sense for the business?",
      },
      {
        id: "q_btn_to_budget",
        type: "button",
        connectorLabel: "Next Step",
        buttonConfig: {
          label: "Next: Go to Budget Branches Flowchart (5.1 – 5.4) →",
          actionType: "navigate_category",
          target: "budget",
          color: "lime",
        },
      },
    ],
  },
  {
    id: "budget",
    label: "3. Budget Branches Flowchart",
    nodes: [
      {
        id: "b_decision_reaction",
        type: "decision",
        decisionQuestion: "💰 Prospect Reaction to RM8k–RM12k Qualification",
        branches: [
          {
            id: "br_b_5_1",
            label: "🟢 5.1 Comfortable",
            badgeColor: "green",
            nodes: [
              {
                id: "b_msg_5_1",
                type: "message",
                title: "5.1 Offer 2 Meeting Slots",
                badgeColor: "green",
                text: "Perfect 👍 In that case, I'll get the team started on the research and proposal.\n\nWould [Tuesday, 2:30pm] or [Wednesday, 11am] work better for you?\n\nWe can come over to your office, or you're welcome to meet us at our office in Merdeka 118 😊",
              },
            ],
          },
          {
            id: "br_b_5_2",
            label: "🟡 5.2 Too Expensive",
            badgeColor: "amber",
            nodes: [
              {
                id: "b_msg_5_2",
                type: "message",
                title: "5.2 Ask Expected Budget Range",
                badgeColor: "amber",
                text: "No worries, totally understand 👍\n\nJust so I have a better sense — what range were you initially looking to work within for the website?",
              },
            ],
          },
          {
            id: "br_b_5_3",
            label: "🔴 5.3 RM2k–RM3k Budget",
            badgeColor: "rose",
            nodes: [
              {
                id: "b_msg_5_3_step1",
                type: "message",
                title: "Step 1: Understand Budget Origin",
                badgeColor: "rose",
                text: "Got it 👍 Just so I understand, how did you arrive at the RM2K–RM3K range?\n\nWas that based on quotations you've received, previous experience, or some research you've done?",
              },
              {
                id: "b_arrow_5_3",
                type: "arrow",
                connectorLabel: "Then position Supercraft difference & re-test",
              },
              {
                id: "b_msg_5_3_step2",
                type: "message",
                title: "Step 2: Position Supercraft & Re-Test Value",
                badgeColor: "rose",
                text: "That makes sense 👍 There are definitely web studios in the market operating around that range.\n\nUsually at that price point, the model is more template and production-driven — where the client provides the content and requirements, and the agency focuses mainly on building the website.\n\nSupercraft works a little differently.\n\nWe approach the website as a commercial and branding tool first. So before we design anything, we work through the strategy, competitor landscape, user journey, website structure and messaging — then custom-design the website around the business.\n\nThat's why we're unlikely to be the RM2K–RM3K option.\n\nIf we can show you an approach that you genuinely feel creates significantly more value for the business, would you be open to considering a higher investment?",
              },
            ],
          },
          {
            id: "br_b_5_4",
            label: "⚪ 5.4 Price-First",
            badgeColor: "sky",
            nodes: [
              {
                id: "b_msg_5_4",
                type: "message",
                title: "5.4 Price-First Ballpark Framing",
                badgeColor: "sky",
                text: "Totally understand wanting to get a sense of cost first 👍\n\nOur custom website projects generally sit between RM8,000–RM12,000 depending on the scope, number of pages and strategy required.\n\nTo give you an accurate recommendation, is this for a new website or a redesign, and roughly what are the main things you need the site to do?",
              },
            ],
          },
          {
            id: "br_b_6_1",
            label: "📑 6.1 Send Proposal Only",
            badgeColor: "gray",
            nodes: [
              {
                id: "b_msg_6_1",
                type: "message",
                title: "6.1 Proposal by WhatsApp Framing",
                badgeColor: "gray",
                text: "We can definitely send the proposal across 👍\n\nBecause we tailor each proposal specifically around your business and digital strategy rather than sending a generic rate card, we usually like to walk you through it for 20–30 minutes so you have the full context behind our recommendations.\n\nWould you be open to a quick Zoom or meeting at your office? Or would you prefer we send it over first?",
              },
            ],
          },
        ],
      },
      {
        id: "b_btn_to_objections",
        type: "button",
        connectorLabel: "If prospect hesitates",
        buttonConfig: {
          label: "Next: Common Objections Flowchart →",
          actionType: "navigate_category",
          target: "objections",
          color: "sky",
        },
      },
      {
        id: "b_btn_to_followups",
        type: "button",
        connectorLabel: "Or if prospect goes silent",
        buttonConfig: {
          label: "Next: Follow-Up Cadence Flowchart →",
          actionType: "navigate_category",
          target: "followups",
          color: "purple",
        },
      },
    ],
  },
  {
    id: "no-answer",
    label: "4. 3-Attempt Protocol Flowchart",
    nodes: [
      {
        id: "na_msg_1",
        type: "message",
        title: "Attempt #1: Missed Call WhatsApp Message",
        badgeColor: "amber",
        text: "Hi [Name] 👋 Just tried giving you a quick call regarding your website enquiry.\n\nNo worries if you're tied up 😊\n\nI'll check back with you a little later. If it's easier, you can also reply to me here anytime 👍",
      },
      {
        id: "na_arrow_wait2h",
        type: "arrow",
        connectorLabel: "Wait ~2 Hours (Same Day)",
      },
      {
        id: "na_msg_2",
        type: "message",
        title: "Attempt #2: Call ~2h Later WhatsApp Message",
        badgeColor: "amber",
        text: "Hey [Name] 👋 Tried catching you again just now.\n\nNo worries — guessing today might be a little hectic 😄\n\nIf a call isn't convenient, we can also go through your website requirements here on WhatsApp. Just let me know what works better for you 👍",
      },
      {
        id: "na_arrow_nextday",
        type: "arrow",
        connectorLabel: "Wait until Next Business Day (Different Time)",
      },
      {
        id: "na_msg_3",
        type: "message",
        title: "Attempt #3: Final Call Unanswered → Switch to WhatsApp",
        badgeColor: "rose",
        text: "Morning [Name] 👋 Just checking back regarding your website enquiry.\n\nI gave you a quick call as well, but no worries if calls aren't convenient.\n\nWe can continue everything here instead 😊\n\nIs this for a new website, or are you looking to redesign an existing one?",
      },
      {
        id: "na_note_stop",
        type: "note",
        text: "🛑 STOP CALLING after Attempt #3 unless the prospect re-engages or asks for a call.",
        noteVariant: "warning",
      },
      {
        id: "na_btn_to_main",
        type: "button",
        connectorLabel: "If Prospect Replies",
        buttonConfig: {
          label: "If Prospect Replies: Go to WhatsApp Main Flow →",
          actionType: "navigate_category",
          target: "qualification",
          color: "sky",
        },
      },
      {
        id: "na_btn_to_fu",
        type: "button",
        connectorLabel: "If Still No Answer",
        buttonConfig: {
          label: "If Still No Response: View Follow-Up Cadence →",
          actionType: "navigate_category",
          target: "followups",
          color: "purple",
        },
      },
    ],
  },
  {
    id: "objections",
    label: "5. Objections Flowchart",
    nodes: [
      {
        id: "obj_decision",
        type: "decision",
        decisionQuestion: "🛡️ Prospect Objection / Hesitation Raised",
        branches: [
          {
            id: "br_obj_think",
            label: "“Let me think about it”",
            badgeColor: "amber",
            nodes: [
              {
                id: "obj_msg_think",
                type: "message",
                title: "Reply: 'Think about it'",
                badgeColor: "amber",
                text: "Totally understand 👍 Take all the time you need.\n\nJust so I know how best to help — is there anything specific about the approach or investment you'd like more clarity on?",
              },
            ],
          },
          {
            id: "br_obj_boss",
            label: "“Need to discuss with boss”",
            badgeColor: "amber",
            nodes: [
              {
                id: "obj_msg_boss",
                type: "message",
                title: "Reply: 'Discuss with boss / partner'",
                badgeColor: "amber",
                text: "Understood! Would it help if we prepared a summary deck of our recommended approach and case studies that you can share with them directly?",
              },
            ],
          },
          {
            id: "br_obj_busy",
            label: "“Sorry, I've been busy”",
            badgeColor: "sky",
            nodes: [
              {
                id: "obj_msg_busy",
                type: "message",
                title: "Reply: 'Sorry, I've been busy'",
                badgeColor: "sky",
                text: "No worries at all! Totally get that things get hectic. When would be a better time or day to check back with you?",
              },
            ],
          },
          {
            id: "br_obj_next_month",
            label: "“Maybe next month”",
            badgeColor: "gray",
            nodes: [
              {
                id: "obj_msg_next_month",
                type: "message",
                title: "Reply: 'Maybe next month / later'",
                badgeColor: "gray",
                text: "Sounds good 👍 I'll set a reminder on my side to check in with you then. In the meantime, if anything comes up, feel free to drop a message anytime.",
              },
            ],
          },
        ],
      },
      {
        id: "obj_btn_to_fu",
        type: "button",
        connectorLabel: "Next Step",
        buttonConfig: {
          label: "Next: Multi-Day Follow-Up Flowchart →",
          actionType: "navigate_category",
          target: "followups",
          color: "purple",
        },
      },
    ],
  },
  {
    id: "followups",
    label: "6. Follow-Up Flowchart",
    nodes: [
      {
        id: "fu_decision_cadence",
        type: "decision",
        decisionQuestion: "Select Follow-Up Cadence",
        branches: [
          {
            id: "br_cadence_a",
            label: "Cadence A: Unresponsive Lead (Never Engaged)",
            badgeColor: "amber",
            nodes: [
              {
                id: "fu_a_day3",
                type: "message",
                title: "📅 Day 3 — Share Relevant Case Study",
                badgeColor: "amber",
                text: "Hi [Name] 👋 Just wanted to share a recent project we completed that had similar requirements to what you enquired about.\n\nThought it might give you some ideas for your website 👇\n[Case Study Link]\n\nHappy to walk you through how we approached it whenever convenient 👍",
              },
              {
                id: "fu_a_arrow_7",
                type: "arrow",
                connectorLabel: "Still no reply by Day 7",
              },
              {
                id: "fu_a_day7",
                type: "message",
                title: "📅 Day 7 — Still Exploring?",
                badgeColor: "amber",
                text: "Hey [Name] 👋 Just checking if you're still exploring options for the website, or if this project has been put on pause for now?\n\nNo pressure either way — just want to make sure I'm not bothering you 👍",
              },
              {
                id: "fu_a_arrow_14",
                type: "arrow",
                connectorLabel: "Still no reply by Day 14",
              },
              {
                id: "fu_a_day14",
                type: "message",
                title: "📅 Day 14 — Close The Loop",
                badgeColor: "gray",
                text: "Hey [Name] 👋 Since I haven't heard back, I'll close off this enquiry on our end for now.\n\nIf you ever decide to revisit the website project down the road, feel free to reach back out anytime. Wishing you all the best with the business! 😊",
              },
            ],
          },
          {
            id: "br_cadence_b",
            label: "Cadence B: Engaged Lead Went Silent",
            badgeColor: "sky",
            nodes: [
              {
                id: "fu_b_day1",
                type: "message",
                title: "📅 Next Day — Quick Check-In",
                badgeColor: "sky",
                text: "Hi [Name] 👋 Just checking back on our chat from yesterday.\n\nDid you have a chance to look over what we discussed regarding the website?",
              },
              {
                id: "fu_b_arrow_3",
                type: "arrow",
                connectorLabel: "No reply by Day 3",
              },
              {
                id: "fu_b_day3",
                type: "message",
                title: "📅 Day 3 — Add Proof",
                badgeColor: "sky",
                text: "Hey [Name] 👋 Thought of your project today — we just published a case study that solved a very similar challenge for a client in your space.\n\nTake a quick look here: [Link]\n\nWould love to hear your thoughts 👍",
              },
              {
                id: "fu_b_arrow_7",
                type: "arrow",
                connectorLabel: "No reply by Day 7",
              },
              {
                id: "fu_b_day7",
                type: "message",
                title: "📅 Day 7 — Decision Check",
                badgeColor: "sky",
                text: "Hey [Name] 👋 Checking in — are you still looking to move forward with the website proposal, or have priorities shifted on your side?\n\nJust let me know either way so I know how to plan our team's capacity 👍",
              },
              {
                id: "fu_b_arrow_14",
                type: "arrow",
                connectorLabel: "No reply by Day 14",
              },
              {
                id: "fu_b_day14",
                type: "message",
                title: "📅 Day 14 — Close Out",
                badgeColor: "gray",
                text: "Hey [Name] 👋 I'll close this out on my side for now so I don't keep chasing you 😄\n\nIf you'd like to revisit the website later, just drop me a message anytime and I'll have all the context from our earlier conversation 👍",
              },
            ],
          },
        ],
      },
    ],
  },
];

// =========================================================================
// TREE MANIPULATION RECURSIVE HELPERS
// =========================================================================
function updateNodeInTree(nodes: FlowNode[], id: string, updater: (node: FlowNode) => FlowNode): FlowNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return updater(node);
    }
    if (node.branches && node.branches.length > 0) {
      return {
        ...node,
        branches: node.branches.map((b) => ({
          ...b,
          nodes: updateNodeInTree(b.nodes, id, updater),
        })),
      };
    }
    return node;
  });
}

function deleteNodeFromTree(nodes: FlowNode[], id: string): FlowNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (node.branches && node.branches.length > 0) {
        return {
          ...node,
          branches: node.branches.map((b) => ({
            ...b,
            nodes: deleteNodeFromTree(b.nodes, id),
          })),
        };
      }
      return node;
    });
}

function moveNodeInTree(nodes: FlowNode[], id: string, direction: "up" | "down"): FlowNode[] {
  const index = nodes.findIndex((n) => n.id === id);
  if (index !== -1) {
    const target = nodes[index];
    const newNodes = [...nodes];
    if (direction === "up" && index > 0) {
      newNodes[index] = newNodes[index - 1];
      newNodes[index - 1] = target;
      return newNodes;
    }
    if (direction === "down" && index < nodes.length - 1) {
      newNodes[index] = newNodes[index + 1];
      newNodes[index + 1] = target;
      return newNodes;
    }
    return nodes;
  }

  return nodes.map((node) => {
    if (node.branches && node.branches.length > 0) {
      return {
        ...node,
        branches: node.branches.map((b) => ({
          ...b,
          nodes: moveNodeInTree(b.nodes, id, direction),
        })),
      };
    }
    return node;
  });
}

function insertNodeInTree(
  nodes: FlowNode[],
  targetBranchId: string | null,
  newNode: FlowNode,
  insertAfterId?: string | null
): FlowNode[] {
  if (!targetBranchId) {
    if (!insertAfterId) {
      return [...nodes, newNode];
    }
    const idx = nodes.findIndex((n) => n.id === insertAfterId);
    if (idx === -1) return [...nodes, newNode];
    const newNodes = [...nodes];
    newNodes.splice(idx + 1, 0, newNode);
    return newNodes;
  }

  return nodes.map((node) => {
    if (node.branches && node.branches.length > 0) {
      return {
        ...node,
        branches: node.branches.map((b) => {
          if (b.id === targetBranchId) {
            if (!insertAfterId) {
              return { ...b, nodes: [...b.nodes, newNode] };
            }
            const idx = b.nodes.findIndex((n) => n.id === insertAfterId);
            if (idx === -1) return { ...b, nodes: [...b.nodes, newNode] };
            const newSubNodes = [...b.nodes];
            newSubNodes.splice(idx + 1, 0, newNode);
            return { ...b, nodes: newSubNodes };
          }
          return {
            ...b,
            nodes: insertNodeInTree(b.nodes, targetBranchId, newNode, insertAfterId),
          };
        }),
      };
    }
    return node;
  });
}

// =========================================================================
// MAIN COMPONENT
// =========================================================================
export default function WhatsAppSopClient({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [categories, setCategories] = useState<FlowchartCategoryConfig[]>(DEFAULT_CATEGORIES);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("first-contact");

  // Lead Variables
  const [prospectName, setProspectName] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectCompany, setProspectCompany] = useState("");

  // Superadmin Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add Item Modal State
  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    targetBranchId: string | null;
    insertAfterId: string | null;
  } | null>(null);

  const [addType, setAddType] = useState<NodeType>("message");
  // Form fields for new item
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newBadgeColor, setNewBadgeColor] = useState("lime");
  const [newConnectorLabel, setNewConnectorLabel] = useState("");
  // Form fields for new button
  const [newBtnLabel, setNewBtnLabel] = useState("");
  const [newBtnActionType, setNewBtnActionType] = useState<"navigate_category" | "open_url">("navigate_category");
  const [newBtnTarget, setNewBtnTarget] = useState("qualification");
  const [newBtnColor, setNewBtnColor] = useState<"lime" | "sky" | "emerald" | "amber" | "purple" | "stone">("lime");
  // Form fields for new decision
  const [newDecisionQuestion, setNewDecisionQuestion] = useState("");
  const [newBranchLabels, setNewBranchLabels] = useState<string[]>(["Option A", "Option B", "Option C"]);
  // Form field for new note
  const [newNoteVariant, setNewNoteVariant] = useState<"warning" | "info" | "success">("warning");

  // Supabase sync tracking
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Load saved categories from backend / localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("supercraft_whatsapp_flowchart_v4");
      if (saved) {
        setCategories(JSON.parse(saved));
      }

      fetch("/api/admin/sales-sop-scripts")
        .then((res) => res.json())
        .then((data) => {
          if (data?.updatedAt) {
            setLastSyncTime(
              new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            );
          }
          if (data?.scripts?.whatsappFlowchartV4 && Array.isArray(data.scripts.whatsappFlowchartV4)) {
            setCategories(data.scripts.whatsappFlowchartV4);
            localStorage.setItem(
              "supercraft_whatsapp_flowchart_v4",
              JSON.stringify(data.scripts.whatsappFlowchartV4)
            );
          }
        })
        .catch(() => {});
    } catch {}
  }, []);

  // Save Flowchart to Supabase
  const handleSaveFlowchart = async (updatedCategories?: FlowchartCategoryConfig[]) => {
    const toSave = updatedCategories || categories;
    setIsSaving(true);
    try {
      localStorage.setItem("supercraft_whatsapp_flowchart_v4", JSON.stringify(toSave));
      const res = await fetch("/api/admin/sales-sop-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: { whatsappFlowchartV4: toSave } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncToast({
          message: `⚠️ Supabase Save Failed: ${data?.error || res.statusText}`,
          type: "error",
        });
        setTimeout(() => setSyncToast(null), 5000);
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setLastSyncTime(timeStr);
        setSyncToast({
          message: "✓ Successfully saved & synced to Supabase database!",
          type: "success",
        });
        setTimeout(() => setSyncToast(null), 3500);
      }
      setIsEditMode(false);
    } catch (err: any) {
      setSyncToast({
        message: `⚠️ Error saving: ${err.message}`,
        type: "error",
      });
      setTimeout(() => setSyncToast(null), 5000);
      setIsEditMode(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm("Reset all flowchart categories back to default factory SOP?")) {
      setCategories(DEFAULT_CATEGORIES);
      localStorage.removeItem("supercraft_whatsapp_flowchart_v4");
      fetch("/api/admin/sales-sop-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: { whatsappFlowchartV4: DEFAULT_CATEGORIES } }),
      }).catch(() => {});
      setIsEditMode(false);
    }
  };

  // Helper to update active category nodes
  const updateActiveCategoryNodes = (newNodes: FlowNode[]) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === activeCategoryId ? { ...cat, nodes: newNodes } : cat))
    );
  };

  // Node Actions
  const handleUpdateNode = (id: string, updates: Partial<FlowNode>) => {
    const activeCat = categories.find((c) => c.id === activeCategoryId);
    if (!activeCat) return;
    const newNodes = updateNodeInTree(activeCat.nodes, id, (n) => ({ ...n, ...updates }));
    updateActiveCategoryNodes(newNodes);
  };

  const handleDeleteNode = (id: string) => {
    if (window.confirm("Delete this flowchart block?")) {
      const activeCat = categories.find((c) => c.id === activeCategoryId);
      if (!activeCat) return;
      const newNodes = deleteNodeFromTree(activeCat.nodes, id);
      updateActiveCategoryNodes(newNodes);
    }
  };

  const handleMoveNode = (id: string, direction: "up" | "down") => {
    const activeCat = categories.find((c) => c.id === activeCategoryId);
    if (!activeCat) return;
    const newNodes = moveNodeInTree(activeCat.nodes, id, direction);
    updateActiveCategoryNodes(newNodes);
  };

  // Decision Branch Actions
  const handleAddBranch = (decisionId: string) => {
    const activeCat = categories.find((c) => c.id === activeCategoryId);
    if (!activeCat) return;

    const branchColors = ["green", "sky", "purple", "amber", "rose", "lime", "gray"];

    const newNodes = updateNodeInTree(activeCat.nodes, decisionId, (node) => {
      const currentBranches = node.branches || [];
      const newLetter = String.fromCharCode(65 + currentBranches.length);
      const newBranch: FlowchartBranch = {
        id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: `Option ${newLetter}`,
        badgeColor: branchColors[currentBranches.length % branchColors.length],
        nodes: [],
      };
      return {
        ...node,
        branches: [...currentBranches, newBranch],
      };
    });

    updateActiveCategoryNodes(newNodes);
  };

  const handleDeleteBranch = (decisionId: string, branchId: string) => {
    if (window.confirm("Delete this entire branch column?")) {
      const activeCat = categories.find((c) => c.id === activeCategoryId);
      if (!activeCat) return;
      const newNodes = updateNodeInTree(activeCat.nodes, decisionId, (node) => ({
        ...node,
        branches: (node.branches || []).filter((b) => b.id !== branchId),
      }));
      updateActiveCategoryNodes(newNodes);
    }
  };

  const handleUpdateBranchLabel = (decisionId: string, branchId: string, newLabel: string) => {
    const activeCat = categories.find((c) => c.id === activeCategoryId);
    if (!activeCat) return;
    const newNodes = updateNodeInTree(activeCat.nodes, decisionId, (node) => ({
      ...node,
      branches: (node.branches || []).map((b) => (b.id === branchId ? { ...b, label: newLabel } : b)),
    }));
    updateActiveCategoryNodes(newNodes);
  };

  // Add Item Submission
  const handleOpenAddModal = (targetBranchId: string | null, insertAfterId: string | null) => {
    setAddModal({ isOpen: true, targetBranchId, insertAfterId });
    setAddType("message");
    setNewTitle("");
    setNewText("");
    setNewBadgeColor("lime");
    setNewConnectorLabel("");
    setNewBtnLabel("");
    setNewBtnActionType("navigate_category");
    setNewBtnTarget("qualification");
    setNewBtnColor("lime");
    setNewDecisionQuestion("");
    setNewBranchLabels(["Option A", "Option B", "Option C"]);
    setNewNoteVariant("warning");
  };

  const handleCreateItem = () => {
    if (!addModal) return;

    const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newNode: FlowNode | null = null;

    if (addType === "message") {
      if (!newTitle.trim() || !newText.trim()) return;
      newNode = {
        id: newId,
        type: "message",
        title: newTitle.trim(),
        text: newText,
        badgeColor: newBadgeColor,
        connectorLabel: newConnectorLabel.trim() || undefined,
      };
    } else if (addType === "decision") {
      if (!newDecisionQuestion.trim()) return;
      const validLabels = newBranchLabels.map((l) => l.trim()).filter(Boolean);
      const labelsToUse = validLabels.length > 0 ? validLabels : ["Option A", "Option B"];
      const branchColors = ["green", "sky", "purple", "amber", "rose", "lime", "gray"];

      newNode = {
        id: newId,
        type: "decision",
        connectorLabel: newConnectorLabel.trim() || undefined,
        decisionQuestion: newDecisionQuestion.trim(),
        branches: labelsToUse.map((label, idx) => ({
          id: `br_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
          label,
          badgeColor: branchColors[idx % branchColors.length],
          nodes: [],
        })),
      };
    } else if (addType === "button") {
      if (!newBtnLabel.trim()) return;
      newNode = {
        id: newId,
        type: "button",
        connectorLabel: newConnectorLabel.trim() || undefined,
        buttonConfig: {
          label: newBtnLabel.trim(),
          actionType: newBtnActionType,
          target: newBtnTarget.trim(),
          color: newBtnColor,
        },
      };
    } else if (addType === "arrow") {
      newNode = {
        id: newId,
        type: "arrow",
        connectorLabel: newConnectorLabel.trim() || "Then Proceed",
      };
    } else if (addType === "note") {
      if (!newText.trim()) return;
      newNode = {
        id: newId,
        type: "note",
        text: newText.trim(),
        noteVariant: newNoteVariant,
        connectorLabel: newConnectorLabel.trim() || undefined,
      };
    }

    if (!newNode) return;

    const activeCat = categories.find((c) => c.id === activeCategoryId);
    if (!activeCat) return;

    const newNodes = insertNodeInTree(
      activeCat.nodes,
      addModal.targetBranchId,
      newNode,
      addModal.insertAfterId
    );

    updateActiveCategoryNodes(newNodes);
    setAddModal(null);
  };

  // Variable Replacement
  const cleanPhone = useMemo(() => prospectPhone.replace(/[^0-9]/g, ""), [prospectPhone]);

  const replaceVariables = (template: string) => {
    const name = prospectName.trim() || "[Name]";
    const company = prospectCompany.trim() || "[Company]";
    const yourName = "[Your Name]";

    return template
      .replace(/\[Name\]/g, name)
      .replace(/\[Your Name\]/g, yourName)
      .replace(/\[x\]/g, yourName)
      .replace(/\[Company\]/g, company)
      .replace(/\[Company Name\]/g, company)
      .replace(/\[OBJECTIVE\]/g, "strengthening brand credibility & conversion");
  };

  const handleCopy = (id: string, rawText: string) => {
    const text = replaceVariables(rawText);
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const getDirectWaUrl = (rawText: string) => {
    if (!cleanPhone) return null;
    const text = replaceVariables(rawText);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  // Connector Arrow Component
  const renderFlowArrow = (label?: string, onEditLabel?: (val: string) => void) => (
    <div className="flex flex-col items-center my-2 select-none group">
      <div className="h-4 w-0.5 bg-white/20" />
      {label && (
        <div className="my-0.5 flex items-center gap-1">
          {isEditMode && onEditLabel ? (
            <input
              type="text"
              value={label}
              onChange={(e) => onEditLabel(e.target.value)}
              className="rounded-full border border-amber-500/40 bg-[#1e221b] px-2.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider outline-none text-center"
            />
          ) : (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-white/70 uppercase tracking-wider shadow-sm">
              {label}
            </span>
          )}
        </div>
      )}
      <div className="h-4 w-0.5 bg-white/20" />
      <ArrowDown className="h-3.5 w-3.5 text-[#a3b840] -mt-1 animate-pulse" />
    </div>
  );

  // Add Item Bar
  const renderAddBar = (targetBranchId: string | null, insertAfterId: string | null) => {
    if (!isSuperadmin || !isEditMode) return null;

    return (
      <div className="my-3 flex items-center justify-center">
        <button
          onClick={() => handleOpenAddModal(targetBranchId, insertAfterId)}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#a3b840]/40 bg-[#a3b840]/10 px-3 py-1.5 text-xs font-bold text-[#c8db5a] hover:bg-[#a3b840]/20 hover:border-[#a3b840] transition shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>+ Add Arrow / Branch / Button / Message</span>
        </button>
      </div>
    );
  };

  // Recursive Node Renderer
  const renderNode = (node: FlowNode, targetBranchId: string | null) => {
    const colorObj = BADGE_COLORS[node.badgeColor || "lime"] || BADGE_COLORS.lime;

    return (
      <div key={node.id} className="w-full flex flex-col items-center">
        {/* Optional Incoming Connector Arrow for non-arrow nodes */}
        {node.type !== "arrow" &&
          node.connectorLabel &&
          renderFlowArrow(node.connectorLabel, (val) =>
            handleUpdateNode(node.id, { connectorLabel: val })
          )}

        {/* ========================================================================= */}
        {/* TYPE 1: MESSAGE NODE                                                      */}
        {/* ========================================================================= */}
        {node.type === "message" && (
          <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#161914] shadow-xl hover:border-[#25D366]/40 transition p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              {isEditMode ? (
                <input
                  type="text"
                  value={node.title || ""}
                  onChange={(e) => handleUpdateNode(node.id, { title: e.target.value })}
                  placeholder="Message Title / Badge Label..."
                  className="flex-1 rounded-lg border border-amber-500/50 bg-[#1e221b] px-2 py-1 text-xs font-bold text-amber-300 outline-none"
                />
              ) : (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold border truncate ${colorObj.class}`}
                >
                  {node.title}
                </span>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Send WA */}
                {!isEditMode && getDirectWaUrl(node.text || "") && (
                  <a
                    href={getDirectWaUrl(node.text || "")!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg bg-[#25D366]/20 px-2.5 py-1 text-xs font-bold text-[#25D366] hover:bg-[#25D366] hover:text-[#111310] transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send WA</span>
                  </a>
                )}

                {/* Copy */}
                {!isEditMode && (
                  <button
                    onClick={() => handleCopy(node.id, node.text || "")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition ${
                      copiedId === node.id
                        ? "bg-[#a3b840] text-[#111310]"
                        : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {copiedId === node.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}

                {/* Edit Controls */}
                {isEditMode && (
                  <div className="flex items-center gap-1">
                    <select
                      value={node.badgeColor || "lime"}
                      onChange={(e) => handleUpdateNode(node.id, { badgeColor: e.target.value })}
                      className="rounded-lg border border-white/10 bg-[#1e221b] px-2 py-1 text-[11px] text-white/80 outline-none"
                    >
                      {Object.entries(BADGE_COLORS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleMoveNode(node.id, "up")}
                      className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveNode(node.id, "down")}
                      className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteNode(node.id)}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/20"
                      title="Delete Node"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bubble Content */}
            {isEditMode ? (
              <div className="space-y-1">
                <textarea
                  value={node.text || ""}
                  onChange={(e) => handleUpdateNode(node.id, { text: e.target.value })}
                  rows={5}
                  placeholder="Type WhatsApp message here... Line breaks supported!"
                  className="w-full rounded-xl border border-amber-500/50 bg-[#1a1c16] p-3 text-xs sm:text-sm text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed font-sans"
                />
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <span>Supports: [Name], [Company], [Your Name], [OBJECTIVE]</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#111310] border border-white/5 p-4 text-xs sm:text-sm text-[#f0f2ea] font-sans leading-relaxed whitespace-pre-wrap break-words">
                {replaceVariables(node.text || "")}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TYPE 2: DECISION / BRANCHING NODE                                         */}
        {/* ========================================================================= */}
        {node.type === "decision" && (
          <div className="w-full flex flex-col items-center my-2">
            {/* Decision Diamond Header */}
            <div className="relative flex items-center justify-center">
              {isEditMode ? (
                <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-amber-500/60 bg-[#211f19] p-2 shadow-lg">
                  <span className="text-xs font-bold text-amber-300">Decision:</span>
                  <input
                    type="text"
                    value={node.decisionQuestion || ""}
                    onChange={(e) => handleUpdateNode(node.id, { decisionQuestion: e.target.value })}
                    className="rounded-lg border border-amber-500/40 bg-[#161914] px-3 py-1 text-xs font-bold text-amber-200 outline-none w-64"
                    placeholder="Decision Question / Condition..."
                  />
                  <button
                    onClick={() => handleAddBranch(node.id)}
                    className="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-bold text-stone-950 hover:bg-amber-300"
                    title="Add another branch option"
                  >
                    + Add Branch
                  </button>
                  <button
                    onClick={() => handleDeleteNode(node.id)}
                    className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
                    title="Delete Decision Fork"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-[#a3b840]/60 bg-[#1e231b] px-6 py-2.5 text-xs font-black uppercase tracking-wider text-[#d4e66c] shadow-lg shadow-black/40 text-center">
                  ◆ {node.decisionQuestion} ◆
                </div>
              )}
            </div>

            {/* Fork Tree Lines */}
            <div className="w-full flex justify-center my-2">
              <div className="w-4/5 h-4 border-t-2 border-x-2 border-white/20 rounded-t-xl" />
            </div>

            {/* Branches Grid */}
            <div className="w-full overflow-x-auto pb-4 pt-1 no-scrollbar">
              <div
                className="grid gap-4 w-full justify-center"
                style={{
                  gridTemplateColumns: `repeat(${
                    (node.branches?.length || 0) + (isEditMode ? 1 : 0)
                  }, minmax(260px, 1fr))`,
                  minWidth: `${((node.branches?.length || 0) + (isEditMode ? 1 : 0)) * 280}px`,
                }}
              >
                {node.branches?.map((branch) => {
                  const brColor = BADGE_COLORS[branch.badgeColor || "lime"] || BADGE_COLORS.lime;
                  return (
                    <div
                      key={branch.id}
                      className="flex flex-col items-center rounded-2xl border border-white/10 bg-[#141612]/70 p-3.5 space-y-3 relative shadow-md"
                    >
                      {/* Branch Label Badge */}
                      <div className="w-full flex items-center justify-between gap-1 border-b border-white/5 pb-2">
                        {isEditMode ? (
                          <input
                            type="text"
                            value={branch.label}
                            onChange={(e) =>
                              handleUpdateBranchLabel(node.id, branch.id, e.target.value)
                            }
                            className="flex-1 rounded-lg border border-white/20 bg-[#1a1d17] px-2 py-1 text-xs font-bold text-white outline-none"
                            placeholder="Branch Label..."
                          />
                        ) : (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold border truncate text-center mx-auto ${brColor.class}`}
                          >
                            {branch.label}
                          </span>
                        )}

                        {isEditMode && (node.branches?.length || 0) > 1 && (
                          <button
                            onClick={() => handleDeleteBranch(node.id, branch.id)}
                            className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
                            title="Delete this Branch"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Nodes inside this branch */}
                      <div className="w-full flex flex-col items-center space-y-2 flex-1">
                        {branch.nodes.map((subNode) => renderNode(subNode, branch.id))}
                      </div>

                      {/* Add Node inside branch */}
                      {renderAddBar(branch.id, null)}
                    </div>
                  );
                })}

                {/* In Edit Mode: Dedicated "+ Add Another Branch" Card at the end of the branches row */}
                {isEditMode && (
                  <button
                    onClick={() => handleAddBranch(node.id)}
                    className="flex flex-col items-center justify-center min-h-[160px] rounded-2xl border-2 border-dashed border-[#a3b840]/40 bg-[#a3b840]/5 p-4 text-[#c8db5a] hover:bg-[#a3b840]/15 hover:border-[#a3b840] transition group shadow-sm"
                  >
                    <div className="h-9 w-9 rounded-full bg-[#a3b840]/20 flex items-center justify-center mb-2 group-hover:scale-110 transition">
                      <Plus className="h-5 w-5 text-[#c8db5a]" />
                    </div>
                    <span className="text-xs font-bold">+ Add Another Branch</span>
                    <span className="text-[10px] text-white/40 mt-0.5">
                      Branch #{(node.branches?.length || 0) + 1}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TYPE 3: ACTION BUTTON NODE                                                */}
        {/* ========================================================================= */}
        {node.type === "button" && (
          <div className="w-full max-w-md flex flex-col items-center my-2">
            {isEditMode ? (
              <div className="w-full rounded-xl border border-amber-500/40 bg-[#1e221b] p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="font-bold text-amber-300">🔘 Action Button Settings</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveNode(node.id, "up")}
                      className="rounded p-1 text-white/50 hover:text-white"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleMoveNode(node.id, "down")}
                      className="rounded p-1 text-white/50 hover:text-white"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteNode(node.id)}
                      className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
                      title="Delete Button"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 mb-0.5">Button Label</label>
                  <input
                    type="text"
                    value={node.buttonConfig?.label || ""}
                    onChange={(e) =>
                      handleUpdateNode(node.id, {
                        buttonConfig: {
                          label: e.target.value,
                          actionType: node.buttonConfig?.actionType || "navigate_category",
                          target: node.buttonConfig?.target || "",
                          color: node.buttonConfig?.color || "lime",
                        },
                      })
                    }
                    className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-white/60 mb-0.5">Action</label>
                    <select
                      value={node.buttonConfig?.actionType || "navigate_category"}
                      onChange={(e) =>
                        handleUpdateNode(node.id, {
                          buttonConfig: {
                            label: node.buttonConfig?.label || "",
                            actionType: e.target.value as any,
                            target: node.buttonConfig?.target || "",
                            color: node.buttonConfig?.color || "lime",
                          },
                        })
                      }
                      className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white"
                    >
                      <option value="navigate_category">Switch Flowchart Category</option>
                      <option value="open_url">Open Page URL (e.g. /sales-sop/call)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-white/60 mb-0.5">Target</label>
                    {node.buttonConfig?.actionType === "navigate_category" ? (
                      <select
                        value={node.buttonConfig?.target || ""}
                        onChange={(e) =>
                          handleUpdateNode(node.id, {
                            buttonConfig: {
                              ...node.buttonConfig!,
                              target: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={node.buttonConfig?.target || ""}
                        onChange={(e) =>
                          handleUpdateNode(node.id, {
                            buttonConfig: {
                              ...node.buttonConfig!,
                              target: e.target.value,
                            },
                          })
                        }
                        placeholder="/sales-sop/call"
                        className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-white/60 mb-0.5">Color</label>
                  <select
                    value={node.buttonConfig?.color || "lime"}
                    onChange={(e) =>
                      handleUpdateNode(node.id, {
                        buttonConfig: {
                          ...node.buttonConfig!,
                          color: e.target.value as any,
                        },
                      })
                    }
                    className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white"
                  >
                    {Object.entries(BUTTON_COLORS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                {node.buttonConfig?.actionType === "navigate_category" ? (
                  <button
                    onClick={() => setActiveCategoryId(node.buttonConfig?.target || "qualification")}
                    className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs sm:text-sm font-bold shadow-lg transition group ${
                      BUTTON_COLORS[node.buttonConfig?.color || "lime"]?.class
                    }`}
                  >
                    <span>{node.buttonConfig?.label}</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </button>
                ) : (
                  <Link
                    href={node.buttonConfig?.target || "/sales-sop"}
                    className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs sm:text-sm font-bold shadow-lg transition group ${
                      BUTTON_COLORS[node.buttonConfig?.color || "lime"]?.class
                    }`}
                  >
                    <span>{node.buttonConfig?.label}</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TYPE 4: STANDALONE ARROW NODE                                             */}
        {/* ========================================================================= */}
        {node.type === "arrow" && (
          <div className="flex flex-col items-center my-2 group">
            {renderFlowArrow(node.connectorLabel, (val) =>
              handleUpdateNode(node.id, { connectorLabel: val })
            )}
            {isEditMode && (
              <button
                onClick={() => handleDeleteNode(node.id)}
                className="text-[10px] text-rose-400 hover:underline -mt-1"
              >
                Delete Arrow
              </button>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TYPE 5: NOTE / RULE BANNER NODE                                           */}
        {/* ========================================================================= */}
        {node.type === "note" && (
          <div className="w-full max-w-lg my-2">
            {isEditMode ? (
              <div className="rounded-xl border border-amber-500/40 bg-[#1e221b] p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="font-bold text-amber-300">Banner / Rule Note</span>
                  <button
                    onClick={() => handleDeleteNode(node.id)}
                    className="text-rose-400 p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <input
                  type="text"
                  value={node.text || ""}
                  onChange={(e) => handleUpdateNode(node.id, { text: e.target.value })}
                  className="w-full rounded-lg border border-white/20 bg-[#161914] px-2 py-1 text-white"
                  placeholder="e.g. 🛑 STOP CALLING after Attempt #3"
                />
              </div>
            ) : (
              <div
                className={`rounded-xl border px-4 py-2 text-center text-xs font-bold ${
                  node.noteVariant === "warning"
                    ? "border-rose-500/30 bg-rose-950/20 text-rose-300"
                    : node.noteVariant === "info"
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-300 shadow-sm"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {node.text}
              </div>
            )}
          </div>
        )}

        {/* Add item right below this node in Edit Mode */}
        {renderAddBar(targetBranchId, node.id)}
      </div>
    );
  };

  const activeCategory = categories.find((c) => c.id === activeCategoryId) || categories[0];

  return (
    <div className="min-h-screen bg-[#111310] text-[#e8eae0]">
      {/* Top Header Command Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#161813]/95 backdrop-blur-md shadow-lg px-4 py-2.5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          {/* Brand + Return to SOP Directory */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/sales-sop"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:border-[#a3b840]/40 hover:text-[#c8db5a] transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All SOPs</span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#25D366]/20 text-[#25D366]">
                <GitBranch className="h-4 w-4" />
              </span>
              <h1 className="text-sm font-bold text-white">
                WhatsApp Reply Flowchart
              </h1>

              {/* Supabase Cloud Sync Status Badge */}
              <div
                className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                title="Connected to Supabase database (system_prompts)"
              >
                <Database className="h-3 w-3 text-emerald-400" />
                <span>Supabase: {lastSyncTime ? `Synced ${lastSyncTime}` : "Connected"}</span>
              </div>
            </div>
          </div>

          {/* Quick Lead Inputs */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="Prospect Name..."
              className="w-28 sm:w-32 rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-[#25D366]"
            />
            <input
              type="text"
              value={prospectPhone}
              onChange={(e) => setProspectPhone(e.target.value)}
              placeholder="Phone (6012...)"
              className="w-28 sm:w-32 rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-[#25D366]"
            />
            <input
              type="text"
              value={prospectCompany}
              onChange={(e) => setProspectCompany(e.target.value)}
              placeholder="Company..."
              className="hidden md:inline w-28 sm:w-32 rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-[#25D366]"
            />
          </div>

          {/* Superadmin Actions: Edit Mode */}
          <div className="flex items-center gap-2">
            {isSuperadmin && (
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isEditMode
                    ? "bg-amber-400 text-stone-950 font-bold"
                    : "border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                <Pencil className="h-3 w-3" />
                <span>{isEditMode ? "Exit Edit" : "Edit Flowchart"}</span>
              </button>
            )}

            {(prospectName || prospectPhone || prospectCompany) && (
              <button
                onClick={() => {
                  setProspectName("");
                  setProspectPhone("");
                  setProspectCompany("");
                }}
                className="rounded p-1 text-white/40 hover:text-white"
                title="Clear lead fields"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Superadmin Edit Mode Banner */}
        {isEditMode && (
          <div className="mx-auto mt-2.5 max-w-6xl rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-300 font-bold">
                🛠️ Flowchart Builder Active:
              </span>
              <span className="text-amber-200/80 hidden sm:inline">
                Add custom Arrows, Branch Forks, Action Buttons, and Messages anywhere in the flowchart.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetDefaults}
                className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:text-white"
              >
                Reset Defaults
              </button>
              <button
                onClick={() => handleSaveFlowchart()}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-1 text-xs font-bold text-stone-950 hover:bg-amber-300 transition"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSaving ? "Saving..." : "Save Flowchart"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Supabase Sync Feedback Toast */}
        {syncToast && (
          <div
            className={`mx-auto mt-2 max-w-xl rounded-xl border px-4 py-2 text-center text-xs font-bold transition shadow-lg flex items-center justify-center gap-2 ${
              syncToast.type === "success"
                ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-300"
                : "border-rose-500/40 bg-rose-950/70 text-rose-300"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>{syncToast.message}</span>
          </div>
        )}
      </header>

      {/* Flowchart Category Tabs */}
      <div className="border-b border-white/10 bg-[#131510] px-4 py-2">
        <div className="mx-auto flex max-w-6xl overflow-x-auto gap-2 no-scrollbar items-center">
          {categories.map((cat) => {
            const active = activeCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? "bg-[#a3b840] text-[#111310] shadow-sm"
                    : "border border-white/10 bg-[#171914] text-white/65 hover:border-white/20 hover:text-white"
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}

          {/* Add Category Button in Edit Mode */}
          {isSuperadmin && isEditMode && (
            <button
              onClick={() => {
                const name = prompt("Enter new Flowchart Category name:");
                if (!name?.trim()) return;
                const newCat: FlowchartCategoryConfig = {
                  id: `cat_${Date.now()}`,
                  label: name.trim(),
                  nodes: [],
                };
                const updated = [...categories, newCat];
                setCategories(updated);
                setActiveCategoryId(newCat.id);
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Plus className="h-3 w-3" />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Flowchart Area */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col items-center">
          {/* Category Top Banner */}
          <div className="w-full flex items-center justify-between mb-6 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#a3b840]">
                {activeCategory?.label}
              </span>
            </div>

            {/* Quick Next Category Jump */}
            {categories.findIndex((c) => c.id === activeCategoryId) < categories.length - 1 && (
              <button
                onClick={() => {
                  const currIdx = categories.findIndex((c) => c.id === activeCategoryId);
                  if (currIdx < categories.length - 1) {
                    setActiveCategoryId(categories[currIdx + 1].id);
                  }
                }}
                className="flex items-center gap-1 text-xs text-white/50 hover:text-white"
              >
                <span>Next Category</span>
                <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
              </button>
            )}
          </div>

          {/* Add Item at top of category */}
          {renderAddBar(null, null)}

          {/* Render All Category Nodes */}
          {activeCategory?.nodes.map((node) => renderNode(node, null))}

          {activeCategory?.nodes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-xs text-white/50 w-full max-w-md my-8">
              No blocks in this flowchart yet. Click below to add your first message, branch, or button!
            </div>
          )}
        </div>
      </main>

      {/* Modal: Add Any Flowchart Item */}
      {addModal && addModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#171914] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-[#a3b840]">
                  <Plus className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-white">Add Flowchart Component</h3>
              </div>
              <button
                onClick={() => setAddModal(null)}
                className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Component Type Selector */}
            <div className="grid grid-cols-5 gap-1.5 p-1 rounded-xl bg-[#111310] border border-white/10 text-[11px] font-bold">
              {[
                { type: "message", label: "💬 Message" },
                { type: "decision", label: "🔀 Branch" },
                { type: "button", label: "🔘 Button" },
                { type: "arrow", label: "⬇️ Arrow" },
                { type: "note", label: "⚠️ Rule" },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => setAddType(item.type as NodeType)}
                  className={`rounded-lg py-1.5 transition text-center ${
                    addType === item.type
                      ? "bg-[#a3b840] text-[#111310] shadow-sm font-black"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 text-xs">
              {/* Optional Incoming Connector Arrow Label */}
              {addType !== "arrow" && (
                <div>
                  <label className="block font-bold text-white/80 mb-1">
                    Incoming Connector Arrow Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={newConnectorLabel}
                    onChange={(e) => setNewConnectorLabel(e.target.value)}
                    placeholder="e.g. Wait 2 Hours / If client replies / Send WhatsApp Immediately"
                    className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                  />
                </div>
              )}

              {/* MESSAGE FORM */}
              {addType === "message" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-white/80 mb-1">
                        Block Title / Badge Label
                      </label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. Stage 1 Discovery / Custom Objection"
                        className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-white/80 mb-1">Badge Color</label>
                      <select
                        value={newBadgeColor}
                        onChange={(e) => setNewBadgeColor(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                      >
                        {Object.entries(BADGE_COLORS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-white/80 mb-1">
                      WhatsApp Message Text
                      <span className="text-white/40 font-normal ml-1">
                        (Supports [Name], [Company], [Your Name], and line breaks)
                      </span>
                    </label>
                    <textarea
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      rows={5}
                      placeholder="Type the message template here..."
                      className="w-full rounded-xl border border-white/15 bg-[#111310] p-3 text-white placeholder-white/30 outline-none focus:border-[#a3b840] whitespace-pre-wrap leading-relaxed font-sans"
                    />
                  </div>
                </>
              )}

              {/* DECISION / BRANCHING FORM */}
              {addType === "decision" && (
                <>
                  <div>
                    <label className="block font-bold text-white/80 mb-1">
                      Decision Question / Condition
                    </label>
                    <input
                      type="text"
                      value={newDecisionQuestion}
                      onChange={(e) => setNewDecisionQuestion(e.target.value)}
                      placeholder="e.g. Call Attempt #2 Result / Client Budget Choice"
                      className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block font-bold text-white/80">
                        Branches ({newBranchLabels.length} Paths)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setNewBranchLabels((prev) => [
                            ...prev,
                            `Option ${String.fromCharCode(65 + prev.length)}`,
                          ])
                        }
                        className="flex items-center gap-1 rounded-lg bg-[#a3b840]/20 px-2.5 py-1 text-[11px] font-bold text-[#c8db5a] hover:bg-[#a3b840] hover:text-[#111310] transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>+ Add Branch</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {newBranchLabels.map((label, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-5 text-center text-xs font-mono text-white/40">
                            #{idx + 1}
                          </span>
                          <input
                            type="text"
                            value={label}
                            onChange={(e) => {
                              const updated = [...newBranchLabels];
                              updated[idx] = e.target.value;
                              setNewBranchLabels(updated);
                            }}
                            placeholder={`Branch #${idx + 1} Label (e.g. Option ${String.fromCharCode(65 + idx)})...`}
                            className="flex-1 rounded-xl border border-white/15 bg-[#111310] px-3 py-1.5 text-xs text-white outline-none focus:border-[#a3b840]"
                          />
                          {newBranchLabels.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewBranchLabels((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="rounded-lg p-1 text-white/40 hover:bg-rose-500/20 hover:text-rose-400 transition"
                              title="Remove branch"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setNewBranchLabels((prev) => [
                          ...prev,
                          `Option ${String.fromCharCode(65 + prev.length)}`,
                        ])
                      }
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#a3b840]/40 bg-[#a3b840]/5 py-2 text-xs font-bold text-[#c8db5a] hover:bg-[#a3b840]/15 hover:border-[#a3b840] transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Add Another Branch Option (Branch #{newBranchLabels.length + 1})</span>
                    </button>
                  </div>
                </>
              )}

              {/* ACTION BUTTON FORM */}
              {addType === "button" && (
                <>
                  <div>
                    <label className="block font-bold text-white/80 mb-1">Button Label</label>
                    <input
                      type="text"
                      value={newBtnLabel}
                      onChange={(e) => setNewBtnLabel(e.target.value)}
                      placeholder="e.g. Next: Go to WhatsApp Main Flow →"
                      className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-white/80 mb-1">Action Type</label>
                      <select
                        value={newBtnActionType}
                        onChange={(e) => setNewBtnActionType(e.target.value as any)}
                        className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                      >
                        <option value="navigate_category">Switch Flowchart Category</option>
                        <option value="open_url">Open Page URL (e.g. /sales-sop/call)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-white/80 mb-1">Target</label>
                      {newBtnActionType === "navigate_category" ? (
                        <select
                          value={newBtnTarget}
                          onChange={(e) => setNewBtnTarget(e.target.value)}
                          className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={newBtnTarget}
                          onChange={(e) => setNewBtnTarget(e.target.value)}
                          placeholder="/sales-sop/call"
                          className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-white/80 mb-1">Button Color</label>
                    <select
                      value={newBtnColor}
                      onChange={(e) => setNewBtnColor(e.target.value as any)}
                      className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                    >
                      {Object.entries(BUTTON_COLORS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* ARROW FORM */}
              {addType === "arrow" && (
                <div>
                  <label className="block font-bold text-white/80 mb-1">
                    Connector Arrow Text
                  </label>
                  <input
                    type="text"
                    value={newConnectorLabel}
                    onChange={(e) => setNewConnectorLabel(e.target.value)}
                    placeholder="e.g. Wait 2 business days / If budget under RM5,000"
                    className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                  />
                </div>
              )}

              {/* NOTE FORM */}
              {addType === "note" && (
                <>
                  <div>
                    <label className="block font-bold text-white/80 mb-1">Note Style</label>
                    <select
                      value={newNoteVariant}
                      onChange={(e) => setNewNoteVariant(e.target.value as any)}
                      className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                    >
                      <option value="warning">🛑 Warning / Stop Rule</option>
                      <option value="info">⚡ Informational Step</option>
                      <option value="success">🟢 Success Benchmark</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-white/80 mb-1">Note Text</label>
                    <input
                      type="text"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="e.g. 🛑 STOP CALLING after Attempt #3"
                      className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-white outline-none focus:border-[#a3b840]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setAddModal(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateItem}
                className="rounded-xl bg-[#a3b840] px-5 py-2 text-xs font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-lg"
              >
                Insert Component
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
