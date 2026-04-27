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
    name: "webcopy_refinement",
    prompt_text:
      "You are editing Markdown website copy. Return only the revised Markdown text requested, with no preamble. Mode meanings: regenerate means regenerate the full page copy; regenerate-selection means rewrite only the selected excerpt; paraphrase means preserve meaning with new wording; shorten means keep the core message in fewer words; expand means add useful specific detail; change-tone means apply the feedback tone; bullet-points means convert the selected excerpt into concise Markdown bullet points. For selection tasks, return only the rewritten selected excerpt and do not include surrounding page titles, labels, or context unless they are inside the selected text. If the selected excerpt does not begin with a Markdown heading, do not begin with a heading.",
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
};

const promptLabels: Record<string, string> = {
  project_strategy_generator: "Project Strategist",
  project_detail_refiner: "Project Detail Refiner",
  sitemap_generator: "Sitemap Architect",
  webcopy_refinement: "Copy Refiner",
  webcopy_generator: "Webcopy Director",
};

const MAX_PLAYGROUND_PDF_BYTES = 60 * 1024 * 1024;
const MAX_PLAYGROUND_TOTAL_PDF_BYTES = 90 * 1024 * 1024;

function mergePrompts(remotePrompts: PromptRow[]) {
  const byName = new Map(fallbackPrompts.map((prompt) => [prompt.name, prompt]));

  for (const prompt of remotePrompts) {
    byName.set(prompt.name, prompt);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function validatePlaygroundPdfSelection(files: File[]) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_PLAYGROUND_TOTAL_PDF_BYTES) {
    return `Total PDF size must be ${Math.floor(MAX_PLAYGROUND_TOTAL_PDF_BYTES / 1024 / 1024)}MB or smaller.`;
  }

  for (const file of files) {
    if (file.size > MAX_PLAYGROUND_PDF_BYTES) {
      return `Each PDF must be ${Math.floor(MAX_PLAYGROUND_PDF_BYTES / 1024 / 1024)}MB or smaller.`;
    }
  }

  return "";
}

export default function PlaygroundPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>(fallbackPrompts);
  const [activeName, setActiveName] = useState(fallbackPrompts[0].name);
  const [brief, setBrief] = useState(samples.sitemap_generator);
  const [output, setOutput] = useState("");
  const [notice, setNotice] = useState("Loading prompt library...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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
    setSelectedFiles([]);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setSelectedFiles((prev) => {
      const nextFiles = [...prev, ...files];
      const validationError = validatePlaygroundPdfSelection(nextFiles);
      if (validationError) {
        setErrorMessage(validationError);
        setNotice("Test failed.");
        return prev;
      }

      return nextFiles;
    });
    event.target.value = "";
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function clearError() {
    setErrorMessage(null);
    setNotice("Ready.");
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
      setErrorMessage(null);
      setNotice(selectedFiles.length > 0 ? "Running with PDF attachments..." : "Running prompt test...");

      const useMultipart = selectedFiles.length > 0;
      let response: Response;
      let data: { text?: string; error?: string };

      if (useMultipart) {
        const validationError = validatePlaygroundPdfSelection(selectedFiles);
        if (validationError) {
          setErrorMessage(validationError);
          setNotice("Test failed.");
          return;
        }

        const formData = new FormData();
        formData.append("system", activePrompt.prompt_text);
        formData.append("prompt", brief);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        response = await fetch("/api/playground/generate", { method: "POST", body: formData });
      } else {
        response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: activePrompt.prompt_text, prompt: brief }),
        });
      }

      try {
        data = await response.json();
      } catch {
        data = { error: "Invalid response from server" };
      }

      if (!response.ok || data.error) {
        const errorMsg = data.error ?? `Request failed with status ${response.status}`;
        setErrorMessage(errorMsg);
        setNotice("Test failed.");
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

              <div className="mt-4">
                <label className="block text-sm font-semibold text-white/65">
                  PDF attachments (optional)
                </label>
                <input
                  className="mt-2 block w-full text-sm text-white/50 file:mr-4 file:rounded-lg file:border file:border-[#a3b840]/30 file:bg-[#1a1c16] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#a3b840] file:transition hover:file:bg-[#222420] file:cursor-pointer"
                  accept=".pdf,application/pdf"
                  id="pdf-files"
                  multiple
                  onChange={handleFileChange}
                  type="file"
                />
                {selectedFiles.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file, i) => (
                      <li
                        className="flex items-center gap-2 rounded-lg border border-[#a3b840]/20 bg-[#111310] px-3 py-1.5 text-xs text-white/70"
                        key={`${file.name}-${i}`}
                      >
                        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        <span className="font-medium text-white/90">{file.name}</span>
                        <button
                          className="ml-1 text-white/40 transition hover:text-[#ff6b6b]"
                          onClick={() => removeFile(i)}
                          type="button"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                className="mt-4 w-full rounded-lg bg-[#a3b840] px-5 py-3 text-sm font-bold text-[#111310] shadow-xl shadow-black/20 transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isTesting || (!brief.trim() && selectedFiles.length === 0) || !activePrompt.prompt_text.trim()}
                onClick={testPrompt}
                type="button"
              >
                {isTesting ? "Generating..." : selectedFiles.length > 0 ? `Run Test with ${selectedFiles.length} PDF${selectedFiles.length > 1 ? "s" : ""}` : "Run Test Generation"}
              </button>

              {errorMessage && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-red-400">Test failed</p>
                      <p className="mt-1 text-sm text-red-300/80">{errorMessage}</p>
                    </div>
                    <button
                      className="shrink-0 text-red-400/60 transition hover:text-red-300"
                      onClick={clearError}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

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
