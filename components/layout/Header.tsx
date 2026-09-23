"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const TRACKER_URL = process.env.NEXT_PUBLIC_TRACKER_URL || "https://www.nba.com/stats";
const TRACKER_LABEL = process.env.NEXT_PUBLIC_TRACKER_LABEL || "Stats";

export function Header() {
  const pathname = usePathname();
  const active = LEAGUE_IDS.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="HoopsHub — accueil">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-wnba to-nba-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M2.5 12h19M12 2.5v19M5.5 5.2c3.2 3.6 3.2 10 0 13.6M18.5 5.2c-3.2 3.6-3.2 10 0 13.6" />
            </svg>
          </span>
          <span className="hidden font-display text-2xl font-extrabold uppercase tracking-tight sm:inline">
            Hoops<span className="text-wnba">Hub</span>
          </span>
        </Link>

        <nav aria-label="Championnats" className="min-w-0 flex-1">
          <ul className="scrollbar-thin flex items-center gap-1 overflow-x-auto">
            {LEAGUE_IDS.map((id) => {
              const l = LEAGUES[id];
              const isActive = active === id;
              return (
                <li key={id} className="shrink-0">
                  <Link
                    href={`/${id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors sm:px-3 ${
                      isActive ? "text-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-xl bg-surface-strong"
                        style={{ boxShadow: `inset 0 -2px 0 var(--${id})` }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative flex items-center gap-2">
                      <Logo logo={l.logo} alt="" size={22} />
                      <span>{l.name}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="shrink-0">
              <a
                href={TRACKER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-semibold text-muted transition-colors hover:text-fg sm:px-3"
              >
                {TRACKER_LABEL}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
                <span className="sr-only">(tracker externe, nouvel onglet)</span>
              </a>
            </li>
          </ul>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
