"use client";

import { setFavoriteTeam, useIsFavorite } from "@/lib/client/favorite";
import type { Team } from "@/types";

export function FavoriteButton({ team }: { team: Team }) {
  const fav = useIsFavorite(team.league, team.id);
  return (
    <button
      type="button"
      aria-pressed={fav}
      onClick={() => setFavoriteTeam(fav ? null : { league: team.league, id: team.id, name: team.name, logo: team.logo })}
      className={`glass inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
        fav ? "ring-2 ring-fav/70" : "hover:bg-line/50"
      }`}
    >
      <span aria-hidden className="text-fav">
        {fav ? "★" : "☆"}
      </span>
      {fav ? "Équipe favorite" : "Définir comme favorite"}
    </button>
  );
}
