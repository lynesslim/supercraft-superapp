"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

type PromptRow = {
  id?: string;
  name: string;
  prompt_text: string;
  updated_at?: string;
};

const fallbackPrompts: PromptRow[] = [
  {
    name: "sitemap_generator",
    prompt_text:
      "You are an expert UX designer and content strategist. Given project context, create a premium website sitemap. Return only the structured sitemap object required by the schema. Use stable kebab-case ids. Use null parentId for top-level pages. Pages should be practical, conversion-aware, and useful for the project strategy.",
  },
  {
    name: "webcopy_generator",
    prompt_text:
      "You are an expert conversion copywriter. Generate rich-text Markdown webcopy for the supplied website page. Use specific, useful content rather than placeholders. Include conversion-focused sections, clear hierarchy, and CTA copy. Return Markdown only.",
  },
  {
    name: "project_strategy_generator",
    prompt_text:
      "You are a senior website strategist. Create concise, useful project strategy notes for a website planning workflow. Return only valid structured data matching the required schema. Create: industry as a concise business category; summary as a 2-3 sentence overview; usp as the strongest positioning or differentiator; strategy_sheet as practical website strategy covering audience, positioning, tone, conversion goals, content priorities, key messaging, trust signals, and conversion opportunities. Write strategy_sheet as plain text or concise bullets, never JSON or code. If supplied URLs are present, use web_search to inspect relevant supplied URLs and web results, treating supplied URLs as client-provided context.",
  },
  {
    name: "project_detail_refiner",
    prompt_text:
      "You are a senior website strategist editing project planning notes. Be specific, concise, and useful. Return only the requested field content with no preamble. For Industry and Staging Base URL, return one concise plain-text value only. For longer fields, preserve useful specifics and avoid labels unless the content itself needs headings. If no feedback is provided, regenerate the target field with a clearer, more useful version.",
  },
  {
    name: "webcopy_refinement",
    prompt_text:
      "You are editing Markdown website copy. Return only the revised Markdown text requested, with no preamble. Mode meanings: regenerate means regenerate the full page copy; regenerate-selection means rewrite only the selected excerpt; paraphrase means preserve meaning with new wording; shorten means keep the core message in fewer words; expand means add useful specific detail; change-tone means apply the feedback tone; bullet-points means convert the selected excerpt into concise Markdown bullet points. For selection tasks, return only the rewritten selected excerpt and do not include surrounding page titles, labels, or context unless they are inside the selected text. If the selected excerpt does not begin with a Markdown heading, do not begin with a heading.",
  },
  {
    name: "word_export_formatter",
    prompt_text:
      "You are formatting website sitemap and web copy content for a client-facing Word document. Preserve page hierarchy, use clear headings, separate sections cleanly, and keep formatting professional and readable.",
  },
];

const samples = {
  sitemap_generator:
    "Client: A boutique architecture studio in Singapore. Audience: affluent homeowners and developers. Goal: reposition the studio as refined, calm, and detail-obsessed. Need a lean website sitemap with conversion paths for consultations.",
  webcopy_generator:
    "Page: Residential Architecture. Context: Boutique Singapore architecture studio serving private homeowners. Goal: create elegant, trust-building webcopy with a clear consultation CTA.",
  project_strategy_generator:
    "Project name: TS Tyre Autocare. Brief: Tyre and car servicing workshop. Goal: improve trust, explain services clearly, and drive WhatsApp enquiries.",
  project_detail_refiner:
    "Field: USP. Current value: Reliable tyre and autocare workshop. Feedback: make it sharper, more premium, and more specific.",
  webcopy_refinement:
    "Selected text: Our tyre services are fast and affordable. Task: make it more premium, specific, and trustworthy while keeping it short.",
  word_export_formatter:
    "Format this copy outline for a client proposal document: Home, About, Services, Tyre Replacement, Wheel Alignment, Contact.",
};

const promptLabels: Record<string, string> = {
  project_strategy_generator: "Project Strategist",
  project_detail_refiner: "Project Detail Refiner",
  sitemap_generator: "Sitemap Architect",
  webcopy_refinement: "Copy Refiner",
  webcopy_generator: "Webcopy Director",
  word_export_formatter: "Word Export Formatter",
};

function mergePrompts(remotePrompts: PromptRow[]) {
  const byName = new Map(fallbackPrompts.map((prompt) => [prompt.name, prompt]));

  for (const prompt of remotePrompts) {
    byName.set(prompt.name, prompt);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function PlaygroundPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>(fallbackPrompts);
  const [activeName, setActiveName] = useState(fallbackPrompts[0].name);
  const [brief, setBrief] = useState(samples.sitemap_generator);
  const [output, setOutput] = useState("");
  const [notice, setNotice] = useState("Loading prompt library...");
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  const activePrompt =
    prompts.find((prompt) => prompt.name === activeName) ?? prompts[0];

  useEffect(() => {
    async function loadPrompts() {
      const response = await fetch("/api/admin/prompts");
      const data = (await response.json()) as { error?: string; prompts?: PromptRow[] };

      if (!response.ok) {
        setNotice(`Using local defaults. ${data.error ?? "Prompt library unavailable."}`);
        return;
      }

      if (data.prompts && data.prompts.length > 0) {
        const merged = mergePrompts(data.prompts);
        setPrompts(merged);
        setActiveName(merged[0].name);
        setBrief(samples[merged[0].name as keyof typeof samples] ?? samples.sitemap_generator);
        setNotice("Prompt library synced from Supabase.");
      } else {
        setNotice("No prompts found yet. Save the defaults to create them.");
      }
    }

    void loadPrompts();
  }, []);

  function updatePromptText(value: string) {
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.name === activeName ? { ...prompt, prompt_text: value } : prompt,
      ),
    );
  }

  function switchPrompt(name: string) {
    setActiveName(name);
    setBrief(samples[name as keyof typeof samples] ?? brief);
    setOutput("");
  }

  function savePrompt() {
    startSaving(async () => {
      const response = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: activePrompt.name,
          prompt_text: activePrompt.prompt_text,
        }),
      });
      const data = (await response.json()) as { error?: string };

      setNotice(
        !response.ok
          ? `Save failed: ${data.error ?? "Unable to save prompt."}`
          : `${promptLabels[activePrompt.name] ?? activePrompt.name} saved to Supabase.`,
      );
    });
  }

  function testPrompt() {
    startTesting(async () => {
      setOutput("");
      setNotice("Running prompt test through /api/generate...");

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: activePrompt.prompt_text, prompt: brief }),
      });
      const data = (await response.json()) as { text?: string; error?: string };

      if (!response.ok) {
        setNotice(data.error ?? "Prompt test failed.");
        return;
      }

      setOutput(data.text ?? "");
      setNotice("Prompt test complete.");
    });
  }

  return (
    <main className="motion-fade-in min-h-screen overflow-hidden bg-[#111310] text-[#e8eae0]">
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="motion-slide-up flex flex-col gap-5 rounded-lg border border-white/8 bg-[#1a1c16] p-5 shadow-2xl shadow-black/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              className="text-xs font-semibold uppercase tracking-[0.24em] text-[#a3b840] transition hover:text-[#c8db5a]"
              href="/"
            >
              Supercraft Studio
            </Link>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[#f3f4ec] sm:text-5xl">
              Prompt playground.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
              Edit the system prompts used across project strategy, sitemap generation, web copy,
              refinement, and export formatting.
            </p>
          </div>
          <div className="rounded-lg border border-[#a3b840]/20 bg-[#111310] p-4 text-sm text-white/55 sm:w-72">
            <p className="font-semibold text-[#f3f4ec]">Prompt library</p>
            <p className="mt-2 leading-6">
              Supabase prompts override built-in defaults. Missing built-ins still appear here and
              can be saved into the database.
            </p>
          </div>
        </header>

        <section className="mt-5 grid flex-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white/55">Prompt Library</p>
              <span className="rounded-md bg-[#a3b840]/15 px-3 py-1 text-xs font-semibold text-[#c8db5a]">
                Supabase
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {prompts.map((prompt) => (
                <button
                  className={`motion-lift rounded-lg border p-4 text-left transition ${
                    prompt.name === activeName
                      ? "border-[#a3b840]/50 bg-[#a3b840] text-[#111310] shadow-xl shadow-black/20"
                      : "border-white/10 bg-[#111310] text-[#e8eae0] hover:border-[#a3b840]/35"
                  }`}
                  key={prompt.name}
                  onClick={() => switchPrompt(prompt.name)}
                  type="button"
                >
                  <p className="text-base font-semibold">
                    {promptLabels[prompt.name] ?? prompt.name}
                  </p>
                  <p
                    className={`mt-2 text-xs font-semibold tracking-[0.18em] uppercase ${
                      prompt.name === activeName ? "text-[#304000]" : "text-white/40"
                    }`}
                  >
                    {prompt.name}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-white/8 bg-[#111310] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                Status
              </p>
              <p className="mt-3 text-sm leading-6 text-white/70">{notice}</p>
            </div>
          </aside>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/25 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#a3b840]">System Prompt</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#f3f4ec]">
                    {promptLabels[activePrompt.name] ?? activePrompt.name}
                  </h2>
                </div>
                <button
                  className="motion-lift rounded-lg bg-[#a3b840] px-5 py-3 text-sm font-bold text-[#111310] shadow-lg shadow-black/15 transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSaving}
                  onClick={savePrompt}
                  type="button"
                >
                  {isSaving ? "Saving..." : "Save Prompt"}
                </button>
              </div>

              <textarea
                className="mt-6 min-h-[460px] w-full resize-y rounded-lg border border-white/10 bg-[#111310] p-5 font-mono text-sm leading-7 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                onChange={(event) => updatePromptText(event.target.value)}
                value={activePrompt.prompt_text}
              />
            </section>

            <section className="rounded-lg border border-white/8 bg-[#1a1c16] p-4 shadow-2xl shadow-black/25 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-[#a3b840]">Test Harness</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#f3f4ec]">
                  Live AI output
                </h2>
              </div>

              <label className="mt-6 block text-sm font-semibold text-white/65" htmlFor="brief">
                Mock brief / page context
              </label>
              <textarea
                className="mt-3 min-h-44 w-full resize-y rounded-lg border border-white/10 bg-[#111310] p-4 text-sm leading-6 text-[#e8eae0] outline-none transition placeholder:text-white/25 focus:border-[#a3b840]/70"
                id="brief"
                onChange={(event) => setBrief(event.target.value)}
                value={brief}
              />

              <button
                className="mt-4 w-full rounded-lg bg-[#a3b840] px-5 py-3 text-sm font-bold text-[#111310] shadow-xl shadow-black/20 transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isTesting || !brief.trim() || !activePrompt.prompt_text.trim()}
                onClick={testPrompt}
                type="button"
              >
                {isTesting ? "Generating..." : "Run Test Generation"}
              </button>

              <div className="mt-5 min-h-[320px] rounded-lg border border-white/10 bg-[#111310] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                  Response
                </p>
                <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/75">
                  {output || "AI output will appear here after a test run."}
                </pre>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
