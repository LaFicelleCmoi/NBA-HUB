import type { TeamStat } from "@/types";

/**
 * Bilans d'une équipe, en deux familles : victoires et défaites, puis points.
 *
 * ESPN livre des chaînes (« 53-29 », « 1 défaite », « +6.4 ») : on les relit
 * ici pour les rendre lisibles d'un coup d'œil — victoires en vert, défaites
 * en rouge, une barre pour la proportion. Relire l'affichage plutôt
 * qu'enrichir le modèle garde compatibles les instantanés déjà versionnés.
 */

const BILAN = /^(\d+)-(\d+)$/;

/** Les pourcentages de victoires font doublon avec les barres des bilans. */
const redondant = (s: TeamStat) => s.label.startsWith("% de victoires");

const estPoints = (s: TeamStat) => /points|différence/i.test(s.label);

function Bilan({ label, wins, losses }: { label: string; wins: number; losses: number }) {
  const total = wins + losses;
  const pct = total ? (wins / total) * 100 : 0;
  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex flex-col gap-2">
        <p className="tabular flex items-baseline gap-3 font-display text-2xl font-extrabold sm:text-3xl">
          <span className="text-direct">
            {wins}
            <span className="ml-0.5 text-base font-bold">V</span>
          </span>
          <span className="text-live">
            {losses}
            <span className="ml-0.5 text-base font-bold">D</span>
          </span>
          <span className="sr-only">
            {wins} victoire{wins > 1 ? "s" : ""}, {losses} défaite{losses > 1 ? "s" : ""}
          </span>
        </p>
        <span aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-live/40">
          <span className="bg-direct" style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular text-xs text-faint">{pct.toFixed(1)} % de victoires</span>
      </dd>
    </div>
  );
}

function Valeur({ stat }: { stat: TeamStat }) {
  // Série et écarts : la couleur dit tout de suite si c'est bon signe.
  const ton = /victoire/.test(stat.value) || /^\+/.test(stat.value)
    ? "text-direct"
    : /défaite/.test(stat.value) || /^-\d/.test(stat.value)
      ? "text-live"
      : "";
  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-4">
      <dt className="text-sm text-muted">{stat.label}</dt>
      <dd className={`tabular font-display text-2xl font-extrabold sm:text-3xl ${ton}`}>{stat.value}</dd>
    </div>
  );
}

function Groupe({ titre, stats }: { titre: string; stats: TeamStat[] }) {
  if (!stats.length) return null;
  return (
    <div>
      <h3 className="mb-3 border-b border-line pb-2 font-display text-xl font-bold uppercase tracking-wide text-muted">
        {titre}
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => {
          const m = BILAN.exec(s.value);
          return m ? (
            <Bilan key={s.label} label={s.label} wins={Number(m[1])} losses={Number(m[2])} />
          ) : (
            <Valeur key={s.label} stat={s} />
          );
        })}
      </dl>
    </div>
  );
}

export function Records({ records }: { records: TeamStat[] }) {
  const utiles = records.filter((s) => !redondant(s));
  return (
    <div className="space-y-8">
      <Groupe titre="Victoires et défaites" stats={utiles.filter((s) => !estPoints(s))} />
      <Groupe titre="Points" stats={utiles.filter(estPoints)} />
    </div>
  );
}
