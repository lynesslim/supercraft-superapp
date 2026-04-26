"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function BackButton({
  className = "",
  fallbackHref = "/",
  label = "Back",
}: {
  className?: string;
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#1a1c16]/90 text-white/60 shadow-lg shadow-black/25 transition hover:border-[#a3b840]/40 hover:text-[#c8db5a] ${className}`}
      onClick={goBack}
      title={label}
      type="button"
    >
      <ArrowLeft aria-hidden="true" size={17} />
    </button>
  );
}
