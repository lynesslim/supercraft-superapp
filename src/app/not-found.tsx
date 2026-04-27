import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#111310] px-4 text-[#e8eae0]">
      <section className="max-w-md rounded-lg border border-white/10 bg-[#1a1c16] p-6 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a3b840]">Not found</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">This page is unavailable.</h1>
        <p className="mt-3 text-sm leading-6 text-white/55">
          The project, sitemap, or page may have been removed.
        </p>
        <Link
          className="mt-5 inline-flex rounded-lg bg-[#a3b840] px-4 py-2 text-sm font-bold text-[#111310] transition hover:bg-[#c8db5a]"
          href="/"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
