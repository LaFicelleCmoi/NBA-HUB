"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import type { SearchResponse } from "@/types";

/** Hôtes d'images autorisés par la configuration de next/image. */
const IMAGES_OK = ["a.espncdn.com", "media-cdn.incrowdsports.com", "media-cdn.cortextech.io"];
const imageOk = (src?: string) => {
  try {
    return Boolean(src) && IMAGES_OK.includes(new URL(src!).hostname);
  } catch {
    return false;
  }
};

const initiales = (nom: string) =>
  nom
    .split(/\s+/)
    .map((m) => m[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

type Resultat = {
  key: string;
  href: string;
  titre: string;
  detail: string;
  visuel: ReactNode;
};

type Etat =
  { statut: "vide" } | { statut: "chargement" } | { statut: "erreur" } | { statut: "ok"; data: SearchResponse };

/**
 * Recherche dans tout le site : clubs et joueurs des trois ligues, y compris
 * les légendes retraitées. S'ouvre depuis l'en-tête, avec Ctrl+K (⌘K) ou « / ».
 * Les résultats arrivent au fil de la frappe ; flèches et Entrée suffisent
 * pour naviguer. Fenêtre en <dialog> natif : focus piégé, Échap ferme.
 */
export function SiteSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState<Etat>({ statut: "vide" });
  const [actif, setActif] = useState(0);

  const ouvrir = () => {
    dialog.current?.showModal();
    input.current?.select();
  };
  const fermer = () => dialog.current?.close();

  // Raccourcis clavier, sauf quand on écrit déjà quelque part.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      const saisie = cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !saisie)) {
        e.preventDefault();
        if (dialog.current?.open) fermer();
        else ouvrir();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Changer de page referme la recherche.
  useEffect(() => {
    fermer();
  }, [pathname]);

  // Requête au fil de la frappe, après une courte pause ; la précédente est annulée.
  useEffect(() => {
    const texte = q.trim();
    if (texte.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setEtat({ statut: "chargement" });
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(texte)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setEtat({ statut: "ok", data: (await res.json()) as SearchResponse });
        setActif(0);
      } catch {
        if (!ctrl.signal.aborted) setEtat({ statut: "erreur" });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const trop_court = q.trim().length < 2;
  const data = !trop_court && etat.statut === "ok" ? etat.data : null;

  const equipes: Resultat[] = (data?.teams ?? []).map((t) => ({
    key: `t-${t.league}-${t.id}`,
    href: `/${t.league}/equipe/${t.id}`,
    titre: t.name,
    detail: [LEAGUES[t.league].name, t.conference && `Conférence ${t.conference}`].filter(Boolean).join(" · "),
    visuel: <Logo logo={t.logo} alt="" size={32} className="h-8 w-8" />,
  }));
  const joueurs: Resultat[] = (data?.players ?? []).map((p) => ({
    key: `p-${p.league}-${p.id}`,
    href: p.href,
    titre: p.name,
    detail: [LEAGUES[p.league].name, p.team, p.position].filter(Boolean).join(" · "),
    visuel: imageOk(p.headshot) ? (
      <Image
        src={p.headshot!}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 rounded-full bg-line object-cover object-top"
      />
    ) : (
      <span className="grid h-8 w-8 place-items-center rounded-full bg-line text-[10px] font-bold text-muted">
        {initiales(p.name)}
      </span>
    ),
  }));
  const tous = [...equipes, ...joueurs];
  const indexActif = Math.min(actif, Math.max(tous.length - 1, 0));

  const aller = (href: string) => {
    fermer();
    router.push(href);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!tous.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((indexActif + 1) % tous.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((indexActif - 1 + tous.length) % tous.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      aller(tous[indexActif].href);
    }
  };

  const groupe = (titre: string, liste: Resultat[], decalage: number) =>
    liste.length > 0 && (
      <div role="group" aria-label={titre}>
        <p className="px-3 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-faint">{titre}</p>
        {liste.map((r, i) => {
          const n = decalage + i;
          return (
            <a
              key={r.key}
              id={`${listId}-${n}`}
              role="option"
              aria-selected={n === indexActif}
              href={r.href}
              onClick={(e) => {
                e.preventDefault();
                aller(r.href);
              }}
              onMouseMove={() => setActif(n)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${n === indexActif ? "bg-surface-strong" : ""}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center">{r.visuel}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.titre}</span>
                <span className="block truncate text-xs text-faint">{r.detail}</span>
              </span>
              {n === indexActif && (
                <span aria-hidden className="text-xs text-faint">
                  ↵
                </span>
              )}
            </a>
          );
        })}
      </div>
    );

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        aria-haspopup="dialog"
        aria-label="Rechercher un joueur ou un club"
        className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line-strong px-2.5 text-sm text-muted transition-colors hover:text-fg lg:w-56 lg:px-3"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden flex-1 text-left lg:inline">Joueur, club…</span>
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-[11px] text-faint lg:inline">
          Ctrl K
        </kbd>
      </button>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) fermer();
        }}
        aria-label="Recherche"
        className="m-auto mt-[8vh] w-[calc(100%-2rem)] max-w-xl bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl">
          <div className="flex items-center gap-3 border-b border-line px-4 focus-within:border-[var(--focus)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="shrink-0 text-faint"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={input}
              type="text"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Rechercher un joueur ou un club…"
              role="combobox"
              aria-expanded={tous.length > 0}
              aria-controls={listId}
              aria-activedescendant={tous.length ? `${listId}-${indexActif}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              maxLength={50}
              className="h-14 min-w-0 flex-1 bg-transparent text-base placeholder:text-faint"
              // Le contour de focus global déborderait du champ : c'est la barre entière qui le signale.
              style={{ outline: "none" }}
            />
            <button
              type="button"
              onClick={fermer}
              className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint hover:text-fg"
            >
              Échap
            </button>
          </div>

          <div id={listId} role="listbox" aria-label="Résultats" className="max-h-[60vh] overflow-y-auto p-2">
            {trop_court ? (
              <p className="px-3 py-8 text-center text-sm text-muted">
                Joueurs et clubs NBA, WNBA et EuroLeague — légendes comprises.
              </p>
            ) : etat.statut === "erreur" ? (
              <p className="px-3 py-8 text-center text-sm text-live">Recherche momentanément indisponible.</p>
            ) : !data ? (
              <p className="px-3 py-8 text-center text-sm text-muted" aria-live="polite">
                Recherche…
              </p>
            ) : tous.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted" aria-live="polite">
                Aucun joueur ni club pour « {q.trim()} ».
              </p>
            ) : (
              <>
                {groupe("Clubs", equipes, 0)}
                {groupe("Joueurs", joueurs, equipes.length)}
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
