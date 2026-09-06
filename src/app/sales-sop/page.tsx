import type { Metadata } from "next";
import Link from "next/link";
import {
  PhoneCall,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Sales SOP Hub — Supercraft",
  description:
    "Interactive Standard Operating Procedures and qualification flow assistants for Supercraft Business Development representatives.",
};

const SOP_CARDS = [
  {
    id: "call-sop",
    title: "Inbound Qualification Call SOP",
    subtitle: "Voice-first discovery & 45-minute strategy proposal pitch booking",
    href: "/sales-sop/call",
    badge: "Voice Call SOP",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: PhoneCall,
    iconBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    targetGoal: "🎯 Goal: Close the Proposal Meeting (not the website)",
    description:
      "Interactive 8-step live phone call script. Keeps conversation natural, discovers business reality, tests budget tiers (RM8k+ vs RM5-6k vs RM2-3k), and generates a 1-click formatted CRM log.",
    features: [
      "Live call timer & interactive step tracker",
      "Dynamic Question & Answer paired layout",
      "Interactive budget flexibility & objection matrix",
      "1-Click copyable CRM markdown report",
      "Superadmin drag-and-drop block customizer",
    ],
    ctaText: "Launch Call Assistant",
    accentColor: "hover:border-emerald-500/50",
  },
  {
    id: "whatsapp-sop",
    title: "Inbound WhatsApp Lead Reply SOP",
    subtitle: "WhatsApp-first response, contact attempts, chat qualification & follow-up",
    href: "/sales-sop/whatsapp",
    badge: "WhatsApp SOP",
    badgeColor: "bg-[#a3b840]/20 text-[#c8db5a] border-[#a3b840]/30",
    icon: MessageSquare,
    iconBg: "bg-[#a3b840]/20 text-[#c8db5a] border-[#a3b840]/30",
    targetGoal: "🎯 Core Principle: Call-First, Not Call-Only",
    description:
      "Full interactive decision tree based on the official 10-page Supercraft SOP. Features 3-attempt no-answer flow, 6-stage qualification messaging, budget qualification branches, objection scripts, and multi-day follow-ups.",
    features: [
      "Master Inbound Flow with live decision branching",
      "3-Attempt Call/Text No-Answer sequence with timer rules",
      "6-Stage Qualification (Situation, Objective, Proof, Proposal, Meeting, Budget)",
      "1-Click message copy with live [Name] & [Company] substitution",
      "1-Click Common Objection Switchboard & Multi-Day Follow-Ups",
    ],
    ctaText: "Launch WhatsApp SOP",
    accentColor: "hover:border-[#a3b840]/60",
  },
];

const OPERATING_RULES = [
  {
    rule: "Call-First, Not Call-Only",
    desc: "Prefer a quick live conversation, but never create unnecessary friction. Respect prospect channel preference.",
  },
  {
    rule: "3-Attempt Limit",
    desc: "After three unanswered call attempts, stop calling unless the lead re-engages or requests a call.",
  },
  {
    rule: "No Interrogation on Chat",
    desc: "Ask only 1–2 questions at a time on WhatsApp. Never make the conversation feel like an enquiry form.",
  },
  {
    rule: "Tailored Proof, Not Full Portfolio",
    desc: "Share 1–3 relevant case studies matched to their specific objective rather than dumping the whole portfolio.",
  },
  {
    rule: "Sell Proposal Before Meeting",
    desc: "Highlight the audit, competitor research, and custom strategy before proposing the meeting time.",
  },
  {
    rule: "Qualify RM8k–RM12k Budget Early",
    desc: "Confirm expected investment range before dedicating extensive design and audit preparation hours.",
  },
];

export default function SalesSopHubPage() {
  return (
    <div className="min-h-screen bg-[#111310] text-[#e8eae0] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#171914] via-[#131511] to-[#1c2018] p-6 sm:p-8 shadow-2xl">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#a3b840]/30 bg-[#a3b840]/10 px-3 py-1 text-xs font-bold text-[#c8db5a]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Supercraft Business Development</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Sales SOP Directory
            </h1>
            <p className="text-sm sm:text-base text-white/70 leading-relaxed">
              Interactive Standard Operating Procedures designed to help Supercraft representatives establish rapid contact, uncover commercial objectives, qualify investment tiers, and book high-converting strategy proposal meetings.
            </p>
          </div>

          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-[#a3b840]/5 blur-3xl pointer-events-none" />
        </div>

        {/* SOP Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {SOP_CARDS.map((sop) => {
            const Icon = sop.icon;
            return (
              <div
                key={sop.id}
                className={`group flex flex-col justify-between rounded-2xl border border-white/10 bg-[#141611] p-6 sm:p-7 shadow-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl ${sop.accentColor}`}
              >
                <div className="space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${sop.badgeColor}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {sop.badge}
                    </span>
                    <span className="text-[11px] font-semibold text-white/40 font-mono">
                      {sop.targetGoal}
                    </span>
                  </div>

                  {/* Header Title */}
                  <div className="flex items-start gap-3.5 pt-1">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${sop.iconBg}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-[#c8db5a] transition">
                        {sop.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-white/60">{sop.subtitle}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-white/75 leading-relaxed pt-1">
                    {sop.description}
                  </p>

                  {/* Feature Checklist */}
                  <div className="rounded-xl border border-white/5 bg-[#171914] p-3.5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                      Included Modules:
                    </div>
                    <ul className="space-y-1.5">
                      {sop.features.map((feat, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 text-xs text-white/80"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#a3b840]" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Launch Button */}
                <div className="pt-6">
                  <Link
                    href={sop.href}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#a3b840] px-4 py-3 text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-lg shadow-[#a3b840]/10 group-hover:shadow-[#a3b840]/25"
                  >
                    <span>{sop.ctaText}</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Operating Rules Matrix */}
        <div className="rounded-2xl border border-white/10 bg-[#141611] p-6 sm:p-7 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Core Operating Principles for BD
              </h3>
              <p className="text-xs text-white/50">
                Non-negotiable guidelines across both voice call and WhatsApp outreach
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {OPERATING_RULES.map((item, index) => (
              <div
                key={index}
                className="rounded-xl border border-white/5 bg-[#171914] p-3.5 space-y-1"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <span className="text-[#a3b840] font-mono">{index + 1}.</span>
                  <span>{item.rule}</span>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
