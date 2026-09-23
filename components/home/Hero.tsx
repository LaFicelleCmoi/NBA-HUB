"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import type { TodayResponse } from "@/types";

const WORDS = [
  { text: "NBA", color: "var(--nba)" },
  { text: "WNBA", color: "var(--wnba)" },
  { text: "EuroLeague", color: "var(--euroleague)" },
];

const fmt1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const fmt = new Intl.NumberFormat("fr-FR");

export function Hero({ stats }: { stats: TodayResponse["stats"] }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, [reduce]);

  const cards = [
    { label: "championnats", value: stats.leagues },
    { label: "équipes", value: stats.teams },
    { label: stats.gamesToday > 1 ? "matchs aujourd’hui" : "match aujourd’hui", value: stats.gamesToday },
    { label: stats.pointsToday > 1 ? "points marqués aujourd’hui" : "point marqué aujourd’hui", value: stats.pointsToday },
  ];

  return (
    <section aria-labelledby="hero-title" className="relative pb-6 pt-6 sm:pt-12">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-xs font-semibold uppercase tracking-[0.25em] text-faint"
      >
        Scores · Classements · Leaders
      </motion.p>
      <h1
        id="hero-title"
        className="mt-3 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl"
      >
        <motion.span
          className="block"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Les 3 grandes ligues
        </motion.span>
        <motion.span
          className="block"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          de basket
        </motion.span>
        <span className="relative mt-1 block h-[1em] overflow-hidden" aria-hidden>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={WORDS[i].text}
              className="absolute left-0 block"
              style={{ color: WORDS[i].color }}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              {WORDS[i].text}
            </motion.span>
          </AnimatePresence>
        </span>
      </h1>
      <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">
        Scores en direct, classements, résultats, calendriers, leaders et actualités de la NBA, de la WNBA et de
        l’EuroLeague, réunis au même endroit — horaires à l’heure de Paris.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c, idx) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 + idx * 0.07 }}
            className="glass flex flex-col-reverse rounded-2xl p-4"
          >
            <dt className="text-sm text-muted">{c.label}</dt>
            <dd className="font-display text-4xl font-extrabold sm:text-5xl">
              <AnimatedCounter value={c.value} />
            </dd>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="glass col-span-2 flex flex-col-reverse rounded-2xl p-4 lg:col-span-1"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--wnba) 16%, var(--surface)), var(--surface))" }}
        >
          <dt className="text-sm text-muted">
            points au total en saison régulière
            <span className="block text-xs text-faint">
              {fmt1.format(stats.avgPerGame)} par match · {fmt.format(stats.seasonGames)} matchs
            </span>
          </dt>
          <dd className="font-display text-4xl font-extrabold sm:text-5xl">
            <AnimatedCounter value={stats.seasonPoints} />
          </dd>
        </motion.div>
      </dl>
    </section>
  );
}
