"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#111310] px-4 text-[#e8eae0]">
      <section className="max-w-md rounded-lg border border-white/10 bg-[#1a1c16] p-6 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a3b840]">Error</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong.</h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          The request could not be completed. Try again, or refresh the page.
        </p>
        <button
          className="mt-5 rounded-lg bg-[#a3b840] px-4 py-2 text-sm font-bold text-[#111310] transition hover:bg-[#c8db5a]"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
