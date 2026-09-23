import Image from "next/image";
import type { Player } from "@/types";

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Colonnes n'ayant de contenu que pour certaines ligues : on les masque si elles sont vides. */
function usedColumns(roster: Player[]) {
  return {
    college: roster.some((p) => p.college),
    experience: roster.some((p) => p.experience !== undefined),
    birthPlace: roster.some((p) => p.birthPlace),
    salary: roster.some((p) => p.salary),
    status: roster.some((p) => p.status || p.injury),
  };
}

export function RosterTable({ roster, teamName }: { roster: Player[]; teamName: string }) {
  const th = "px-3 py-2 text-left font-semibold";
  const cols = usedColumns(roster);

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div
        className="scrollbar-thin relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`Effectif ${teamName}`}
      >
        <table className="tabular w-full min-w-[720px] text-sm">
          <caption className="sr-only">Effectif de {teamName}</caption>
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                Joueur
              </th>
              <th scope="col" className={th}>
                <abbr title="Numéro" className="no-underline">N°</abbr>
              </th>
              <th scope="col" className={th}>Poste</th>
              <th scope="col" className={th}>Âge</th>
              <th scope="col" className={th}>Taille</th>
              <th scope="col" className={th}>Poids</th>
              {cols.experience && (
                <th scope="col" className={th}>
                  <abbr title="Saisons professionnelles disputées" className="no-underline">Exp.</abbr>
                </th>
              )}
              {cols.college && <th scope="col" className={th}>Université</th>}
              {cols.birthPlace && <th scope="col" className={th}>Né à</th>}
              {!cols.birthPlace && <th scope="col" className={th}>Pays</th>}
              {cols.salary && <th scope="col" className={th}>Salaire</th>}
              {cols.status && <th scope="col" className={th}>Statut</th>}
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
                {cols.experience && (
                  <td className="px-3 py-2 text-muted">
                    {p.experience === undefined ? "–" : p.experience === 0 ? "Rookie" : `${p.experience} ans`}
                  </td>
                )}
                {cols.college && (
                  <td className="px-3 py-2 text-muted">
                    <span className="block max-w-[12rem] truncate">{p.college ?? "–"}</span>
                  </td>
                )}
                {cols.birthPlace && (
                  <td className="px-3 py-2 text-muted">
                    <span className="block max-w-[14rem] truncate">{p.birthPlace ?? p.country ?? "–"}</span>
                  </td>
                )}
                {!cols.birthPlace && <td className="px-3 py-2 text-muted">{p.country ?? "–"}</td>}
                {cols.salary && (
                  <td className="px-3 py-2 text-muted">{p.salary ? money.format(p.salary) : "–"}</td>
                )}
                {cols.status && (
                  <td className="px-3 py-2">
                    {p.injury ? (
                      <span className="rounded-full bg-live/15 px-2 py-0.5 text-xs font-semibold text-live">
                        {p.injury}
                      </span>
                    ) : p.status && p.status !== "Actif" ? (
                      <span className="rounded-full bg-playin-bg px-2 py-0.5 text-xs font-semibold text-playin">
                        {p.status}
                      </span>
                    ) : (
                      <span className="text-xs text-faint">{p.status ?? "–"}</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
