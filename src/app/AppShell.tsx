"use client";

import { FlaskConical, LayoutDashboard, LogOut, Network } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AuthContext } from "@/utils/auth";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/canvas",
    label: "Canvas",
    icon: Network,
  },
  {
    href: "/playground",
    label: "Prompt Lab",
    icon: FlaskConical,
    superadminOnly: true,
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/projects");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ auth, children }: { auth: AuthContext | null; children: ReactNode }) {
  const pathname = usePathname();
  const isCanvas = pathname === "/canvas" || pathname.startsWith("/canvas/");
  const isLogin = pathname === "/login";

  if (isCanvas || isLogin) {
    return children;
  }

  return (
    <div className="min-h-screen bg-[#111310] text-[#e8eae0] lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="border-b border-white/8 bg-[#171914] px-4 py-4 shadow-2xl shadow-black/30 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
        <div className="border-white/8 lg:border-b lg:pb-5">
          <div className="relative h-12 w-full max-w-[210px]">
            <Image
              alt="Supercraft"
              className="object-contain object-left"
              fill
              priority
              sizes="210px"
              src="/supercraft-logoonly.png"
            />
          </div>
          <div className="min-w-0">
            <p className="mt-3 truncate text-base font-semibold tracking-tight text-[#f3f4ec]">
              Superapp
            </p>
            <p className="mt-1 hidden text-xs leading-5 text-white/45 sm:block lg:block">
              An internal powerhouse for Supercraft.
            </p>
          </div>
        </div>

        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
          {navItems.map((item) => {
            if (item.superadminOnly && auth?.role !== "superadmin") return null;

            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`group motion-lift flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[#a3b840] text-[#111310] shadow-lg shadow-black/20"
                    : "border border-white/8 bg-[#111310] text-white/60 hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
                }`}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 transition group-hover:scale-110" strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {auth ? (
          <div className="mt-5 rounded-lg border border-white/8 bg-[#111310] p-3">
            <p className="truncate text-xs font-semibold text-white/40">{auth.email}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a3b840]">
              {auth.role}
            </p>
            <form action="/auth/sign-out" method="post">
              <button
                className="motion-lift mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-bold text-white/55 transition hover:border-[#a3b840]/35 hover:text-[#c8db5a]"
                type="submit"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 bg-[#111310]">{children}</div>
    </div>
  );
}
