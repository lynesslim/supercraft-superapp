"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#111310] px-4 py-8 text-[#e8eae0]">
      <section className="motion-slide-up w-full max-w-md rounded-2xl border border-white/8 bg-[#1a1c16] p-6 shadow-2xl shadow-black/40">
        <div className="relative h-12 w-48">
          <Image
            alt="Supercraft"
            className="object-contain object-left"
            fill
            priority
            sizes="192px"
            src="/supercraft-logoonly.png"
          />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-[#a3b840]">
          Internal access
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[#f4f6ea]">
          Sign in to Superapp
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Use your assigned Supercraft account. Account creation is managed by an administrator.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={login}>
          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Email
            <input
              autoComplete="email"
              className="rounded-xl border border-white/10 bg-[#111310] px-3 py-2.5 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/70"
              disabled={isSubmitting}
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-white/65">
            Password
            <input
              autoComplete="current-password"
              className="rounded-xl border border-white/10 bg-[#111310] px-3 py-2.5 text-sm text-[#e8eae0] outline-none transition focus:border-[#a3b840]/70"
              disabled={isSubmitting}
              name="password"
              required
              type="password"
            />
          </label>

          {error ? (
            <p className="motion-pop rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <button
            className="motion-lift inline-flex items-center justify-center gap-2 rounded-xl bg-[#a3b840] px-4 py-3 text-sm font-bold text-[#111310] transition hover:bg-[#c8db5a] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
