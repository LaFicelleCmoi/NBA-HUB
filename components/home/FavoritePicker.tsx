"use client";

import { useFavorite } from "@/lib/client/favorite";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import type { LeagueId, Team } from "@/types";

export function FavoritePicker({ teams }: { teams: Record<LeagueId, Team[]> }) {
  const { favorite, setFavorite } = useFavorite();
  const value = favorite ? `${favorite.league}:${favorite.id}` : "";

  const onChange = (v: string) => {
    if (!v) return setFavorite(null);
    const [league, id] = v.split(":") as [LeagueId, string];
    const t = teams[league]?.find((x) => x.id === id);
    if (t) setFavorite({ league, id: t.id, name: t.name, logo: t.logo });
  };

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-fav-bg">
          {favorite ? (
            <Logo logo={favorite.logo} alt="" size={36} />
          ) : (
            <span aria-hidden className="text-2xl text-fav">
              ★
            </span>
          )}
        </span>
        <div>
          <label htmlFor="favorite-team" className="font-display text-xl font-bold uppercase tracking-wide">
            Équipe favorite
          </label>
          <p className="text-sm text-muted">
            {favorite
              ? `${favorite.name} est mise en avant partout sur le site.`
              : "Choisissez une équipe pour la mettre en avant partout sur le site."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          id="favorite-team"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-xl border border-line-strong bg-surface-strong px-3 py-2.5 text-sm font-medium sm:w-72"
        >
          <option value="">Aucune</option>
          {LEAGUE_IDS.map((l) => (
            <optgroup key={l} label={LEAGUES[l].name}>
              {(teams[l] ?? []).map((t) => (
                <option key={t.id} value={`${l}:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {favorite && (
          <button
            type="button"
            onClick={() => setFavorite(null)}
            className="shrink-0 rounded-xl border border-line-strong px-3 py-2.5 text-sm font-semibold text-muted hover:text-fg"
          >
            Retirer
          </button>
        )}
      </div>
    </div>
  );
}
