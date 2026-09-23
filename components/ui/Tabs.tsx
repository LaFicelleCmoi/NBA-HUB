"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
}

/**
 * Onglets accessibles (pattern WAI-ARIA « tabs ») : flèches gauche/droite,
 * Home/End, indicateur animé partagé.
 */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
  label,
  accent = "var(--text)",
}: {
  tabs: TabDef<K>[];
  active: K;
  onChange: (k: K) => void;
  idPrefix: string;
  label: string;
  accent?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Garde l'onglet actif visible dans la barre (défilement horizontal sur mobile).
  useEffect(() => {
    const list = listRef.current;
    const el = refs.current[tabs.findIndex((t) => t.key === active)];
    if (!list || !el) return;
    const left = el.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + el.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollTo({ left: left - 8, behavior: "smooth" });
  }, [active, tabs]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].key);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className="scrollbar-thin glass flex gap-1 overflow-x-auto rounded-2xl p-1"
    >
      {tabs.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              selected ? "text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {selected && (
              <motion.span
                layoutId={`${idPrefix}-indicator`}
                className="absolute inset-0 rounded-xl bg-surface-strong shadow-sm"
                style={{ boxShadow: `inset 0 -2px 0 ${accent}` }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
