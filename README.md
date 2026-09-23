# HoopsHub 🏀

**La NBA et la WNBA au même endroit** : scores en direct avec quart-temps et prolongations, classements avec zones de qualification, résultats, calendrier, leaders statistiques, actualités et pages équipe. Le concept reprend [LeagueHub](https://league-hub-teal.vercel.app/), adapté au basket. Tout le site est en français et affiche les horaires à l'heure de Paris.

- **Stack** : Next.js 16 (App Router) · React 19 · TypeScript 6 · Tailwind CSS 4.3 · Framer Motion 13 (animations uniquement)
- **Node.js** : 26.10.0 en local (dernière version, fichier `.nvmrc`), ≥ 20.9 requis
- **Déploiement** : Vercel
- **Aucune clé d'API requise.**

---

## Installation

```bash
npm install
cp .env.example .env.local   # optionnel : toutes les variables ont une valeur par défaut
npm run dev                  # http://localhost:3000
```

Scripts :

| Commande            | Rôle                                        |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | serveur de développement                    |
| `npm run build`     | build de production (minifié, sans source maps navigateur) |
| `npm start`         | serveur de production                       |
| `npm run lint`      | ESLint (`next/core-web-vitals` + TypeScript) |
| `npm run typecheck` | vérification TypeScript                     |

> **Version de Node** : le projet est développé sous **Node 26.10.0** (dernière version, voir `.nvmrc`) :
>
> ```bash
> nvm install && nvm use
> ```
>
> `package.json` déclare `"engines": { "node": ">=20.9.0" }` (le minimum de Next.js 16) pour rester déployable sur Vercel, qui propose Node 20, 22 et 24.
>
> Deux dépendances ne sont volontairement pas à leur toute dernière version majeure :
> - **TypeScript 6** et non 7 : typescript-eslint ne supporte pas encore TypeScript 7.
> - **ESLint 9** et non 10 : eslint-plugin-react, embarqué par `eslint-config-next`, plante sous ESLint 10.

### Déploiement Vercel

1. Importer le dépôt dans Vercel (le framework Next.js est détecté automatiquement).
2. Renseigner au besoin les variables de `.env.example` (au minimum `NEXT_PUBLIC_SITE_URL`).
3. Déployer. Aucune autre configuration n'est nécessaire.

---

## Variables d'environnement

Toutes sont optionnelles (voir `.env.example`).

| Variable | Portée | Défaut | Rôle |
| --- | --- | --- | --- |
| `ESPN_SITE_API` | serveur | `https://site.api.espn.com/apis/site/v2/sports/basketball` | scoreboard, équipes, effectifs, calendriers, actualités |
| `ESPN_STANDINGS_API` | serveur | `https://site.api.espn.com/apis/v2/sports/basketball` | classements |
| `ESPN_WEB_API` | serveur | `https://site.web.api.espn.com/apis/site/v3/sports/basketball` | leaders |
| `UPSTREAM_TIMEOUT_MS` | serveur | `8000` | timeout des appels amont |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | serveur | `60` / `60000` | limite de requêtes sur `/api` |
| `NEWS_BASKETUSA_RSS` | serveur | `https://www.basketusa.com/feed/` | actualités NBA et WNBA en français |
| `NEXT_PUBLIC_SITE_URL` | public | `http://localhost:3000` | URL canonique (Open Graph) |
| `NEXT_PUBLIC_TRACKER_URL` / `NEXT_PUBLIC_TRACKER_LABEL` | public | `https://www.nba.com/stats` / `Stats` | lien externe du header |

Seules les variables préfixées `NEXT_PUBLIC_` arrivent dans le bundle client. Aucune d'elles n'est sensible.

---

## Architecture

```
app/
  layout.tsx                 # polices, script de thème (avec nonce CSP), header, footer
  (home)/page.tsx            # accueil (+ loading.tsx)
  [league]/page.tsx          # /nba, /wnba (onglets)
  [league]/equipe/[teamId]/  # page équipe
  api/                       # Route Handlers = proxy serveur
    today/                                 GET  matchs du jour + compteurs
    [league]/standings/                    GET  classement
    [league]/games?view=results|upcoming   GET  résultats / calendrier
    [league]/teams/                        GET  équipes
    [league]/teams/[teamId]/               GET  fiche équipe complète
    [league]/teams/[teamId]/recent/        GET  5 derniers matchs
    [league]/leaders/                      GET  leaders
    [league]/news/                         GET  actualités
components/                  # UI (home/, league/, team/, games/, standings/, layout/, ui/)
lib/
  api/        # clients amont (espn.ts, rss.ts), fetch + cache (http.ts), réponse d'API (respond.ts)
  normalize/  # conversion des réponses amont vers le modèle commun
  data/       # service unique utilisé par les Route Handlers ET les Server Components
  client/     # hooks navigateur : useApi (appelle /api uniquement), favori, thème
  validation.ts, leagues.ts, time.ts, env.ts
types/        # modèle commun : League, Team, Game, Standing, Leader, Player, NewsItem…
proxy.ts      # CSP avec nonce + rate limiting /api (ex-middleware, renommé en « proxy » par Next.js 16)
```

### Flux de données

```
Navigateur ──► /api/* (Route Handlers) ──► lib/data ──► lib/api/espn ──► API ESPN
                                              │
Server Components (rendu initial) ────────────┘   (même service, même cache, même normalisation)
```

- **Le navigateur ne contacte jamais une API tierce.** Les composants client (rafraîchissement du direct, onglets, panneau équipe) passent tous par `useApi()`, qui refuse toute URL ne commençant pas par `/api/`.
- Les Server Components appellent directement `lib/data`, c'est-à-dire la même couche que celle derrière `/api`. Passer par HTTP vers soi-même côté serveur serait un anti-pattern Next.js : cela ajouterait de la latence et demanderait une URL absolue. Les appels tiers restent donc tous côté serveur.
- **Modèle commun** (`types/index.ts`) : toute réponse amont est normalisée dans `lib/normalize/*`. Les composants ignorent tout de la forme des réponses ESPN.

### Cache et revalidation

| Donnée | Revalidation |
| --- | --- |
| Scores du jour, matchs en cours | **30 s** (et rafraîchissement client toutes les 30 s, suspendu quand l'onglet est masqué) |
| Classements, calendriers, actualités | **10 min** |
| Effectifs, équipes, leaders, statistiques | **1 h** |

Le cache repose sur le Data Cache de Next.js (`fetch(..., { next: { revalidate } })`). Certaines réponses ESPN dépassent la limite de 2 Mo de ce cache (un mois complet de matchs : 2,4 Mo ; les leaders : 3,2 Mo). Pour elles, on met en cache **le résultat normalisé**, beaucoup plus léger, via `unstable_cache` (`cachedNormalized` dans `lib/api/http.ts`). Les réponses `/api` portent aussi un `Cache-Control: s-maxage=…, stale-while-revalidate` pour le CDN Vercel.

---

## Sources de données

Chaque endpoint a été vérifié avec `curl` le 23/09/2026. Voici ce qui fonctionne réellement :

### NBA et WNBA : API publique ESPN

| Endpoint | Statut | Remarques |
| --- | --- | --- |
| `site.api.espn.com/apis/site/v2/sports/basketball/{nba\|wnba}/scoreboard` | ✅ | Sans paramètre, renvoie la **prochaine journée avec matchs** (utile en inter-saison) et un `calendar` des dates de la saison. |
| `…/scoreboard?dates=YYYYMMDD` | ✅ | Jour au sens de l'heure de New York. |
| `…/scoreboard?dates=YYYYMM&limit=1000` | ✅ | Un mois entier : c'est ainsi qu'on construit les onglets Résultats et Calendrier. |
| `…/scoreboard?dates=YYYYMMDD-YYYYMMDD` | ❌ | Les plages de dates renvoient `400 Failed to get events endpoint`. |
| `…/teams`, `…/teams/{id}`, `…/teams/{id}/roster` | ✅ | |
| `…/teams/{id}/schedule[?season=Y&seasontype=2\|3]` | ✅ | Sans paramètre, renvoie la présaison. On fusionne saison régulière (2) et playoffs (3). Pas de scores par quart-temps. |
| `…/teams/{id}/statistics` | ✅ | Moyennes d'équipe. |
| `…/news` | ✅ | Articles en anglais, complétés par des flux francophones (voir « Actualités »). |
| `…/{nba\|wnba}/standings` (`/apis/site/v2`) | ⚠️ | Répond, mais sans données (86 octets). |
| `site.api.espn.com/apis/v2/sports/basketball/{nba\|wnba}/standings[?season=Y]` | ✅ | Le vrai endpoint des classements, par conférence. |
| `site.web.api.espn.com/apis/site/v3/sports/basketball/{nba\|wnba}/leaders?limit=10` | ✅ | Renvoie par défaut la dernière saison régulière disponible. `?season=Y` renvoie 500. |
| `site.web.api.espn.com/apis/common/v3/…/teams/{id}/statistics` | ❌ | 404. |

Logos : `a.espncdn.com/i/teamlogos/{ligue}/500/{abbr}.png` pour la variante claire et `…/500-dark/…` pour la sombre. Le composant `Logo` affiche les deux, et la variante est choisie en CSS selon le thème.

### Actualités (flux RSS)

L'actualité passe par des flux RSS publics, lus côté serveur par un petit parseur sans dépendance (`lib/api/rss.ts`). Les médias francophones sont affichés en premier :

| Ligue | Français | Anglais |
| --- | --- | --- |
| NBA | BasketUSA (rubrique « NBA – ») | ESPN |
| WNBA | BasketUSA (rubrique « WNBA – ») | ESPN |

- BasketUSA publie un fil unique : ses URL de catégorie renvoient le même contenu. Les articles sont donc classés d'après leur rubrique, qui ouvre chaque description.
- Seuls les liens `https` sont conservés. Les images ne sont gardées que si leur hôte figure dans la liste blanche, identique aux `remotePatterns` de `next.config.ts`. Le texte est réduit à du texte brut, jamais injecté comme HTML.
- Chaque source est indépendante : si l'une tombe, l'autre reste affichée.
- Chaque carte indique la source et la langue, et l'attribut `lang` est posé pour les lecteurs d'écran.

### Gestion de l'inter-saison

- **Classement** : si la saison courante n'a aucun match joué, on affiche le classement final de la saison précédente, avec un bandeau « Inter-saison ».
- **Résultats** : on remonte mois par mois (jusqu'à 8 mois) pour retrouver les derniers résultats.
- **Matchs du jour** : une ligue sans match aujourd'hui affiche quand même ses **6 derniers résultats** (avec quarts-temps) et sa **prochaine journée**. La section n'est donc jamais vide.
- **Calendrier** : sans calendrier publié, un état vide dédié s'affiche.
- **Pages équipe** : un club sans match officiel (nouveau venu, par exemple) ou dont la saison est finie reçoit un message explicite plutôt qu'un bloc vide.
- **Pages équipe** : les derniers résultats et l'effectif basculent sur la saison précédente si nécessaire.

### « Aujourd'hui » à l'heure de Paris

Un match NBA à 19 h 30 (heure de New York) se joue à 1 h 30 à Paris. Pour la journée parisienne J, on interroge donc les jours ESPN J-1 et J, puis on filtre sur la date à Paris. Tous les horaires affichés utilisent le fuseau `Europe/Paris`.

### Règles de qualification affichées

| Ligue | Tableau | Zones |
| --- | --- | --- |
| NBA | Est / Ouest | 1–6 qualifiés directs, 7–10 play-in |
| WNBA | Est / Ouest | 1–8 en playoffs, **sur la ligue entière** (le top 8 WNBA ne dépend pas de la conférence). ESPN renvoie un `playoffSeed` par conférence, inutilisable comme rang de ligue : il n'est retenu que s'il est unique sur toute la ligue, sinon le rang est recalculé au pourcentage de victoires. |

---

## Sécurité

- **Proxy serveur** : toutes les API tierces sont appelées depuis des Route Handlers ou Server Components. Aucune URL amont ni configuration n'est exposée au client (`lib/env.ts` est marqué `server-only`).
- **Validation stricte** (`lib/validation.ts`) :
  - ligues en liste blanche (`nba`, `wnba`) ;
  - identifiants d'équipe vérifiés **par format** (`^\d{1,7}$`) **puis par appartenance** à la liste des équipes de la ligue ;
  - paramètres de requête non prévus refusés (400) ;
  - seul `GET` est accepté sur `/api` (405 sinon).
- **Rate limiting** sur `/api` (`proxy.ts`) : 60 requêtes par minute et par IP par défaut, avec réponse 429 et `Retry-After`.
- **Erreurs sans fuite** : les réponses d'erreur sont génériques (« Données momentanément indisponibles »), sans pile, sans URL amont et sans message brut. Le détail ne va que dans les logs serveur.
- **En-têtes** (`next.config.ts`) : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive, `Strict-Transport-Security` (2 ans, preload), `Cross-Origin-Opener-Policy: same-origin`, et `poweredByHeader: false`.
- **CSP stricte** : pour les pages, elle est générée **par requête dans `proxy.ts` avec un nonce**, ce qu'un en-tête statique de `next.config` ne permet pas. On y trouve `script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src 'self'` et `img-src 'self' data: blob:` (les images passent par l'optimiseur `/_next/image`). Pour `/api`, `next.config` pose `default-src 'none'`.
  - `style-src` autorise `'unsafe-inline'` : Framer Motion anime via l'attribut `style`. Ce choix n'ouvre aucune exécution de script.
  - Le script anti-flash du thème est inline, mais porte le nonce.
  - Contrepartie du nonce : les pages sont rendues dynamiquement. Les données, elles, restent en cache (Data Cache).
- **Production** : build minifié et `productionBrowserSourceMaps: false`.
- **localStorage** (équipe favorite, thème) : les valeurs sont revalidées à la lecture, puisque l'utilisateur peut les modifier.

> ⚠️ **L'obfuscation du code client ne protège rien.** Tout ce qui est envoyé au navigateur peut être lu, dé-minifié et rejoué. La vraie protection repose sur deux choses : le **proxy serveur**, qui ne livre au client ni URL amont, ni secret, ni logique sensible, et la **CSP**, qui empêche l'exécution de scripts injectés. Il n'y a donc aucune obfuscation dans ce projet, seulement la minification standard du build.

**Limites connues côté sécurité :** le rate limiting est en mémoire, donc propre à chaque instance serverless. Pour une limite globale, brancher un store partagé (Upstash Redis, Vercel KV) dans `proxy.ts`. L'IP est lue dans `x-forwarded-for`, ce qui n'est fiable que derrière un proxy de confiance comme Vercel.

---

## Accessibilité et design

- Thème sombre par défaut, avec un bouton système / clair / sombre persisté sans flash au chargement. Surfaces en verre dépoli léger, une couleur d'accent par ligue.
- Polices : Barlow Condensed pour les titres, Inter pour les données (chiffres tabulaires). Elles sont auto-hébergées via `next/font`, sans requête vers Google au runtime.
- Mobile-first. Les tableaux défilent horizontalement avec une **colonne équipe sticky**.
- Contrastes AA, focus visibles et lien d'évitement « Aller au contenu ».
- Onglets au pattern ARIA (flèches, Home/End). Le panneau équipe utilise un `<dialog>` natif : focus piégé, Échap pour fermer, focus rendu à la fermeture.
- `prefers-reduced-motion` est respecté (`MotionConfig reducedMotion="user"` et CSS).
- Animations : compteurs qui montent, révélation au scroll avec alternance gauche/droite, transitions d'onglets, skeletons de chargement, rafraîchissement du direct.

---

## Limites

- Les données ESPN proviennent d'API **non officiellement documentées**. Leur format peut changer, et la normalisation est défensive (champs optionnels, replis).
- Les actualités dépendent de flux RSS tiers (BasketUSA) qui peuvent changer de format. Le français est prioritaire, mais une partie des articles reste en anglais.
- La WNBA a moins d'articles en français, car BasketUSA la couvre moins que la NBA.
- Les calendriers de team schedule ESPN ne contiennent pas les quarts-temps. Les cartes des pages équipe NBA et WNBA n'ont donc pas de détail par période ; les onglets Résultats et Matchs du jour l'affichent.
- Site non officiel, sans lien avec la NBA, la WNBA ou ESPN.
