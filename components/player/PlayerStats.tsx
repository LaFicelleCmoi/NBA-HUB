"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { formatShortDay } from "@/lib/time";
import type { CareerTable, LeagueId, PlayerProfile, StatColumn } from "@/types";

function Onglets<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div role="tablist" aria-label={label} className="glass inline-flex flex-wrap rounded-2xl p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
            value === o.id ? "bg-surface-strong text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tableau à colonne de tête figée : il défile horizontalement sur mobile. */
function Tableau({
  caption,
  premiere,
  columns,
  lignes,
  pied,
}: {
  caption: string;
  premiere: string;
  columns: StatColumn[];
  lignes: { key: string; tete: ReactNode; stats: string[] }[];
  pied?: { tete: ReactNode; stats: string[] };
}) {
  // La colonne des points est mise en avant, où qu'ESPN la place.
  const pts = columns.findIndex((c) => c.abbr === "PTS");
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${12 + columns.length * 4}rem` }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-surface-strong/60 text-xs uppercase tracking-wide text-faint">
            <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
              {premiere}
            </th>
            {columns.map((c, i) => (
              <th key={`${c.abbr}-${i}`} scope="col" className="px-3 py-2 text-right font-semibold">
                <abbr title={c.title} className="no-underline">
                  {c.abbr}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.key} className="border-b border-line last:border-0 hover:bg-line/40">
              <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                {l.tete}
              </th>
              {l.stats.map((v, i) => (
                <td key={i} className={`tabular px-3 py-2 text-right ${i === pts ? "font-bold" : "text-muted"}`}>
                  {v || "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pied && (
          <tfoot>
            <tr className="border-t-2 border-line-strong font-bold">
              <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2.5 text-left">
                {pied.tete}
              </th>
              {pied.stats.map((v, i) => (
                <td key={i} className="tabular px-3 py-2.5 text-right">
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * Carrière saison par saison : saison régulière ou playoffs, puis moyennes,
 * totaux ou divers. La saison la plus récente en haut, la ligne « Carrière »
 * en pied de tableau.
 */
export function CareerStats({
  league,
  career,
  playoffs,
}: {
  league: LeagueId;
  career: CareerTable[];
  playoffs: CareerTable[];
}) {
  const phases = [
    ...(career.length ? [{ id: "regular" as const, label: "Saison régulière" }] : []),
    ...(playoffs.length ? [{ id: "playoffs" as const, label: "Playoffs" }] : []),
  ];
  const [phase, setPhase] = useState<"regular" | "playoffs">(phases[0]?.id ?? "regular");
  const tables = phase === "playoffs" ? playoffs : career;
  const [vue, setVue] = useState(0);
  const table = tables[Math.min(vue, tables.length - 1)];
  if (!table) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Onglets label="Phase" options={phases} value={phase} onChange={setPhase} />
        <Onglets
          label="Statistiques"
          options={tables.map((t, i) => ({ id: String(i), label: t.title }))}
          value={String(Math.min(vue, tables.length - 1))}
          onChange={(v) => setVue(Number(v))}
        />
      </div>
      <Tableau
        caption={`${phase === "playoffs" ? "Playoffs" : "Saison régulière"} — ${table.title}`}
        premiere="Saison"
        columns={table.columns}
        lignes={table.rows.map((r, i) => ({
          key: `${r.season}-${r.team?.id ?? ""}-${i}`,
          tete: (
            <span className="flex items-center gap-2">
              <span className="tabular">{r.season}</span>
              {r.team && (
                <Link
                  href={`/${league}/equipe/${r.team.id}`}
                  className="flex items-center gap-1 text-xs font-normal text-faint hover:text-fg"
                >
                  <Logo logo={r.team.logo} alt="" size={18} className="h-4.5 w-4.5" />
                  {r.team.abbreviation}
                </Link>
              )}
            </span>
          ),
          stats: r.stats,
        }))}
        pied={table.totals.length ? { tete: "Carrière", stats: table.totals } : undefined}
      />
    </div>
  );
}

/** Matchs de la saison en cours, le plus récent en haut, chacun menant à sa page. */
export function GameLog({ league, log }: { league: LeagueId; log: PlayerProfile["gameLog"] }) {
  const [choix, setChoix] = useState(0);
  const section = log[Math.min(choix, log.length - 1)];
  if (!section) return null;
  return (
    <div className="space-y-4">
      <Onglets
        label="Phase"
        options={log.map((s, i) => ({ id: String(i), label: `${s.title} (${s.games.length})` }))}
        value={String(Math.min(choix, log.length - 1))}
        onChange={(v) => setChoix(Number(v))}
      />
      <Tableau
        caption={section.title}
        premiere="Match"
        columns={section.columns}
        lignes={section.games.map((g) => ({
          key: g.id,
          tete: (
            <Link href={`/${league}/match/${g.id}`} className="flex items-center gap-2 hover:underline">
              <span className="tabular shrink-0 whitespace-nowrap text-xs font-normal text-faint sm:w-24">
                {formatShortDay(g.date)}
              </span>
              <span className="w-4 text-xs font-normal text-faint">{g.home ? "vs" : "@"}</span>
              <Logo logo={g.opponent.logo} alt="" size={20} className="h-5 w-5" />
              <span>{g.opponent.abbreviation}</span>
              {g.result && (
                <span className={`text-xs font-bold ${g.result === "V" ? "text-direct" : "text-live"}`}>{g.result}</span>
              )}
              {/* Sur mobile, la colonne figée reste étroite : score et tour cèdent la place aux statistiques. */}
              <span className="tabular hidden whitespace-nowrap text-xs font-normal text-muted sm:inline">{g.score}</span>
              {g.round && (
                <span className="hidden whitespace-nowrap text-xs font-normal text-faint lg:inline">· {g.round}</span>
              )}
            </Link>
          ),
          stats: g.stats,
        }))}
      />
    </div>
  );
}
