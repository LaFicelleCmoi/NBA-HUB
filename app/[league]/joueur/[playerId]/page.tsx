import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayer } from "@/lib/data";
import { UpstreamError } from "@/lib/api/http";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { parsePlayerId, ValidationError } from "@/lib/validation";
import { CareerStats, GameLog } from "@/components/player/PlayerStats";
import { ErrorState } from "@/components/ui/EmptyState";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { LeagueId, PlayerProfile } from "@/types";

type Props = { params: Promise<{ league: string; playerId: string }> };

/** Validation avant tout appel amont : un identifiant mal formé est un vrai 404. */
function valider(league: string, playerId: string): { l: LeagueId; id: string } {
  if (!isLeagueId(league)) notFound();
  try {
    return { l: league, id: parsePlayerId(league, playerId) };
  } catch (err) {
    if (err instanceof ValidationError) notFound();
    throw err;
  }
}

/**
 * Fiche du joueur ; un joueur inconnu d'ESPN est un 404, une panne rend `null`
 * (message d'erreur). `notFound()` est appelé hors du `try` : il lève une
 * exception que le `catch` avalerait.
 */
async function charger(l: LeagueId, id: string): Promise<PlayerProfile | null> {
  let inconnu = false;
  try {
    const p = await getPlayer(l, id);
    if (p) return p;
    inconnu = true;
  } catch (err) {
    inconnu =
      (err instanceof UpstreamError && (err.status === 404 || err.status === 400)) ||
      (err instanceof Error && err.message === "joueur introuvable");
    if (!inconnu) console.warn("[joueur]", err instanceof Error ? err.message : err);
  }
  if (inconnu) notFound();
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, playerId } = await params;
  if (!isLeagueId(league) || league === "euroleague") return {};
  const p = await getPlayer(league, playerId).catch(() => null);
  return p
    ? {
        title: `${p.name} (${LEAGUES[league].name})`,
        description: `Statistiques de carrière, palmarès et matchs de la saison de ${p.name}.`,
      }
    : {};
}

export default async function PlayerPage({ params }: Props) {
  const { league, playerId } = await params;
  const { l, id } = valider(league, playerId);
  const p = await charger(l, id);

  return (
    <>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-faint">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Accueil
            </Link>{" "}
            /
          </li>
          <li>
            <Link href={`/${l}`} className="hover:underline">
              {LEAGUES[l].name}
            </Link>{" "}
            /
          </li>
          {p?.team && (
            <li>
              <Link href={`/${l}/equipe/${p.team.id}`} className="hover:underline">
                {p.team.name}
              </Link>{" "}
              /
            </li>
          )}
          <li aria-current="page" className="text-muted">
            {p?.name ?? "Joueur"}
          </li>
        </ol>
      </nav>

      {p ? <Fiche p={p} /> : <ErrorState message="Impossible de charger ce joueur pour le moment" />}
    </>
  );
}

function Fiche({ p }: { p: PlayerProfile }) {
  const teinte = p.team?.color ? `color-mix(in srgb, ${p.team.color} 30%, transparent)` : undefined;
  return (
    <>
      <section
        className="glass relative overflow-hidden rounded-3xl p-5 sm:p-8"
        style={teinte ? { backgroundImage: `linear-gradient(120deg, ${teinte}, transparent 65%)` } : undefined}
      >
        {p.team && (
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 opacity-[0.1]">
            <Logo logo={p.team.logo} alt="" size={280} className="h-72 w-72" />
          </span>
        )}
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          {p.headshot ? (
            <Image
              src={p.headshot}
              alt={p.name}
              width={220}
              height={160}
              priority
              className="h-40 w-auto self-start object-contain object-bottom sm:h-48"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-faint">
              {[p.jersey, p.position].filter(Boolean).join(" · ")}
              {!p.active && " · Inactif"}
            </p>
            <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl">
              {p.name}
            </h1>
            {p.team && (
              <Link
                href={`/${p.league}/equipe/${p.team.id}`}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
              >
                <Logo logo={p.team.logo} alt="" size={24} className="h-6 w-6" />
                {p.team.name}
              </Link>
            )}
          </div>
        </div>

        {p.highlights.length > 0 && (
          <div className="relative mt-6 border-t border-line pt-5">
            {p.highlightsLabel && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-faint">{p.highlightsLabel}</p>
            )}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.highlights.map((h) => (
                <div key={h.label} className="flex flex-col-reverse">
                  <dt className="text-sm text-muted">
                    {h.label}
                    {h.rank && <span className="block text-xs text-faint">{h.rank}</span>}
                  </dt>
                  <dd className="tabular font-display text-4xl font-extrabold leading-none">{h.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        {p.bio.length > 0 && (
          <Reveal as="section">
            <SectionHeading id="bio" kicker="Identité" title="Fiche" />
            <dl className="glass divide-y divide-line rounded-2xl">
              {p.bio.map((b) => (
                <div key={b.label} className="flex gap-4 px-4 py-3">
                  <dt className="w-36 shrink-0 text-sm text-muted">{b.label}</dt>
                  <dd className="text-sm font-medium">{b.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        )}

        {p.awards.length > 0 && (
          <Reveal as="section">
            <SectionHeading id="palmares" kicker="Récompenses individuelles" title="Palmarès" />
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {p.awards.map((a) => (
                <li key={a.name} className="glass flex items-start gap-3 rounded-2xl p-3.5">
                  <span className="tabular grid h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-fav-bg px-2 font-display text-xl font-extrabold text-fav">
                    {a.count}×
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{a.name}</span>
                    <span className="block text-xs text-faint">{a.seasons.join(", ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>

      {p.splits && (
        <Reveal as="section" className="mt-14">
          <SectionHeading id="resume" kicker="Moyennes par match" title="Saison, playoffs et carrière" />
          <div className="glass overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-strong/60 text-xs uppercase tracking-wide text-faint">
                  <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                    Période
                  </th>
                  {p.splits.columns.map((c) => (
                    <th key={c.abbr} scope="col" className="px-3 py-2 text-right font-semibold">
                      <abbr title={c.title} className="no-underline">
                        {c.abbr}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.splits.rows.map((r) => (
                  <tr key={r.label} className="border-b border-line last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2.5 text-left font-semibold">
                      {r.label}
                    </th>
                    {r.stats.map((v, i) => (
                      <td key={i} className="tabular px-3 py-2.5 text-right text-muted">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}

      {(p.career.length > 0 || p.playoffs.length > 0) && (
        <Reveal as="section" className="mt-14">
          <SectionHeading id="carriere" kicker="Saison par saison" title="Carrière" />
          <CareerStats league={p.league} career={p.career} playoffs={p.playoffs} />
        </Reveal>
      )}

      {p.gameLog.length > 0 && (
        <Reveal as="section" className="mt-14">
          <SectionHeading id="matchs" kicker="Match par match" title="Saison en cours" />
          <GameLog league={p.league} log={p.gameLog} />
        </Reveal>
      )}

      <p className="mt-10 text-xs text-faint">
        Survolez une colonne pour son intitulé complet. TIRS, 3PTS et LF : réussis-tentés.
      </p>
    </>
  );
}
