import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { formatShortDay } from "@/lib/time";
import type {
  GameDetail,
  GameInfo,
  GameInjury,
  GameLeader,
  GameVideo,
  HeadToHead,
  Team,
  TeamComparison,
} from "@/types";

/**
 * Les compléments d'une page de match, chacun dans son bloc. Tous sont
 * facultatifs : un bloc sans données ne s'affiche pas.
 */

const Titre = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-faint">{children}</h3>
);

function Portrait({ src, size = 44 }: { src?: string; size?: number }) {
  return src ? (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-line object-cover object-top"
      style={{ width: size, height: size }}
    />
  ) : (
    <span aria-hidden className="shrink-0 rounded-full bg-line" style={{ width: size, height: size }} />
  );
}

/* ------------------------------ Meilleurs joueurs ------------------------------ */

export function Leaders({ leaders, away, home }: { leaders: GameLeader[]; away: Team; home: Team }) {
  const categories = [...new Set(leaders.map((l) => l.category))];
  return (
    <section>
      <Titre>Meilleurs joueurs</Titre>
      <div className="grid gap-3 md:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat} className="glass rounded-2xl p-4">
            <p className="mb-3 text-sm font-semibold text-muted">{cat}</p>
            <ul className="space-y-3">
              {[away, home].map((team) => {
                const l = leaders.find((x) => x.category === cat && x.teamId === team.id);
                if (!l) return null;
                return (
                  <li key={team.id} className="flex items-center gap-3">
                    <span className="relative">
                      <Portrait src={l.player.headshot} />
                      <Logo
                        logo={team.logo}
                        alt=""
                        size={18}
                        className="absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-full bg-bg"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/${team.league}/joueur/${l.player.id}`}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {l.player.name}
                      </Link>
                      <span className="block truncate text-xs text-faint">
                        {[l.player.position, l.line].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="tabular font-display text-3xl font-extrabold leading-none">{l.value}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- Comparatif --------------------------------- */

export function Comparison({ rows, away, home }: { rows: TeamComparison[]; away: Team; home: Team }) {
  return (
    <section>
      <Titre>Statistiques d’équipe</Titre>
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Logo logo={away.logo} alt="" size={24} className="h-6 w-6" />
            {away.shortName}
          </span>
          <span className="flex items-center gap-2">
            {home.shortName}
            <Logo logo={home.logo} alt="" size={24} className="h-6 w-6" />
          </span>
        </div>
        <ul className="space-y-3.5">
          {rows.map((r) => {
            const a = r.awayValue ?? 0;
            const h = r.homeValue ?? 0;
            const total = a + h;
            const partExt = total ? (a / total) * 100 : 50;
            const egal = a === h;
            const extMieux = !egal && (r.higherIsBetter ? a > h : a < h);
            const domMieux = !egal && !extMieux;
            return (
              <li key={r.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className={`tabular w-20 ${extMieux ? "font-bold" : "text-muted"}`}>{r.away}</span>
                  <span className="text-center text-xs text-muted">{r.label}</span>
                  <span className={`tabular w-20 text-right ${domMieux ? "font-bold" : "text-muted"}`}>{r.home}</span>
                </div>
                {total > 0 && (
                  <div aria-hidden className="flex h-1.5 gap-0.5">
                    <span
                      className={`rounded-l-full ${extMieux ? "bg-fg" : "bg-line-strong"}`}
                      style={{ width: `${partExt}%` }}
                    />
                    <span className={`flex-1 rounded-r-full ${domMieux ? "bg-fg" : "bg-line-strong"}`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-faint">
          En gras : l’avantage. Pour les balles perdues et les fautes, le moins est le mieux.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------ Infos ------------------------------------ */

export function Info({ info }: { info: GameInfo }) {
  const lignes: [string, string][] = [];
  if (info.venue) lignes.push(["Salle", [info.venue, info.city].filter(Boolean).join(" · ")]);
  if (info.attendance) lignes.push(["Affluence", `${info.attendance.toLocaleString("fr-FR")} spectateurs`]);
  if (info.officials.length) lignes.push(["Arbitres", info.officials.join(", ")]);
  if (info.broadcasts.length) lignes.push(["Diffusion (États-Unis)", info.broadcasts.join(", ")]);
  return (
    <section>
      <Titre>Infos du match</Titre>
      <dl className="glass divide-y divide-line rounded-2xl">
        {lignes.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
            <dt className="w-44 shrink-0 text-sm text-muted">{k}</dt>
            <dd className="text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ----------------------------------- Blessés ----------------------------------- */

const dateRetour = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : undefined;

export function Injuries({ injuries, away, home }: { injuries: GameInjury[]; away: Team; home: Team }) {
  return (
    <section>
      <Titre>Blessés et absents</Titre>
      <div className="grid gap-3 md:grid-cols-2">
        {[away, home].map((team) => {
          const liste = injuries.filter((i) => i.teamId === team.id);
          return (
            <div key={team.id} className="glass rounded-2xl p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Logo logo={team.logo} alt="" size={22} className="h-5.5 w-5.5" />
                {team.shortName}
              </p>
              {liste.length ? (
                <ul className="space-y-2.5">
                  {liste.map((i) => (
                    <li key={i.player} className="flex items-center gap-3">
                      <Portrait src={i.headshot} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{i.player}</span>
                        <span className="block truncate text-xs text-faint">
                          {[i.detail, dateRetour(i.returnDate) && `retour estimé le ${dateRetour(i.returnDate)}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          i.status === "Forfait" || i.status === "Forfait saison"
                            ? "bg-live/15 text-live"
                            : "bg-playin-bg text-playin"
                        }`}
                      >
                        {i.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucun joueur signalé.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- Confrontations -------------------------------- */

export function HeadToHeadView({
  series,
  away,
  home,
  league,
  currentId,
}: {
  series: HeadToHead[];
  away: Team;
  home: Team;
  league: GameDetail["game"]["league"];
  currentId: string;
}) {
  return (
    <section>
      <Titre>Confrontations</Titre>
      <div className="grid gap-3 md:grid-cols-2">
        {series.map((s) => (
          <div key={s.title} className="glass rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-muted">{s.title}</p>
              <p className="tabular text-sm font-bold">
                {away.abbreviation} {s.wins[away.id] ?? 0} – {s.wins[home.id] ?? 0} {home.abbreviation}
              </p>
            </div>
            <ol className="space-y-1.5 text-sm">
              {s.games.map((g, i) => {
                const a = g.scores[away.id];
                const h = g.scores[home.id];
                const joue = g.status !== "scheduled" && a !== null && h !== null;
                const contenu = (
                  <>
                    <span className="w-16 shrink-0 text-xs text-faint">Match {i + 1}</span>
                    <span className="tabular flex-1">
                      {joue ? (
                        <>
                          <span className={a! > h! ? "font-bold" : "text-muted"}>
                            {away.abbreviation} {a}
                          </span>
                          {" – "}
                          <span className={h! > a! ? "font-bold" : "text-muted"}>
                            {h} {home.abbreviation}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">À venir</span>
                      )}
                    </span>
                    <span className="text-xs text-faint">{g.date ? formatShortDay(g.date) : ""}</span>
                  </>
                );
                return (
                  <li key={g.id}>
                    {g.id === currentId ? (
                      <span className="flex items-center gap-2 rounded-lg bg-surface-strong px-2 py-1">{contenu}</span>
                    ) : (
                      <Link
                        href={`/${league}/match/${g.id}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-line/40"
                      >
                        {contenu}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------ Vidéos ------------------------------------ */

const duree = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : undefined);

export function Videos({ videos }: { videos: GameVideo[] }) {
  return (
    <section>
      <Titre>Vidéos ESPN (en anglais)</Titre>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <li key={v.id}>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group block overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="relative block aspect-video bg-line">
                {v.thumbnail && (
                  <Image
                    src={v.thumbnail}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                )}
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center bg-black/20 opacity-80 transition group-hover:opacity-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-xl text-white">
                    ▶
                  </span>
                </span>
                {duree(v.duration) && (
                  <span className="tabular absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {duree(v.duration)}
                  </span>
                )}
              </span>
              <span className="block p-3 text-sm font-semibold leading-snug">{v.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
