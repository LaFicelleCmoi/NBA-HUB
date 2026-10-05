"use client";

import Image from "next/image";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import type { Boxscore, BoxPlayer, Team } from "@/types";

function Ligne({ p, colonnes }: { p: BoxPlayer; colonnes: number }) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-line/40">
      <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
        <div className="flex items-center gap-2.5">
          {p.headshot ? (
            <Image
              src={p.headshot}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full bg-line object-cover object-top"
            />
          ) : (
            <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-line" />
          )}
          <span className="min-w-0">
            <span className="block max-w-[9rem] truncate sm:max-w-none">{p.name}</span>
            <span className="block text-xs font-normal text-faint">
              {[p.jersey && `#${p.jersey}`, p.position].filter(Boolean).join(" · ")}
              {p.ejected && <span className="ml-1 font-semibold text-live">· Expulsé</span>}
            </span>
          </span>
        </div>
      </th>
      {p.dnp ? (
        <td colSpan={colonnes} className="px-3 py-2 text-sm italic text-faint">
          {p.dnp}
        </td>
      ) : (
        p.stats.map((v, i) => (
          <td key={i} className={`tabular px-3 py-2 text-right ${i === 1 ? "font-bold" : "text-muted"}`}>
            {v || "–"}
          </td>
        ))
      )}
    </tr>
  );
}

/**
 * Feuille de match : une équipe à la fois (onglets), titulaires puis banc,
 * joueurs absents avec leur motif, et la ligne des totaux. Le tableau défile
 * horizontalement sur mobile, la colonne des noms restant visible.
 */
export function BoxScore({ box, away, home }: { box: Boxscore; away: Team; home: Team }) {
  const equipes = [away, home];
  const [choix, setChoix] = useState(0);
  const team = equipes[choix];
  const data = box.teams.find((t) => t.teamId === team.id);
  if (!data) return null;

  const titulaires = data.players.filter((p) => p.starter);
  const banc = data.players.filter((p) => !p.starter);
  const n = box.columns.length;

  const enTete = (titre: string) => (
    <tr className="border-b border-line bg-surface-strong/60 text-xs uppercase tracking-wide text-faint">
      <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
        {titre}
      </th>
      {box.columns.map((c) => (
        <th key={c.abbr} scope="col" className="px-3 py-2 text-right font-semibold">
          <abbr title={c.title} className="no-underline">
            {c.abbr}
          </abbr>
        </th>
      ))}
    </tr>
  );

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Équipe" className="glass inline-flex rounded-2xl p-1">
        {equipes.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={choix === i}
            onClick={() => setChoix(i)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              choix === i ? "bg-surface-strong text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Logo logo={t.logo} alt="" size={22} className="h-5.5 w-5.5" />
            {t.shortName}
          </button>
        ))}
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">Feuille de match — {team.name}</caption>
          <thead>{enTete("Cinq de départ")}</thead>
          <tbody>
            {titulaires.map((p) => (
              <Ligne key={p.id} p={p} colonnes={n} />
            ))}
          </tbody>
          {banc.length > 0 && (
            <>
              <thead>{enTete("Banc")}</thead>
              <tbody>
                {banc.map((p) => (
                  <Ligne key={p.id} p={p} colonnes={n} />
                ))}
              </tbody>
            </>
          )}
          {data.totals.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line-strong font-bold">
                <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2.5 text-left">
                  Total équipe
                </th>
                {data.totals.map((v, i) => (
                  <td key={i} className="tabular px-3 py-2.5 text-right">
                    {v || ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-faint">
        Survolez une colonne pour son intitulé complet. TIRS, 3PTS et LF : réussis-tentés.
      </p>
    </div>
  );
}
