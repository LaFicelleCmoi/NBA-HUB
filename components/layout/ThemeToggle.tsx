"use client";

import { useTheme, type ThemeChoice } from "@/lib/client/theme";

const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const LABEL: Record<ThemeChoice, string> = { system: "système", light: "clair", dark: "sombre" };

function Icon({ theme }: { theme: ThemeChoice }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (theme === "light")
    return (
      <svg {...p} aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (theme === "dark")
    return (
      <svg {...p} aria-hidden>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...p} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** Bouton cyclique système → clair → sombre. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="glass grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-fg"
      aria-label={`Thème ${LABEL[theme]} : passer au thème ${LABEL[next]}`}
      title={`Thème ${LABEL[theme]}`}
    >
      <Icon theme={theme} />
    </button>
  );
}
