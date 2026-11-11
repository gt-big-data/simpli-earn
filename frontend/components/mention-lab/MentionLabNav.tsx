"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = "/research/mention-markets";

const LINKS = [
  { href: BASE, label: "Overview" },
  { href: `${BASE}/theory`, label: "Theory" },
  { href: `${BASE}/evidence`, label: "Evidence" },
  { href: `${BASE}/strategy`, label: "Strategy" },
  { href: `${BASE}/forecaster`, label: "Forecaster" },
];

export default function MentionLabNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-24 z-30 mt-8 flex justify-center px-5">
      <nav
        className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/8 bg-[rgba(17,20,19,0.72)] px-2 py-2 backdrop-blur-xl"
        aria-label="Article sections"
      >
        {LINKS.map((link) => {
          const active = link.href === BASE ? pathname === BASE : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                active
                  ? "btn-primary no-underline"
                  : "rounded-lg px-2.5 py-1 text-sm text-foreground no-underline transition-colors hover:text-brand"
              }
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
