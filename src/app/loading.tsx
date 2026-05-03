import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#111310] px-4 text-[#e8eae0]">
      <div className="inline-flex items-center gap-3 rounded-lg border border-white/10 bg-[#1a1c16] px-4 py-3 text-sm font-semibold text-white/60 shadow-2xl shadow-black/25">
        <Loader2 aria-hidden="true" className="animate-spin text-[#a3b840]" size={16} />
        Loading page...
      </div>
    </main>
  );
}
