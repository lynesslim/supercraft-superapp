"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Copy,
  Check,
  Building2,
  User,
  Phone,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  FileText,
  BookOpen,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  Headphones,
  HelpCircle,
  Pencil,
  Save,
  RotateCw,
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  GripVertical,
} from "lucide-react";

export type BlockType = "qa" | "statement";

export interface SopBlock {
  id: string;
  type: BlockType;
  title?: string;
  text: string; // The Question or the Statement
  placeholder?: string; // For Q&A answer field
  crmKey?: string; // Maps to built-in CRM field if applicable
}

export interface CrmData {
  // 1. Lead Info
  contactPerson: string;
  phoneNumber: string;
  company: string;
  currentWebsite: string;

  // 2. Understand Business (7 fields)
  industry: string;
  howLongInMarket: string;
  mainProductsServices: string;
  pricePoint: string;
  targetAudience: string;
  companySize: string;
  clientAcquisitionChannel: string;

  // 3. Purpose & Why Now (5 fields)
  reasonLookingNewSite: string;
  currentSiteUnhappy: string;
  whyNowTriggers: string[];
  whyNowCustom: string;
  websiteMainObjective: string[];
  websiteObjectiveCustom: string;
  desiredOutcome6Months: string;

  // 4. Budget
  indicativeBudget: string;
  budgetFlexibility: string;
  budgetNotes: string;

  // 5. Close / Meeting
  proposalPitchDateTime: string;

  // 6. Extra notes & Dynamic custom Q&A answers
  concernsObjections: string;
  extraNotes: string;
  customAnswers: Record<string, { question: string; answer: string }>;
}

const INITIAL_CRM_DATA: CrmData = {
  contactPerson: "",
  phoneNumber: "",
  company: "",
  currentWebsite: "",

  industry: "",
  howLongInMarket: "",
  mainProductsServices: "",
  pricePoint: "",
  targetAudience: "",
  companySize: "",
  clientAcquisitionChannel: "",

  reasonLookingNewSite: "",
  currentSiteUnhappy: "",
  whyNowTriggers: [],
  whyNowCustom: "",
  websiteMainObjective: [],
  websiteObjectiveCustom: "",
  desiredOutcome6Months: "",

  indicativeBudget: "",
  budgetFlexibility: "",
  budgetNotes: "",

  proposalPitchDateTime: "",

  concernsObjections: "",
  extraNotes: "",
  customAnswers: {},
};

export interface BudgetScripts {
  scenarioA_Response: string;
  scenarioB_Lead: string;
  scenarioB_Response: string;
  scenarioC_Origin: string;
  scenarioC_ReTest: string;
  scenarioC_Disqualify: string;
  scenarioD_Ballpark: string;
  scenarioD_TooHigh: string;
}

const DEFAULT_BUDGET_SCRIPTS: BudgetScripts = {
  scenarioA_Response: "“Okay, that sounds workable based on what you've shared.”",
  scenarioB_Lead: "“Okay, that's helpful.”",
  scenarioB_Response:
    "“Based on what you've shared, some of the projects we do may sit closer to the RM8K–RM9K range depending on scope. If we can show you that the additional investment creates significantly more value for the business, would you be open to considering that range?”",
  scenarioC_Origin:
    "“Got it. Just so I understand, how did you arrive at the RM2K–RM3K budget? Was that based on previous quotations, experience, or research?”",
  scenarioC_ReTest:
    "“Obviously we're probably not going to be the RM2K–RM3K option because we build full commercial strategy and copy. But if we can show you our approach creates significantly more value, would you be open to investing more?”",
  scenarioC_Disqualify:
    "“Understood. We might not be the right fit for this particular project budget, but if your requirements change, feel free to reach out anytime.”",
  scenarioD_Ballpark:
    "“Totally understand. Website projects can range from simple templates at a few thousand ringgit up to RM20,000+ for custom strategic systems. Most of the custom strategic projects we deliver typically sit between RM8,000 to RM15,000+. Does that ballpark sound aligned with what you had in mind?”",
  scenarioD_TooHigh:
    "“Got it. What rough range were you expecting? Depending on scope, we might look at phased options, or advise you on the right fit.”",
};

// Default Blocks by Step
const DEFAULT_BLOCKS_BY_STEP: Record<string, SopBlock[]> = {
  step2: [
    {
      id: "s2_stmt1",
      type: "statement",
      title: "Opening Line",
      text: "“Hi [Name], this is [Your Name] from Supercraft. You just responded to my message regarding the website enquiry, so I thought I'd give you a quick call while we're both here.”",
    },
    {
      id: "s2_stmt2",
      type: "statement",
      title: "Time Boundary",
      text: "“Do you have 5–10 minutes? I just want to understand a little more about what you're looking for so I can see how we can best help.”",
    },
  ],

  step3: [
    {
      id: "s3_qa1",
      type: "qa",
      crmKey: "industry",
      title: "1. Industry & Core Business",
      text: "“Maybe you can first tell me a little bit about your business and what industry you guys are in?”",
      placeholder: "[Answer: e.g. Precision Engineering / Luxury Interior / SaaS / F&B]",
    },
    {
      id: "s3_qa2",
      type: "qa",
      crmKey: "howLongInMarket",
      title: "2. How Long in Market",
      text: "“How long has the company been operating in the market?”",
      placeholder: "[Answer: e.g. 8 years (established 2018) / New business (6 months)]",
    },
    {
      id: "s3_qa3",
      type: "qa",
      crmKey: "mainProductsServices",
      title: "3. Main Products / Services",
      text: "“What are the main products or services that you offer, and which ones are the most important commercially?”",
      placeholder: "[Answer: e.g. 1. Industrial CNC tooling (core), 2. Maintenance servicing]",
    },
    {
      id: "s3_qa4",
      type: "qa",
      crmKey: "pricePoint",
      title: "4. Price Point & Market Positioning",
      text: "“Where does your pricing typically sit — are you positioned as economy, mid-market, or high-end premium?”",
      placeholder: "[Answer: e.g. High end / RM50,000 - RM200,000 per engagement]",
    },
    {
      id: "s3_qa5",
      type: "qa",
      crmKey: "targetAudience",
      title: "5. Main Target Audience",
      text: "“Who would you say is the main target audience that the website needs to persuade?”",
      placeholder: "[Answer: e.g. B2B Factory GM & Procurement Directors across Malaysia and Singapore]",
    },
    {
      id: "s3_qa6",
      type: "qa",
      crmKey: "companySize",
      title: "6. Size of Company",
      text: "“Roughly what is the current size of the company in terms of team size or scale?”",
      placeholder: "[Answer: e.g. 25 pax team, 2 production lines, ~RM10M annual revenue]",
    },
    {
      id: "s3_qa7",
      type: "qa",
      crmKey: "clientAcquisitionChannel",
      title: "7. Main Client Acquisition Channel",
      text: "“How do you currently acquire most of your clients or leads?”",
      placeholder: "[Answer: e.g. 80% word of mouth / referrals, looking to build outbound digital channel]",
    },
  ],

  step4: [
    {
      id: "s4_qa1",
      type: "qa",
      crmKey: "reasonLookingNewSite",
      title: "1. Reason for Searching",
      text: "“What made you start looking for a new website?”",
      placeholder: "[Answer: e.g. Expansion into new market, launching a brand-new service line]",
    },
    {
      id: "s4_qa2",
      type: "qa",
      crmKey: "currentSiteUnhappy",
      title: "2. Current Site Pain Points",
      text: "“Is there anything about the current website that you're unhappy with?”",
      placeholder: "[Answer: e.g. Outdated design, doesn't reflect actual company scale, hard to update]",
    },
    {
      id: "s4_qa3",
      type: "qa",
      crmKey: "whyNow",
      title: "3. The Core Buying Trigger (Why Now?)",
      text: "“Why are you looking to do this now?”",
      placeholder: "[Answer notes: e.g. Management set hard deadline before Q4 expo / rebranding now]",
    },
    {
      id: "s4_qa4",
      type: "qa",
      crmKey: "websiteMainObjective",
      title: "4. Website Purpose & Desired Achievement",
      text: "“What's the main thing you want the website to achieve?”",
      placeholder: "[Answer: e.g. Generate high-intent enterprise RFQs + strong corporate authority]",
    },
    {
      id: "s4_qa5",
      type: "qa",
      crmKey: "desiredOutcome6Months",
      title: "5. 6-Month Success Benchmark",
      text: "“If we were having this conversation six months after launching the website, what would make you say the project was successful?”",
      placeholder: "[Answer: e.g. 15-20 qualified RFQs/month, or confident pitching Fortune 500 partners]",
    },
  ],

  step5: [
    {
      id: "s5_stmt1",
      type: "statement",
      title: "1. Affirm Good Fit",
      text: "“Got it, [Name]. Based on everything you've shared about [Company], this sounds like a great fit and definitely something we can help you with.”",
    },
    {
      id: "s5_stmt2",
      type: "statement",
      title: "2. Partner Positioning",
      text: "“We don't really see ourselves as just a website vendor. We want to be your digital strategy partner.”",
    },
    {
      id: "s5_stmt3",
      type: "statement",
      title: "3. Consulting vs Execution",
      text: "“A typical web company just builds the pages you ask for. We actually look at your business, target audience, positioning and commercial goals — we advise on the messaging, customer journey and digital direction, and then execute it into the website. Consulting creates the value; execution is what we charge for.”",
    },
    {
      id: "s5_stmt4",
      type: "statement",
      title: "4. Next Step: Proposal Pitch",
      text: "“Rather than trying to rush through everything on this call, our standard next step is to put together a tailored Proposal Pitch where we walk you through our recommendations, relevant case studies, and proposed roadmap.”",
    },
  ],

  step6: [
    {
      id: "s6_qa1",
      type: "qa",
      crmKey: "indicativeBudget",
      title: "Natural Transition Question",
      text: "“Just so I can recommend something realistic for you in the proposal, have you set aside an approximate budget for the website?”",
      placeholder: "[Select scenario below or enter custom budget details]",
    },
  ],

  step7: [
    {
      id: "s7_stmt1",
      type: "statement",
      title: "Closing Pitch",
      text: "“Based on everything you've shared, what I'd suggest is we arrange a proper 45-minute Proposal Pitch session.”",
    },
    {
      id: "s7_stmt2",
      type: "statement",
      title: "Two-Options Close",
      text: "“Would [Option 1: e.g. Thursday 2:30 PM] or [Option 2: e.g. Friday 10:30 AM] work better for you?”",
    },
  ],
};

const BUYING_TRIGGERS = [
  { id: "rebranding", label: "🔄 Rebranding", text: "Rebranding" },
  { id: "new-offering", label: "🚀 New product / service", text: "New product/service launch" },
  { id: "outdated", label: "👴 Current website outdated", text: "Current website outdated" },
  { id: "expansion", label: "📈 Expansion", text: "Business expansion" },
  { id: "poor-leads", label: "📉 Poor lead generation", text: "Poor lead generation" },
  { id: "campaign", label: "🎪 Upcoming campaign/event", text: "Upcoming campaign/event" },
  { id: "directive", label: "👔 Management directive", text: "Management directive" },
  { id: "competitors", label: "🥊 Competitors improving", text: "Competitors stepping up" },
  { id: "credibility", label: "🛡️ Need stronger credibility", text: "Need stronger credibility" },
];

const WEBSITE_PURPOSES = [
  { id: "lead-gen", label: "🧲 Lead Generation", text: "Lead Generation" },
  { id: "brand", label: "✨ Brand Presence", text: "Brand Presence" },
  { id: "credibility", label: "🏢 Corporate Credibility", text: "Corporate Credibility" },
  { id: "ecommerce", label: "🛒 E-commerce / Sales", text: "E-commerce / Sales" },
  { id: "international", label: "🌏 International Expansion", text: "International Expansion" },
  { id: "recruitment", label: "💼 Recruitment", text: "Recruitment" },
  { id: "education", label: "📣 Product/Service Education", text: "Product/Service Education" },
];

export default function SalesSopClient({ isSuperadmin = false }: { isSuperadmin?: boolean }) {
  // Stepper & Mode
  const [activeStep, setActiveStep] = useState(1);
  const [viewMode, setViewMode] = useState<"focus" | "all">("focus");
  const [isCrmOpen, setIsCrmOpen] = useState(false);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);

  // Superadmin Dynamic Blocks & Budget Scripts State
  const [isEditMode, setIsEditMode] = useState(false);
  const [blocksByStep, setBlocksByStep] = useState<Record<string, SopBlock[]>>(DEFAULT_BLOCKS_BY_STEP);
  const [budgetScripts, setBudgetScripts] = useState<BudgetScripts>(DEFAULT_BUDGET_SCRIPTS);
  const [isSavingBlocks, setIsSavingBlocks] = useState(false);
  const [blocksSavedNotice, setBlocksSavedNotice] = useState(false);

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Drag-and-drop Reordering State
  const [draggedBlock, setDraggedBlock] = useState<{ stepKey: string; index: number } | null>(null);
  const [dragOverBlock, setDragOverBlock] = useState<{ stepKey: string; index: number } | null>(null);

  // Collapsible Explanations (default collapsed)
  const [showTips, setShowTips] = useState<Record<string, boolean>>({});

  const toggleTip = (key: string) => {
    setShowTips((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Budget Scenarios: 'A' (8K+), 'B' (5-6K), 'C' (2-3K), 'D' (Refused to state)
  const [budgetScenario, setBudgetScenario] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [scenarioBDecision, setScenarioBDecision] = useState<"yes" | "no" | null>(null);
  const [scenarioCDecision, setScenarioCDecision] = useState<"yes" | "maybe" | "no" | null>(null);
  const [scenarioDDecision, setScenarioDDecision] = useState<"aligned" | "too-high" | null>(null);

  // CRM Data State
  const [crmData, setCrmData] = useState<CrmData>(INITIAL_CRM_DATA);
  const [copiedState, setCopiedState] = useState<string | null>(null);

  // Load Custom Blocks from Database / LocalStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem("supercraft_sop_bd_name");

      const savedCrm = localStorage.getItem("supercraft_sop_crm_v4");
      if (savedCrm) {
        setCrmData(JSON.parse(savedCrm));
      }

      // Check local storage for blocks & budget scripts
      const savedBlocks = localStorage.getItem("supercraft_sop_custom_blocks_v1");
      if (savedBlocks) {
        setBlocksByStep(JSON.parse(savedBlocks));
      }

      const savedBudgetScripts = localStorage.getItem("supercraft_sop_custom_budget_scripts_v1");
      if (savedBudgetScripts) {
        setBudgetScripts({ ...DEFAULT_BUDGET_SCRIPTS, ...JSON.parse(savedBudgetScripts) });
      }

      // Fetch from Supabase via API
      fetch("/api/admin/sales-sop-scripts")
        .then((res) => res.json())
        .then((data) => {
          if (data?.scripts?.blocksByStep) {
            setBlocksByStep(data.scripts.blocksByStep);
            localStorage.setItem(
              "supercraft_sop_custom_blocks_v1",
              JSON.stringify(data.scripts.blocksByStep),
            );
          }
          if (data?.scripts?.budgetScripts) {
            setBudgetScripts({ ...DEFAULT_BUDGET_SCRIPTS, ...data.scripts.budgetScripts });
            localStorage.setItem(
              "supercraft_sop_custom_budget_scripts_v1",
              JSON.stringify(data.scripts.budgetScripts),
            );
          }
        })
        .catch(() => {});
    } catch {}
  }, []);

  // Save CRM draft to local storage
  useEffect(() => {
    try {
      localStorage.setItem("supercraft_sop_crm_v4", JSON.stringify(crmData));
    } catch {}
  }, [crmData]);

  // Save customized blocks and budget scripts (superadmin)
  const handleSaveBlocks = async () => {
    setIsSavingBlocks(true);
    try {
      localStorage.setItem("supercraft_sop_custom_blocks_v1", JSON.stringify(blocksByStep));
      localStorage.setItem("supercraft_sop_custom_budget_scripts_v1", JSON.stringify(budgetScripts));

      await fetch("/api/admin/sales-sop-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: { blocksByStep, budgetScripts } }),
      });

      setBlocksSavedNotice(true);
      setTimeout(() => setBlocksSavedNotice(false), 3000);
      setIsEditMode(false);
    } catch {
      setIsEditMode(false);
    } finally {
      setIsSavingBlocks(false);
    }
  };

  const handleResetBlocksToDefault = () => {
    if (window.confirm("Reset all blocks and budget responses back to factory default?")) {
      setBlocksByStep(DEFAULT_BLOCKS_BY_STEP);
      setBudgetScripts(DEFAULT_BUDGET_SCRIPTS);
      localStorage.removeItem("supercraft_sop_custom_blocks_v1");
      localStorage.removeItem("supercraft_sop_custom_budget_scripts_v1");
      fetch("/api/admin/sales-sop-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scripts: { blocksByStep: DEFAULT_BLOCKS_BY_STEP, budgetScripts: DEFAULT_BUDGET_SCRIPTS },
        }),
      }).catch(() => {});
    }
  };

  // Add Block Handler
  const handleAddBlock = (stepKey: string, type: BlockType) => {
    const newId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newBlock: SopBlock = {
      id: newId,
      type,
      title: type === "qa" ? "Custom Question" : "Custom Statement",
      text:
        type === "qa"
          ? "“Custom question here...”"
          : "“Custom script statement here...”",
      placeholder: type === "qa" ? "[Record prospect answer here...]" : undefined,
    };

    setBlocksByStep((prev) => ({
      ...prev,
      [stepKey]: [...(prev[stepKey] || []), newBlock],
    }));
  };

  // Delete Block Handler
  const handleDeleteBlock = (stepKey: string, blockId: string) => {
    if (window.confirm("Delete this block?")) {
      setBlocksByStep((prev) => ({
        ...prev,
        [stepKey]: prev[stepKey].filter((b) => b.id !== blockId),
      }));
      // Clean up answer from CRM if deleted
      setCrmData((prev) => {
        if (!prev.customAnswers?.[blockId]) return prev;
        const nextCustom = { ...prev.customAnswers };
        delete nextCustom[blockId];
        return { ...prev, customAnswers: nextCustom };
      });
    }
  };

  // Move Block Handler (Arrow Buttons)
  const handleMoveBlock = (stepKey: string, index: number, direction: "up" | "down") => {
    setBlocksByStep((prev) => {
      const list = [...(prev[stepKey] || [])];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return { ...prev, [stepKey]: list };
    });
  };

  // Drag-and-Drop Handler
  const handleDrop = (targetStepKey: string, targetIndex: number) => {
    if (!draggedBlock) return;
    const { stepKey: sourceStepKey, index: sourceIndex } = draggedBlock;

    if (sourceStepKey === targetStepKey && sourceIndex === targetIndex) {
      setDraggedBlock(null);
      setDragOverBlock(null);
      return;
    }

    setBlocksByStep((prev) => {
      const sourceList = [...(prev[sourceStepKey] || [])];
      const [movedBlock] = sourceList.splice(sourceIndex, 1);
      if (!movedBlock) return prev;

      if (sourceStepKey === targetStepKey) {
        sourceList.splice(targetIndex, 0, movedBlock);
        return { ...prev, [sourceStepKey]: sourceList };
      } else {
        const targetList = [...(prev[targetStepKey] || [])];
        targetList.splice(targetIndex, 0, movedBlock);
        return {
          ...prev,
          [sourceStepKey]: sourceList,
          [targetStepKey]: targetList,
        };
      }
    });

    setDraggedBlock(null);
    setDragOverBlock(null);
  };

  // Update Block Content
  const handleUpdateBlock = (
    stepKey: string,
    blockId: string,
    updates: Partial<SopBlock>,
  ) => {
    setBlocksByStep((prev) => ({
      ...prev,
      [stepKey]: (prev[stepKey] || []).map((b) =>
        b.id === blockId ? { ...b, ...updates } : b,
      ),
    }));

    // Keep custom answer question label updated if question or title was edited
    if (updates.text || updates.title) {
      setCrmData((prev) => {
        if (!prev.customAnswers?.[blockId]) return prev;
        const current = prev.customAnswers[blockId];
        const newQuestionLabel =
          updates.title ||
          (updates.text ? updates.text.replace(/^[“"']|[”"']$/g, "").trim() : current.question);
        return {
          ...prev,
          customAnswers: {
            ...prev.customAnswers,
            [blockId]: { ...current, question: newQuestionLabel },
          },
        };
      });
    }
  };

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedState(id);
    setTimeout(() => {
      setCopiedState(null);
    }, 2000);
  };

  // Dynamic speech renderer
  const renderSpeech = (template: string) => {
    const parts = template.split(/(\[Name\]|\[Your Name\]|\[x\]|\[Company\])/g);
    return parts.map((part, index) => {
      if (part === "[Name]") {
        return (
          <span
            key={index}
            className="rounded bg-[#a3b840]/25 px-1.5 py-0.5 font-bold text-[#c8db5a] border border-[#a3b840]/30 underline decoration-[#a3b840]"
          >
            {crmData.contactPerson.trim() || "[Name]"}
          </span>
        );
      }
      if (part === "[Your Name]" || part === "[x]") {
        return (
          <span
            key={index}
            className="rounded bg-sky-500/20 px-1.5 py-0.5 font-bold text-sky-300 border border-sky-500/30"
          >
            [Your Name]
          </span>
        );
      }
      if (part === "[Company]") {
        return (
          <span
            key={index}
            className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold text-amber-300 border border-amber-500/30"
          >
            {crmData.company.trim() || "[Company]"}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const getCleanSpeechText = (template: string) => {
    return template
      .replace(/\[Name\]/g, crmData.contactPerson.trim() || "[Name]")
      .replace(/\[x\]/g, "[Your Name]")
      .replace(/\[Your Name\]/g, "[Your Name]")
      .replace(/\[Company\]/g, crmData.company.trim() || "[Company]");
  };

  // Helper chips togglers
  const toggleWhyNowTrigger = (triggerText: string) => {
    setCrmData((prev) => {
      const exists = prev.whyNowTriggers.includes(triggerText);
      const updated = exists
        ? prev.whyNowTriggers.filter((t) => t !== triggerText)
        : [...prev.whyNowTriggers, triggerText];
      return { ...prev, whyNowTriggers: updated };
    });
  };

  const togglePurpose = (purposeText: string) => {
    setCrmData((prev) => {
      const exists = prev.websiteMainObjective.includes(purposeText);
      const updated = exists
        ? prev.websiteMainObjective.filter((p) => p !== purposeText)
        : [...prev.websiteMainObjective, purposeText];
      return { ...prev, websiteMainObjective: updated };
    });
  };

  // Count filled CRM fields
  const filledCrmCount = useMemo(() => {
    let count = 0;
    if (crmData.contactPerson) count++;
    if (crmData.phoneNumber) count++;
    if (crmData.company) count++;
    if (crmData.currentWebsite) count++;
    if (crmData.industry) count++;
    if (crmData.howLongInMarket) count++;
    if (crmData.mainProductsServices) count++;
    if (crmData.pricePoint) count++;
    if (crmData.targetAudience) count++;
    if (crmData.companySize) count++;
    if (crmData.clientAcquisitionChannel) count++;
    if (crmData.reasonLookingNewSite) count++;
    if (crmData.currentSiteUnhappy) count++;
    if (crmData.whyNowTriggers.length > 0 || crmData.whyNowCustom) count++;
    if (crmData.websiteMainObjective.length > 0 || crmData.websiteObjectiveCustom) count++;
    if (crmData.desiredOutcome6Months) count++;
    if (crmData.indicativeBudget) count++;
    if (crmData.proposalPitchDateTime) count++;
    // Add custom answers count
    const customCount = Object.values(crmData.customAnswers || {}).filter(
      (a) => a.answer.trim(),
    ).length;
    return count + customCount;
  }, [crmData]);

  // Formatted CRM Report Generator
  const generateCrmReport = () => {
    const triggers = [
      ...crmData.whyNowTriggers,
      ...(crmData.whyNowCustom ? [crmData.whyNowCustom] : []),
    ].join(", ");

    const objectives = [
      ...crmData.websiteMainObjective,
      ...(crmData.websiteObjectiveCustom ? [crmData.websiteObjectiveCustom] : []),
    ].join(", ");

    // Custom Q&A entries
    const customEntries = Object.values(crmData.customAnswers || {})
      .filter((item) => item.answer.trim())
      .map((item) => `* ❓ **${item.question}:** ${item.answer}`)
      .join("\n");

    return `# 📞 SUPERCRAFT CALL NOTES — INBOUND QUALIFICATION

* 👤 **Contact Person / Role:** ${crmData.contactPerson || "N/A"}
* 📱 **Phone Number:** ${crmData.phoneNumber || "N/A"}
* 🏢 **Company:** ${crmData.company || "N/A"}
* 🌐 **Current Website:** ${crmData.currentWebsite || "N/A"}

### 💼 Business Details
* 🏭 **Industry:** ${crmData.industry || "N/A"}
* ⏳ **How Long in Market:** ${crmData.howLongInMarket || "N/A"}
* 📦 **Main Products / Services:** ${crmData.mainProductsServices || "N/A"}
* 🏷️ **Price Point:** ${crmData.pricePoint || "N/A"}
* 👥 **Target Audience:** ${crmData.targetAudience || "N/A"}
* 👥 **Company Size:** ${crmData.companySize || "N/A"}
* 🧲 **Main Client Acquisition Channel:** ${crmData.clientAcquisitionChannel || "N/A"}

### 🎯 Purpose & Why Now
* 🔍 **Reason Looking for New Website:** ${crmData.reasonLookingNewSite || "N/A"}
* 😣 **Unhappy with Current Website:** ${crmData.currentSiteUnhappy || "N/A"}
* ⚡ **Why Now / Buying Trigger:** ${triggers || "N/A"}
* 🌐 **Website Purpose / Objectives:** ${objectives || "N/A"}
* 🏆 **Desired Outcome (6 Months):** ${crmData.desiredOutcome6Months || "N/A"}

${customEntries ? `### 📝 Additional Questions & Answers\n${customEntries}\n` : ""}
### 💰 Budget & Meeting
* 💰 **Indicative Budget:** ${crmData.indicativeBudget || "N/A"}
* ↗️ **Budget Flexibility / Notes:** ${crmData.budgetFlexibility || "N/A"} ${crmData.budgetNotes ? `(${crmData.budgetNotes})` : ""}
* 📅 **Proposal Pitch Date/Time:** ${crmData.proposalPitchDateTime || "N/A"}
* 🚧 **Concerns / Objections:** ${crmData.concernsObjections || "N/A"}
* 💡 **Extra Notes:** ${crmData.extraNotes || "N/A"}

---
*Logged via Supercraft Interactive BD SOP*`;
  };

  const handleResetAll = () => {
    if (
      window.confirm(
        "Are you sure you want to start a new call? All current notes and timer will be reset.",
      )
    ) {
      setCrmData(INITIAL_CRM_DATA);
      setBudgetScenario(null);
      setScenarioBDecision(null);
      setScenarioCDecision(null);
      setScenarioDDecision(null);
      setActiveStep(1);
      resetTimer();
      localStorage.removeItem("supercraft_sop_crm_v4");
    }
  };

  const stepsList = [
    { num: 1, title: "1. Lead Setup", label: "Lead Info" },
    { num: 2, title: "2. Open Call", label: "Open Call" },
    { num: 3, title: "3. Understand Business", label: "Business" },
    { num: 4, title: "4. Purpose & Why Now", label: "Purpose" },
    { num: 5, title: "5. Position Supercraft", label: "Position" },
    { num: 6, title: "6. Budget Qualify", label: "Budget" },
    { num: 7, title: "7. Close Proposal Pitch", label: "Close Pitch" },
    { num: 8, title: "8. CRM Log", label: "CRM Log" },
  ];

  // Helper to render an individual block in a step
  const renderBlock = (stepKey: string, block: SopBlock, index: number) => {
    const isBuiltInCrmKey = !!block.crmKey;

    // Get current answer value
    let answerValue = "";
    if (isBuiltInCrmKey) {
      answerValue = (crmData[block.crmKey as keyof CrmData] as string) || "";
    } else {
      answerValue = crmData.customAnswers?.[block.id]?.answer || "";
    }

    const handleAnswerChange = (val: string) => {
      if (isBuiltInCrmKey) {
        setCrmData((prev) => ({ ...prev, [block.crmKey as string]: val }));
      } else {
        const questionLabel =
          block.title || block.text.replace(/^[“"']|[”"']$/g, "").trim();
        setCrmData((prev) => ({
          ...prev,
          customAnswers: {
            ...prev.customAnswers,
            [block.id]: { question: questionLabel, answer: val },
          },
        }));
      }
    };

    const isDragging =
      draggedBlock?.stepKey === stepKey && draggedBlock?.index === index;
    const isDragOver =
      dragOverBlock?.stepKey === stepKey && dragOverBlock?.index === index;

    return (
      <div
        key={block.id}
        draggable={isEditMode}
        onDragStart={(e) => {
          if (!isEditMode) return;
          setDraggedBlock({ stepKey, index });
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", block.id);
        }}
        onDragOver={(e) => {
          if (!isEditMode) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => {
          if (isEditMode && draggedBlock) {
            setDragOverBlock({ stepKey, index });
          }
        }}
        onDragEnd={() => {
          setDraggedBlock(null);
          setDragOverBlock(null);
        }}
        onDrop={(e) => {
          if (!isEditMode) return;
          e.preventDefault();
          handleDrop(stepKey, index);
        }}
        className={`relative rounded-xl border transition-all duration-150 p-4 space-y-2.5 ${
          isEditMode
            ? isDragging
              ? "border-amber-400 bg-amber-500/10 opacity-40 scale-[0.98] shadow-2xl cursor-grabbing"
              : isDragOver
                ? "border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/40 translate-y-0.5"
                : "border-amber-500/40 bg-[#141611] hover:border-amber-400/70"
            : "border-white/10 bg-[#111310]"
        }`}
      >
        {/* Block Header & Reorder / Delete Controls in Edit Mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEditMode && (
              <div
                className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-white/10 text-amber-400/80 hover:text-amber-300 transition shrink-0"
                title="Drag to reorder block"
              >
                <GripVertical className="h-4 w-4" />
              </div>
            )}

            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                block.type === "qa"
                  ? "bg-[#a3b840]/20 text-[#c8db5a] border border-[#a3b840]/30"
                  : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
              }`}
            >
              {block.type === "qa" ? "❓ Question & Answer" : "🗣️ Statement"}
            </span>

            {isEditMode ? (
              <input
                type="text"
                value={block.title || ""}
                onChange={(e) =>
                  handleUpdateBlock(stepKey, block.id, { title: e.target.value })
                }
                placeholder="Block Title (optional)"
                className="rounded bg-[#1a1c16] px-2 py-0.5 text-xs text-white/80 border border-white/10 outline-none"
              />
            ) : (
              block.title && (
                <span className="text-xs font-semibold text-white/60">
                  {block.title}
                </span>
              )
            )}
          </div>

          {/* Edit Actions: Move Up, Move Down, Delete */}
          {isEditMode ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleMoveBlock(stepKey, index, "up")}
                disabled={index === 0}
                className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20"
                title="Move Up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveBlock(stepKey, index, "down")}
                disabled={index === (blocksByStep[stepKey]?.length || 1) - 1}
                className="rounded p-1 text-white/40 hover:text-white disabled:opacity-20"
                title="Move Down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBlock(stepKey, block.id)}
                className="rounded p-1 text-rose-400 hover:bg-rose-500/20"
                title="Delete Block"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            block.type === "statement" && (
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(getCleanSpeechText(block.text), block.id)
                }
                className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-[#a3b840] hover:text-[#111310] transition"
              >
                {copiedState === block.id ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>Copy</span>
              </button>
            )
          )}
        </div>

        {/* Content View vs Edit Textarea */}
        {isEditMode ? (
          <div className="space-y-2">
            <textarea
              value={block.text}
              onChange={(e) =>
                handleUpdateBlock(stepKey, block.id, { text: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2.5 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
              placeholder={
                block.type === "qa"
                  ? "Type question text..."
                  : "Type statement / script text..."
              }
            />
            {block.type === "qa" && (
              <input
                type="text"
                value={block.placeholder || ""}
                onChange={(e) =>
                  handleUpdateBlock(stepKey, block.id, {
                    placeholder: e.target.value,
                  })
                }
                placeholder="Answer field placeholder..."
                className="w-full rounded-lg border border-white/10 bg-[#1a1c16] px-2.5 py-1 text-xs text-white/70 outline-none"
              />
            )}
          </div>
        ) : (
          <div
            className={
              block.type === "statement"
                ? "text-sm sm:text-base font-medium text-[#f3f4ec] leading-relaxed whitespace-pre-wrap break-words"
                : "text-sm sm:text-base font-semibold text-white whitespace-pre-wrap break-words"
            }
          >
            {renderSpeech(block.text)}
          </div>
        )}

        {/* If Question & Answer Block: Render Answer Field & Built-in quick chips */}
        {block.type === "qa" && (
          <div className="space-y-2 pt-1">
            {/* Special Interactive Chips for specific built-in keys */}
            {block.crmKey === "pricePoint" && (
              <div className="flex flex-wrap items-center gap-1.5">
                {["Low end / Economy", "Medium / Mid-market", "High end / Premium"].map(
                  (tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() =>
                        setCrmData((prev) => ({ ...prev, pricePoint: tier }))
                      }
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                        crmData.pricePoint.startsWith(tier.split(" ")[0])
                          ? "border-[#a3b840] bg-[#a3b840]/20 text-[#c8db5a]"
                          : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                      }`}
                    >
                      {tier}
                    </button>
                  ),
                )}
              </div>
            )}

            {block.crmKey === "whyNow" && (
              <div className="space-y-1.5 border-t border-white/8 pt-2">
                <span className="text-[11px] text-white/50 block">
                  💡 Buying Trigger (Tap to select):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {BUYING_TRIGGERS.map((trigger) => {
                    const isSelected = crmData.whyNowTriggers.includes(trigger.text);
                    return (
                      <button
                        key={trigger.id}
                        type="button"
                        onClick={() => toggleWhyNowTrigger(trigger.text)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? "border-[#a3b840] bg-[#a3b840]/20 text-[#c8db5a]"
                            : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                        }`}
                      >
                        {trigger.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {block.crmKey === "websiteMainObjective" && (
              <div className="space-y-1.5 border-t border-white/8 pt-2">
                <span className="text-[11px] text-white/50 block">
                  Primary Objectives (Tap to select):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WEBSITE_PURPOSES.map((purpose) => {
                    const isSelected = crmData.websiteMainObjective.includes(purpose.text);
                    return (
                      <button
                        key={purpose.id}
                        type="button"
                        onClick={() => togglePurpose(purpose.text)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? "border-[#a3b840] bg-[#a3b840]/20 text-[#c8db5a]"
                            : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                        }`}
                      >
                        {purpose.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Direct Answer Field */}
            <input
              type="text"
              value={answerValue}
              onChange={(e) => handleAnswerChange(e.target.value)}
              placeholder={block.placeholder || "[Record prospect answer here...]"}
              className="w-full rounded-lg border border-white/15 bg-[#171914] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
            />
          </div>
        )}
      </div>
    );
  };

  // Helper to render the "+ Add Block" toolbar in Edit Mode
  const renderAddBlockToolbar = (stepKey: string) => {
    if (!isEditMode) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-950/10 p-3 mt-3">
        <span className="text-xs font-bold text-amber-300">
          + Add block to this page:
        </span>
        <button
          type="button"
          onClick={() => handleAddBlock(stepKey, "qa")}
          className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400 hover:text-stone-950 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Question &amp; Answer</span>
        </button>
        <button
          type="button"
          onClick={() => handleAddBlock(stepKey, "statement")}
          className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-400 hover:text-stone-950 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Statement</span>
        </button>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen bg-[#111310] text-[#e8eae0]">
      {/* Top Floating Command HUD */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#171914]/95 backdrop-blur-md shadow-xl px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Brand & Goal Badge */}
          <div className="flex items-center gap-3">
            <Link
              href="/sales-sop"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:border-[#a3b840]/40 hover:text-[#c8db5a] transition"
              title="Return to Sales SOP Directory"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">All SOPs</span>
            </Link>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#a3b840]/20 border border-[#a3b840]/30 text-[#c8db5a]">
              <Headphones className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                  BD Qualification Call SOP
                </h1>
                <span className="rounded-full bg-[#a3b840]/15 px-2 py-0.5 text-[10px] font-bold text-[#a3b840] border border-[#a3b840]/25">
                  🎯 Goal: Book a Proposal Pitch
                </span>
              </div>
            </div>
          </div>

          {/* Center Call Timer */}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111310] px-3 py-1 shadow-inner">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                isTimerRunning
                  ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400"
                  : timerSeconds > 0
                    ? "bg-amber-400"
                    : "bg-white/20"
              }`}
            />
            <div className="font-mono text-sm font-bold text-white tracking-wider">
              {formatTimer(timerSeconds)}
            </div>
            <div className="flex items-center gap-1 border-l border-white/10 pl-1.5">
              {!isTimerRunning ? (
                <button
                  onClick={() => setIsTimerRunning(true)}
                  className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                  title="Start Call Timer"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => setIsTimerRunning(false)}
                  className="rounded p-1 text-amber-400 hover:bg-amber-400/10"
                  title="Pause Timer"
                >
                  <Pause className="h-3 w-3 fill-current" />
                </button>
              )}
              <button
                onClick={resetTimer}
                className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
                title="Reset Timer"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Controls: Edit Mode (superadmin only) + Golden Rules + CRM Drawer */}
          <div className="flex items-center gap-2">
            {/* Superadmin Edit Mode Toggle */}
            {isSuperadmin && (
              <button
                onClick={() => {
                  if (!isEditMode && !budgetScenario) {
                    setBudgetScenario("B");
                  }
                  setIsEditMode(!isEditMode);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  isEditMode
                    ? "bg-amber-400 text-stone-950 font-bold shadow-md shadow-amber-950"
                    : "border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
                title="Edit and add blocks (Superadmin)"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {isEditMode ? "Exit Edit" : "Edit SOP"}
                </span>
              </button>
            )}

            <button
              onClick={() => setIsCheatSheetOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-xs font-semibold text-white/70 hover:border-[#a3b840]/40 hover:text-[#c8db5a] transition"
            >
              <Lightbulb className="h-3.5 w-3.5 text-[#a3b840]" />
              <span className="hidden sm:inline">Golden Rules</span>
            </button>

            <button
              onClick={() => setIsCrmOpen(!isCrmOpen)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                isCrmOpen
                  ? "bg-[#a3b840] text-[#111310]"
                  : "border border-white/10 bg-[#111310] text-white/80 hover:border-[#a3b840]/30 hover:text-white"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>CRM Notes</span>
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-mono">
                {filledCrmCount}
              </span>
            </button>
          </div>
        </div>

        {/* Superadmin Edit Toolbar Banner (when active) */}
        {isEditMode && (
          <div className="mx-auto mt-2.5 max-w-7xl rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-[#171914] to-amber-950/40 p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Pencil className="h-3.5 w-3.5 animate-pulse" />
              <span>
                Superadmin Edit Mode: Drag handle (⠿) to reorder, tweak wording, or add new blocks
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetBlocksToDefault}
                className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:text-white"
              >
                <RotateCw className="h-3 w-3" />
                <span>Reset Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleSaveBlocks}
                disabled={isSavingBlocks}
                className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1 text-xs font-bold text-stone-950 hover:bg-amber-300 transition"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSavingBlocks ? "Saving..." : "Save Changes"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="p-1 text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Notice for saved blocks */}
        {blocksSavedNotice && (
          <div className="mx-auto mt-2 max-w-7xl rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 font-bold flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            <span>Blocks and script texts successfully saved and synced to database!</span>
          </div>
        )}

        {/* Stepper Navigation */}
        <div className="mx-auto mt-2 max-w-7xl border-t border-white/8 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 max-w-[calc(100vw-70px)] lg:max-w-none">
              {stepsList.map((step) => {
                const isActive = activeStep === step.num;
                return (
                  <button
                    key={step.num}
                    onClick={() => {
                      setActiveStep(step.num);
                      if (viewMode === "all") {
                        const el = document.getElementById(`step-${step.num}`);
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      isActive
                        ? "bg-[#a3b840] text-[#111310] shadow-sm shadow-[#a3b840]/20"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {step.title}
                  </button>
                );
              })}
            </div>

            <div className="hidden md:flex items-center gap-1 text-xs text-white/40">
              <button
                onClick={() => setViewMode("focus")}
                className={`px-2 py-0.5 rounded font-medium ${
                  viewMode === "focus" ? "bg-white/15 text-white" : "hover:text-white/70"
                }`}
              >
                Focus
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`px-2 py-0.5 rounded font-medium ${
                  viewMode === "all" ? "bg-white/15 text-white" : "hover:text-white/70"
                }`}
              >
                All
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main SOP Workflow Column */}
          <div className={isCrmOpen ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12"}>
            <div className="space-y-5">
              {/* STEP 1: LEAD SETUP (PRE-CALL) */}
              {(viewMode === "all" || activeStep === 1) && (
                <section
                  id="step-1"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        1
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          📋 1. Lead Information Setup
                        </h2>
                        <p className="text-xs text-white/50">
                          Fill in prospect name and phone number before initiating the call.
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#a3b840]/10 px-2.5 py-0.5 text-xs font-semibold text-[#c8db5a]">
                      Pre-Call Setup
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-white/70 block mb-1.5">
                          Prospect Name <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-2.5 h-4 w-4 text-[#a3b840]" />
                          <input
                            type="text"
                            value={crmData.contactPerson}
                            onChange={(e) =>
                              setCrmData((prev) => ({ ...prev, contactPerson: e.target.value }))
                            }
                            placeholder="e.g. Marcus Tan"
                            className="w-full rounded-xl border border-white/15 bg-[#111310] pl-9 pr-3 py-2 text-sm text-white font-medium placeholder-white/30 outline-none focus:border-[#a3b840]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-white/70 block mb-1.5">
                          Phone Number <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#a3b840]" />
                          <input
                            type="text"
                            value={crmData.phoneNumber}
                            onChange={(e) =>
                              setCrmData((prev) => ({ ...prev, phoneNumber: e.target.value }))
                            }
                            placeholder="e.g. +60 12-345 6789"
                            className="w-full rounded-xl border border-white/15 bg-[#111310] pl-9 pr-3 py-2 text-sm text-white font-medium placeholder-white/30 outline-none focus:border-[#a3b840]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-white/70 block mb-1.5">
                          Company Name
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                          <input
                            type="text"
                            value={crmData.company}
                            onChange={(e) =>
                              setCrmData((prev) => ({ ...prev, company: e.target.value }))
                            }
                            placeholder="e.g. Apex Industrial Sdn Bhd"
                            className="w-full rounded-xl border border-white/15 bg-[#111310] pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-white/70 block mb-1.5">
                          Current Website (if known)
                        </label>
                        <input
                          type="text"
                          value={crmData.currentWebsite}
                          onChange={(e) =>
                            setCrmData((prev) => ({ ...prev, currentWebsite: e.target.value }))
                          }
                          placeholder="e.g. www.apexindustrial.com.my"
                          className="w-full rounded-xl border border-white/15 bg-[#111310] px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#a3b840]"
                        />
                      </div>
                    </div>

                    {/* Launch / Start Call Action */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#a3b840]/25 bg-[#111310] p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs text-white/70">
                          Ready to initiate call with{" "}
                          <strong className="text-white">
                            {crmData.contactPerson || "[Prospect Name]"}
                          </strong>
                          ?
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          if (!isTimerRunning) setIsTimerRunning(true);
                          setActiveStep(2);
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Start Call &amp; Open Script</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* STEP 2: OPEN THE CALL */}
              {(viewMode === "all" || activeStep === 2) && (
                <section
                  id="step-2"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        2
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          👋 2. Open The Call
                        </h2>
                        <p className="text-xs text-white/50">
                          Hook them, state the reason for calling, and lock in 5-10 minutes.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step2")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step2"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step2"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step2"] && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-300">
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span>Caller Mindset &amp; Tone:</span>
                        </div>
                        <p>
                          • Speak relaxed and high status — you are calling back in response to
                          their enquiry.
                        </p>
                        <p>
                          • Setting the &quot;5–10 minutes&quot; boundary immediately lowers their
                          guard so they won&apos;t worry you&apos;ll trap them on a long pitch.
                        </p>
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 2 */}
                    <div className="space-y-3">
                      {(blocksByStep.step2 || []).map((block, idx) =>
                        renderBlock("step2", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step2")}

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(1)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(3)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 3: Understand Business</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 3: UNDERSTAND THE BUSINESS (QUESTION -> ANSWER BLOCKS) */}
              {(viewMode === "all" || activeStep === 3) && (
                <section
                  id="step-3"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        3
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          🔍 3. Understand The Business
                        </h2>
                        <p className="text-xs text-white/50">
                          Ask each question naturally and record the answers directly below.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step3")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step3"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step3"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step3"] && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                        ⚠️ <strong>Rule:</strong> Keep this natural and conversational. Listen
                        carefully, ask follow-up questions where relevant, and capture the key facts.
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 3 */}
                    <div className="space-y-3">
                      {(blocksByStep.step3 || []).map((block, idx) =>
                        renderBlock("step3", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step3")}

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(2)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(4)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 4: Purpose &amp; Why Now</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 4: PURPOSE & WHY NOW (QUESTION -> ANSWER BLOCKS) */}
              {(viewMode === "all" || activeStep === 4) && (
                <section
                  id="step-4"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        4
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          🎯 4. Understand Purpose &amp; Why Now
                        </h2>
                        <p className="text-xs text-white/50">
                          Diagnose dissatisfaction, buying catalyst, and 6-month definition of
                          success.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step4")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step4"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step4"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step4"] && (
                      <div className="rounded-xl border border-[#a3b840]/20 bg-[#1b2311] p-3 text-xs text-white/80 space-y-1">
                        <div className="flex items-center gap-1 text-[#c8db5a] font-bold">
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span>Uncovering The Real Buying Trigger:</span>
                        </div>
                        <p>
                          Websites aren&apos;t replaced randomly. Focus on &quot;Why now?&quot; — this
                          pinpoints their urgency (rebrand, new campaign, expansion, poor leads).
                        </p>
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 4 */}
                    <div className="space-y-3">
                      {(blocksByStep.step4 || []).map((block, idx) =>
                        renderBlock("step4", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step4")}

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(3)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(5)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 5: Position Supercraft</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 5: POSITION SUPERCRAFT & INTRODUCE PROPOSAL PITCH */}
              {(viewMode === "all" || activeStep === 5) && (
                <section
                  id="step-5"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        5
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          💎 5. Affirm Fit, Position Supercraft &amp; Next Step
                        </h2>
                        <p className="text-xs text-white/50">
                          Confirm good fit, differentiate from typical web vendors, and introduce
                          the Proposal Pitch.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step5")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step5"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step5"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step5"] && (
                      <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-xs text-sky-200 space-y-1">
                        <div className="flex items-center gap-1 font-bold text-sky-300">
                          <Lightbulb className="h-3.5 w-3.5" />
                          <span>Core Strategy:</span>
                        </div>
                        <p>
                          We position ourselves as a digital strategy partner BEFORE discussing
                          budget. This anchors high value so they view us as commercial consultants
                          who execute, not commodity coders.
                        </p>
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 5 */}
                    <div className="space-y-3">
                      {(blocksByStep.step5 || []).map((block, idx) =>
                        renderBlock("step5", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step5")}

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(4)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(6)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 6: Qualify Budget</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 6: QUALIFY THE BUDGET (INCLUDING REFUSED TO SAY SCENARIO) */}
              {(viewMode === "all" || activeStep === 6) && (
                <section
                  id="step-6"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        6
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          💰 6. Qualify The Budget
                        </h2>
                        <p className="text-xs text-white/50">
                          Ask before scheduling to ensure scope &amp; expectations match before
                          preparing proposal.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step6")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step6"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step6"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step6"] && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                        💡 <strong>Key Rule:</strong> Never argue price or say &quot;we are too
                        expensive&quot;. If budget is low or undisclosed, diagnose origin, anchor
                        value, and test alignment.
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 6 */}
                    <div className="space-y-3">
                      {(blocksByStep.step6 || []).map((block, idx) =>
                        renderBlock("step6", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step6")}

                    {/* 4 Budget Scenarios Selector */}
                    <div className="pt-2">
                      <p className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                        Select Prospect&apos;s Budget Scenario:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Scenario A */}
                        <button
                          onClick={() => {
                            setBudgetScenario("A");
                            setCrmData((prev) => ({
                              ...prev,
                              indicativeBudget: "RM8,000+",
                              budgetFlexibility: "Standard Fit (RM8K+)",
                            }));
                          }}
                          className={`rounded-xl border p-3.5 text-left transition ${
                            budgetScenario === "A"
                              ? "border-emerald-400 bg-emerald-500/15 shadow-md"
                              : "border-white/10 bg-[#111310] hover:border-emerald-500/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-400">🟢 SCENARIO A</span>
                            <span className="text-[10px] rounded bg-emerald-500/20 px-1 text-emerald-300">
                              Good Fit
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-bold text-white">RM8,000+</div>
                          <p className="mt-1 text-[11px] text-white/50">Proceed to meeting</p>
                        </button>

                        {/* Scenario B */}
                        <button
                          onClick={() => {
                            setBudgetScenario("B");
                            setCrmData((prev) => ({
                              ...prev,
                              indicativeBudget: "RM5,000 - RM6,000",
                              budgetFlexibility: "Testing Flexibility",
                            }));
                          }}
                          className={`rounded-xl border p-3.5 text-left transition ${
                            budgetScenario === "B"
                              ? "border-amber-400 bg-amber-500/15 shadow-md"
                              : "border-white/10 bg-[#111310] hover:border-amber-500/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-400">🟡 SCENARIO B</span>
                            <span className="text-[10px] rounded bg-amber-500/20 px-1 text-amber-300">
                              Test Range
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-bold text-white">
                            RM5,000 – RM6,000
                          </div>
                          <p className="mt-1 text-[11px] text-white/50">Test value flexibility</p>
                        </button>

                        {/* Scenario C */}
                        <button
                          onClick={() => {
                            setBudgetScenario("C");
                            setCrmData((prev) => ({
                              ...prev,
                              indicativeBudget: "RM2,000 - RM3,000",
                              budgetFlexibility: "Low Budget / Needs Education",
                            }));
                          }}
                          className={`rounded-xl border p-3.5 text-left transition ${
                            budgetScenario === "C"
                              ? "border-rose-400 bg-rose-500/15 shadow-md"
                              : "border-white/10 bg-[#111310] hover:border-rose-500/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-400">🔴 SCENARIO C</span>
                            <span className="text-[10px] rounded bg-rose-500/20 px-1 text-rose-300">
                              Low Budget
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-bold text-white">
                            RM2,000 – RM3,000
                          </div>
                          <p className="mt-1 text-[11px] text-white/50">Educate difference</p>
                        </button>

                        {/* Scenario D */}
                        <button
                          onClick={() => {
                            setBudgetScenario("D");
                            setCrmData((prev) => ({
                              ...prev,
                              indicativeBudget: "Undisclosed / Refused",
                              budgetFlexibility: "Testing Ballpark Alignment",
                            }));
                          }}
                          className={`rounded-xl border p-3.5 text-left transition ${
                            budgetScenario === "D"
                              ? "border-sky-400 bg-sky-500/15 shadow-md"
                              : "border-white/10 bg-[#111310] hover:border-sky-500/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-400">⚪ SCENARIO D</span>
                            <span className="text-[10px] rounded bg-sky-500/20 px-1 text-sky-300">
                              Refused
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-bold text-white">
                            Won&apos;t Disclose
                          </div>
                          <p className="mt-1 text-[11px] text-white/50">
                            &quot;You quote me first&quot;
                          </p>
                        </button>
                      </div>
                    </div>

                    {isEditMode && !budgetScenario && (
                      <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-950/20 p-3.5 text-center text-xs text-amber-300 font-semibold">
                        👆 Click on any of the 4 budget scenario cards above (Scenario A, B, C, or D) to customize its response script!
                      </div>
                    )}

                    {/* SCENARIO A BRANCH */}
                    {budgetScenario === "A" && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-emerald-300 font-bold text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>🟢 SCENARIO A: RM8,000+ Response Script</span>
                          </div>
                          {isEditMode && (
                            <span className="text-[10px] rounded bg-amber-400 text-stone-950 font-bold px-1.5 py-0.5">
                              Editable
                            </span>
                          )}
                        </div>

                        {isEditMode ? (
                          <div className="space-y-1">
                            <span className="text-[11px] text-amber-300 font-semibold block">
                              Response Script (supports line breaks):
                            </span>
                            <textarea
                              value={budgetScripts.scenarioA_Response}
                              onChange={(e) =>
                                setBudgetScripts((prev) => ({
                                  ...prev,
                                  scenarioA_Response: e.target.value,
                                }))
                              }
                              rows={2}
                              className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2.5 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-white font-medium whitespace-pre-wrap break-words">
                            {renderSpeech(budgetScripts.scenarioA_Response)}
                          </p>
                        )}

                        <div className="pt-1 flex justify-end">
                          <button
                            onClick={() => setActiveStep(7)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-1.5 text-xs font-bold text-[#111310] hover:bg-emerald-300 transition"
                          >
                            <span>Proceed to Step 7: Book Proposal Pitch</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* SCENARIO B BRANCH */}
                    {budgetScenario === "B" && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                        <div className="flex items-center justify-between text-amber-300 font-bold text-xs">
                          <span>🟡 SCENARIO B: Test Flexibility Response Script</span>
                          {isEditMode && (
                            <span className="text-[10px] rounded bg-amber-400 text-stone-950 font-bold px-1.5 py-0.5">
                              Editable
                            </span>
                          )}
                        </div>

                        {isEditMode ? (
                          <div className="space-y-2">
                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                Acknowledgment line:
                              </span>
                              <input
                                type="text"
                                value={budgetScripts.scenarioB_Lead}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioB_Lead: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                              />
                            </div>
                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                Test Flexibility Speech (supports line breaks):
                              </span>
                              <textarea
                                value={budgetScripts.scenarioB_Response}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioB_Response: e.target.value,
                                  }))
                                }
                                rows={3}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2.5 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-[#111310] p-3 text-xs sm:text-sm text-white space-y-2">
                            <p>{renderSpeech(budgetScripts.scenarioB_Lead)}</p>
                            <div className="text-[#c8db5a] font-bold whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioB_Response)}
                            </div>
                          </div>
                        )}

                        <div className="border-t border-amber-500/20 pt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setScenarioBDecision("yes");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Flexible: Open to RM8k-9k for value",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioBDecision === "yes"
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              ✅ YES / MAYBE
                            </button>
                            <button
                              onClick={() => {
                                setScenarioBDecision("no");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Strict ceiling at RM6K",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioBDecision === "no"
                                  ? "border-rose-400 bg-rose-500/20 text-rose-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              ❌ NO (Hard ceiling)
                            </button>
                          </div>

                          {scenarioBDecision === "yes" && (
                            <button
                              onClick={() => setActiveStep(7)}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-[#111310]"
                            >
                              <span>Qualified! Go to Meeting</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SCENARIO C BRANCH */}
                    {budgetScenario === "C" && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-3">
                        <div className="flex items-center justify-between text-rose-300 font-bold text-xs">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span>🔴 SCENARIO C: Understand Origin &amp; Re-Test</span>
                          </div>
                          {isEditMode && (
                            <span className="text-[10px] rounded bg-amber-400 text-stone-950 font-bold px-1.5 py-0.5">
                              Editable
                            </span>
                          )}
                        </div>

                        {isEditMode ? (
                          <div className="space-y-2.5">
                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                1. Understand Origin Speech:
                              </span>
                              <textarea
                                value={budgetScripts.scenarioC_Origin}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioC_Origin: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>

                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                2. Re-Test Value Proposition:
                              </span>
                              <textarea
                                value={budgetScripts.scenarioC_ReTest}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioC_ReTest: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>

                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                3. Polite Disqualification (if Hard No):
                              </span>
                              <textarea
                                value={budgetScripts.scenarioC_Disqualify}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioC_Disqualify: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-[#111310] p-3 text-xs text-white space-y-2">
                            <p className="font-semibold text-rose-300 whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioC_Origin)}
                            </p>
                            <p className="text-white/80 italic whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioC_ReTest)}
                            </p>
                          </div>
                        )}

                        <div className="border-t border-rose-500/20 pt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setScenarioCDecision("yes");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Re-tested YES: Open to higher investment",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioCDecision === "yes"
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              🟢 Open to More
                            </button>
                            <button
                              onClick={() => {
                                setScenarioCDecision("no");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Hard No: Disqualified low ceiling",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioCDecision === "no"
                                  ? "border-rose-400 bg-rose-500/20 text-rose-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              🔴 Hard No
                            </button>
                          </div>

                          {scenarioCDecision === "yes" && (
                            <button
                              onClick={() => setActiveStep(7)}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-[#111310]"
                            >
                              <span>Proceed to Meeting</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {!isEditMode && scenarioCDecision === "no" && (
                          <div className="rounded-lg bg-[#111310] p-3 text-xs text-white/70 space-y-1">
                            <span className="font-bold text-rose-400 block">
                              Polite Disqualification:
                            </span>
                            <p className="italic whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioC_Disqualify)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SCENARIO D BRANCH: CLIENT REFUSED TO SAY BUDGET */}
                    {budgetScenario === "D" && (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-3">
                        <div className="flex items-center justify-between text-sky-300 font-bold text-xs">
                          <div className="flex items-center gap-2">
                            <HelpCircle className="h-4 w-4" />
                            <span>
                              ⚪ SCENARIO D: Client Refused Budget / &quot;You Quote Me First&quot;
                            </span>
                          </div>
                          {isEditMode && (
                            <span className="text-[10px] rounded bg-amber-400 text-stone-950 font-bold px-1.5 py-0.5">
                              Editable
                            </span>
                          )}
                        </div>

                        {isEditMode ? (
                          <div className="space-y-2.5">
                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                1. Ballpark Range Response (supports line breaks):
                              </span>
                              <textarea
                                value={budgetScripts.scenarioD_Ballpark}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioD_Ballpark: e.target.value,
                                  }))
                                }
                                rows={3}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2.5 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>

                            <div>
                              <span className="text-[11px] text-amber-300 font-semibold block mb-1">
                                2. Follow-Up If &quot;Too High / Expected Less&quot;:
                              </span>
                              <textarea
                                value={budgetScripts.scenarioD_TooHigh}
                                onChange={(e) =>
                                  setBudgetScripts((prev) => ({
                                    ...prev,
                                    scenarioD_TooHigh: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-amber-500/50 bg-[#1a1c16] p-2.5 text-xs text-white outline-none focus:border-amber-400 whitespace-pre-wrap leading-relaxed"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-[#111310] p-3 text-xs sm:text-sm text-white space-y-2">
                            <div className="text-[#c8db5a] font-bold whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioD_Ballpark)}
                            </div>
                          </div>
                        )}

                        <div className="border-t border-sky-500/20 pt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setScenarioDDecision("aligned");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Ballpark Aligned (RM8k-15k+ range OK)",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioDDecision === "aligned"
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              ✅ Aligned / Ballpark Works
                            </button>
                            <button
                              onClick={() => {
                                setScenarioDDecision("too-high");
                                setCrmData((prev) => ({
                                  ...prev,
                                  budgetFlexibility: "Too High: Expected below RM5k",
                                }));
                              }}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                scenarioDDecision === "too-high"
                                  ? "border-rose-400 bg-rose-500/20 text-rose-300"
                                  : "border-white/10 bg-[#111310] text-white/70"
                              }`}
                            >
                              ❌ Too High / Expected Less
                            </button>
                          </div>

                          {scenarioDDecision === "aligned" && (
                            <button
                              onClick={() => setActiveStep(7)}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-[#111310]"
                            >
                              <span>Qualified! Go to Meeting</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {!isEditMode && scenarioDDecision === "too-high" && (
                          <div className="rounded-lg bg-[#111310] p-3 text-xs text-white/70 space-y-1">
                            <span className="font-bold text-amber-400 block">Follow Up:</span>
                            <p className="italic whitespace-pre-wrap break-words">
                              {renderSpeech(budgetScripts.scenarioD_TooHigh)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(5)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(7)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 7: Close Proposal Pitch</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 7: CLOSE FOR PROPOSAL PITCH MEETING */}
              {(viewMode === "all" || activeStep === 7) && (
                <section
                  id="step-7"
                  className="rounded-2xl border border-[#a3b840]/40 bg-gradient-to-b from-[#181d13] to-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840] text-xs font-black text-[#111310]">
                        7
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          📅 7. Close For The Proposal Pitch Meeting
                        </h2>
                        <p className="text-xs text-white/50">
                          Lock in the 45-minute Proposal Pitch slot immediately.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleTip("step7")}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 hover:text-white"
                    >
                      <Info className="h-3 w-3" />
                      <span>{showTips["step7"] ? "Hide Guidance" : "Show Guidance"}</span>
                      {showTips["step7"] ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  <div className="space-y-4">
                    {showTips["step7"] && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                        📌 <strong>Golden Rule:</strong> Never ask &quot;When are you free?&quot;
                        (creates decision paralysis). Always give 2 specific time options!
                      </div>
                    )}

                    {/* Render Dynamic Blocks for Step 7 */}
                    <div className="space-y-3">
                      {(blocksByStep.step7 || []).map((block, idx) =>
                        renderBlock("step7", block, idx),
                      )}
                    </div>

                    {renderAddBlockToolbar("step7")}

                    {/* Record confirmed slot */}
                    <div className="rounded-xl border border-white/10 bg-[#111310] p-4 space-y-2">
                      <label className="text-xs font-semibold text-white/70 block">
                        Record Booked Proposal Pitch Slot:
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={crmData.proposalPitchDateTime}
                          onChange={(e) =>
                            setCrmData((prev) => ({
                              ...prev,
                              proposalPitchDateTime: e.target.value,
                            }))
                          }
                          placeholder="e.g. Thursday, 3:00 PM via Google Meet"
                          className="flex-1 rounded-lg border border-emerald-500/40 bg-[#171914] px-3 py-2 text-xs font-bold text-emerald-300 outline-none focus:border-emerald-400"
                        />
                        <button
                          onClick={() => {
                            if (!crmData.proposalPitchDateTime) {
                              setCrmData((prev) => ({
                                ...prev,
                                proposalPitchDateTime: "Confirmed",
                              }));
                            }
                            setActiveStep(8);
                          }}
                          className="rounded-lg bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#111310] hover:bg-[#b8ce49] transition shrink-0"
                        >
                          Confirm &amp; View CRM Summary
                        </button>
                      </div>
                    </div>

                    {viewMode === "focus" && (
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setActiveStep(6)}
                          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back</span>
                        </button>
                        <button
                          onClick={() => setActiveStep(8)}
                          className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-4 py-2 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-md"
                        >
                          <span>Step 8: CRM Log</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STEP 8: CRM SUMMARY & EXPORT */}
              {(viewMode === "all" || activeStep === 8) && (
                <section
                  id="step-8"
                  className="rounded-2xl border border-white/10 bg-[#171914] p-5 sm:p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#a3b840]/20 text-xs font-black text-[#c8db5a]">
                        8
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-white sm:text-lg">
                          📝 8. Call Completed — CRM Notes Ready
                        </h2>
                        <p className="text-xs text-white/50">
                          One-click copy to paste directly into your CRM or Slack channel.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleResetAll}
                      className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Start New Call</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          const text = generateCrmReport();
                          copyToClipboard(text, "step8-crm");
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#a3b840] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#111310] hover:bg-[#b8ce49] transition shadow-lg"
                      >
                        {copiedState === "step8-crm" ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-950" />
                            <span>Copied Formatted Report!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            <span>Copy Formatted CRM Report</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setIsCrmOpen(!isCrmOpen)}
                        className="rounded-xl border border-white/10 bg-[#111310] px-4 py-2.5 text-xs font-semibold text-white/80 hover:text-white"
                      >
                        {isCrmOpen ? "Hide Side Drawer" : "Open Live Drawer"}
                      </button>
                    </div>

                    {/* Clean Code Preview */}
                    <div className="rounded-xl border border-white/10 bg-[#111310] p-4">
                      <pre className="max-h-72 overflow-y-auto font-mono text-xs text-white/80 whitespace-pre-wrap leading-relaxed">
                        {generateCrmReport()}
                      </pre>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* CRM Drawer / Side Panel */}
          {isCrmOpen && (
            <aside className="lg:col-span-5 xl:col-span-4 space-y-4">
              <div className="sticky top-24 rounded-2xl border border-white/10 bg-[#171914] p-4 shadow-2xl space-y-3.5 max-h-[calc(100vh-120px)] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#a3b840]" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Live CRM Log
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      const text = generateCrmReport();
                      copyToClipboard(text, "drawer-crm-top");
                    }}
                    className="flex items-center gap-1 rounded bg-[#a3b840] px-2 py-1 text-[11px] font-bold text-[#111310] hover:bg-[#b8ce49]"
                  >
                    {copiedState === "drawer-crm-top" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>Copy</span>
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* Lead Info */}
                  <div>
                    <label className="text-white/50 block mb-0.5">Contact Person:</label>
                    <input
                      type="text"
                      value={crmData.contactPerson}
                      onChange={(e) =>
                        setCrmData((prev) => ({ ...prev, contactPerson: e.target.value }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1.5 text-white outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  <div>
                    <label className="text-white/50 block mb-0.5">Phone Number:</label>
                    <input
                      type="text"
                      value={crmData.phoneNumber}
                      onChange={(e) =>
                        setCrmData((prev) => ({ ...prev, phoneNumber: e.target.value }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1.5 text-white outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  <div>
                    <label className="text-white/50 block mb-0.5">Company:</label>
                    <input
                      type="text"
                      value={crmData.company}
                      onChange={(e) => setCrmData((prev) => ({ ...prev, company: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1.5 text-white outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  <div>
                    <label className="text-white/50 block mb-0.5">Current Website:</label>
                    <input
                      type="text"
                      value={crmData.currentWebsite}
                      onChange={(e) =>
                        setCrmData((prev) => ({ ...prev, currentWebsite: e.target.value }))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1.5 text-white outline-none focus:border-[#a3b840]"
                    />
                  </div>

                  {/* 7 Business Dimensions */}
                  <div className="border-t border-white/8 pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#a3b840] uppercase tracking-wider block">
                      Business Details
                    </span>

                    <div>
                      <label className="text-white/50 block mb-0.5">Industry:</label>
                      <input
                        type="text"
                        value={crmData.industry}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, industry: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">How Long in Market:</label>
                      <input
                        type="text"
                        value={crmData.howLongInMarket}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, howLongInMarket: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Main Products/Services:</label>
                      <input
                        type="text"
                        value={crmData.mainProductsServices}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, mainProductsServices: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Price Point:</label>
                      <input
                        type="text"
                        value={crmData.pricePoint}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, pricePoint: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Target Audience:</label>
                      <input
                        type="text"
                        value={crmData.targetAudience}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, targetAudience: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Company Size:</label>
                      <input
                        type="text"
                        value={crmData.companySize}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, companySize: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Client Acquisition:</label>
                      <input
                        type="text"
                        value={crmData.clientAcquisitionChannel}
                        onChange={(e) =>
                          setCrmData((prev) => ({
                            ...prev,
                            clientAcquisitionChannel: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>
                  </div>

                  {/* Purpose & Triggers */}
                  <div className="border-t border-white/8 pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#a3b840] uppercase tracking-wider block">
                      Purpose &amp; Trigger
                    </span>

                    <div>
                      <label className="text-white/50 block mb-0.5">Reason for Looking:</label>
                      <input
                        type="text"
                        value={crmData.reasonLookingNewSite}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, reasonLookingNewSite: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Current Site Pain:</label>
                      <input
                        type="text"
                        value={crmData.currentSiteUnhappy}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, currentSiteUnhappy: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Buying Trigger:</label>
                      <input
                        type="text"
                        value={
                          crmData.whyNowTriggers.join(", ") +
                          (crmData.whyNowCustom ? ` | ${crmData.whyNowCustom}` : "")
                        }
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, whyNowCustom: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Objectives:</label>
                      <input
                        type="text"
                        value={
                          crmData.websiteMainObjective.join(", ") +
                          (crmData.websiteObjectiveCustom
                            ? ` | ${crmData.websiteObjectiveCustom}`
                            : "")
                        }
                        onChange={(e) =>
                          setCrmData((prev) => ({
                            ...prev,
                            websiteObjectiveCustom: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">6-Month Outcome:</label>
                      <input
                        type="text"
                        value={crmData.desiredOutcome6Months}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, desiredOutcome6Months: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>
                  </div>

                  {/* Custom Questions Answers in CRM */}
                  {Object.keys(crmData.customAnswers || {}).length > 0 && (
                    <div className="border-t border-white/8 pt-2 space-y-2">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                        Custom Q&amp;A Answers
                      </span>
                      {Object.entries(crmData.customAnswers).map(([id, item]) => (
                        <div key={id}>
                          <label className="text-white/50 block mb-0.5 truncate">
                            {item.question}:
                          </label>
                          <input
                            type="text"
                            value={item.answer}
                            onChange={(e) =>
                              setCrmData((prev) => ({
                                ...prev,
                                customAnswers: {
                                  ...prev.customAnswers,
                                  [id]: { question: item.question, answer: e.target.value },
                                },
                              }))
                            }
                            className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Budget & Pitch */}
                  <div className="border-t border-white/8 pt-2 space-y-2">
                    <span className="text-[10px] font-bold text-[#a3b840] uppercase tracking-wider block">
                      Budget &amp; Pitch
                    </span>

                    <div>
                      <label className="text-white/50 block mb-0.5">Indicative Budget:</label>
                      <input
                        type="text"
                        value={
                          crmData.indicativeBudget +
                          (crmData.budgetFlexibility ? ` (${crmData.budgetFlexibility})` : "")
                        }
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, indicativeBudget: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] px-2.5 py-1 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Proposal Pitch Date/Time:</label>
                      <input
                        type="text"
                        value={crmData.proposalPitchDateTime}
                        onChange={(e) =>
                          setCrmData((prev) => ({
                            ...prev,
                            proposalPitchDateTime: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-emerald-500/40 bg-[#111310] px-2.5 py-1 text-emerald-300 font-bold outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="text-white/50 block mb-0.5">Extra Notes:</label>
                      <textarea
                        rows={2}
                        value={crmData.extraNotes}
                        onChange={(e) =>
                          setCrmData((prev) => ({ ...prev, extraNotes: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#111310] p-2 text-white outline-none focus:border-[#a3b840]"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-2">
                  <button
                    onClick={() => {
                      const text = generateCrmReport();
                      copyToClipboard(text, "drawer-crm-bottom");
                    }}
                    className="w-full rounded-xl bg-[#a3b840] py-2 text-xs font-bold text-[#111310] hover:bg-[#b8ce49] transition"
                  >
                    {copiedState === "drawer-crm-bottom" ? "Copied!" : "Copy Full CRM Report"}
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Golden Rules Slide-Over Modal */}
      {isCheatSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#171914] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#a3b840]/20 text-[#c8db5a]">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    🧠 Golden Rules &amp; Supercraft Philosophy
                  </h3>
                  <p className="text-xs text-white/50">Core rules for Supercraft BD calls</p>
                </div>
              </div>
              <button
                onClick={() => setIsCheatSheetOpen(false)}
                className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-white/90 leading-relaxed">
              <div className="rounded-xl border border-white/10 bg-[#111310] p-3.5">
                <div className="font-bold text-[#c8db5a] mb-1">
                  1️⃣ Don&apos;t sell the website on this call.
                </div>
                <p className="text-white/70">
                  <strong>Sell the Proposal Pitch.</strong> You cannot diagnose, consult, and price
                  a comprehensive digital solution in 10 minutes. Your sole win on this call is
                  scheduling the 45-minute Proposal Pitch.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#111310] p-3.5">
                <div className="font-bold text-[#c8db5a] mb-1">
                  2️⃣ Don&apos;t argue about price.
                </div>
                <p className="text-white/70">
                  If budget is low or undisclosed:{" "}
                  <strong>Understand ➔ Educate ➔ Demonstrate Value ➔ Test Ballpark</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#111310] p-3.5">
                <div className="font-bold text-[#c8db5a] mb-1">
                  3️⃣ Don&apos;t become an order taker.
                </div>
                <p className="text-white/70">
                  ❌ Never ask: <em>“What pages do you want?”</em>
                  <br />
                  ✅ Instead ask:{" "}
                  <strong>“What are you trying to achieve commercially?”</strong>
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#111310] p-3.5">
                <div className="font-bold text-[#c8db5a] mb-1">
                  4️⃣ Position Supercraft as a Digital Strategy Partner.
                </div>
                <div className="font-mono text-xs text-[#c8db5a] bg-white/5 p-2 rounded border border-white/5 mt-1">
                  🧠 Strategy ➔ 🎯 Positioning ➔ ✍️ Messaging ➔ 🎨 Design &amp; Experience ➔ 💻
                  Execution
                </div>
              </div>

              <div className="rounded-xl border border-[#a3b840]/30 bg-gradient-to-r from-[#1b2311] to-[#111310] p-3.5 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-[#a3b840] mb-1">
                  ⭐ Supercraft Sales Philosophy
                </div>
                <p className="text-xs sm:text-sm italic text-white mb-1">
                  “We don&apos;t just build what the client asks for. We understand what the business
                  is trying to achieve, advise them on the right digital direction, and then execute
                  it.”
                </p>
                <span className="text-xs font-bold text-[#c8db5a]">
                  Consulting creates the value. Execution is what we charge for.
                </span>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4 flex justify-end">
              <button
                onClick={() => setIsCheatSheetOpen(false)}
                className="rounded-xl bg-[#a3b840] px-4 py-2 text-xs font-bold text-[#111310] hover:bg-[#b8ce49]"
              >
                Back to Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
