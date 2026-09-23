import Image from "next/image";
import type { Player } from "@/types";

export function RosterTable({ roster, teamName }: { roster: Player[]; teamName: string }) {
  const th = "px-3 py-2 text-left font-semibold";
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="scrollbar-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label={`Effectif ${teamName}`}>
        <table className="tabular w-full min-w-[560px] text-sm">
          <caption className="sr-only">Effectif de {teamName}</caption>
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                Joueur
              </th>
              <th scope="col" className={th}>
                <abbr title="Numéro" className="no-underline">N°</abbr>
              </th>
              <th scope="col" className={th}>
                Poste
              </th>
              <th scope="col" className={th}>
                Âge
              </th>
              <th scope="col" className={th}>
                Taille
              </th>
              <th scope="col" className={th}>
                Poids
              </th>
              <th scope="col" className={th}>
                Pays
              </th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0 hover:bg-line/40">
                <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                  <div className="flex items-center gap-3">
                    {p.headshot ? (
                      <Image
                        src={p.headshot}
                        alt=""
                        width={32}
                        height={32}
                        sizes="32px"
                        className="h-8 w-8 shrink-0 rounded-full bg-line object-cover object-top"
                      />
                    ) : (
                      <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-line" />
                    )}
                    <span className="max-w-[10rem] truncate sm:max-w-none">{p.name}</span>
                  </div>
                </th>
                <td className="px-3 py-2 text-muted">{p.jersey ?? "–"}</td>
                <td className="px-3 py-2">{p.position ?? "–"}</td>
                <td className="px-3 py-2">{p.age ?? "–"}</td>
                <td className="px-3 py-2">{p.height ?? "–"}</td>
                <td className="px-3 py-2">{p.weight ?? "–"}</td>
                <td className="px-3 py-2 text-muted">{p.country ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
