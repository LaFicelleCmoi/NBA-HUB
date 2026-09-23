# Prompt : reconstruire HoopsHub

---

Construis **HoopsHub**, un site qui réunit les trois grands championnats de basket —
NBA et WNBA (États-Unis · Canada) et EuroLeague (Europe) — avec les scores en direct, les
classements, les résultats, les calendriers, les leaders statistiques, les actualités et la fiche
de chaque équipe.

Le site est **entièrement en français** (interface, dates, commentaires de code, messages de
commit). Horaires en heure de Paris. Aucun compte utilisateur, aucune base de données : ce que le
visiteur choisit vit dans son navigateur. Les seules variables d'environnement sont les bases des
API amont et quelques réglages, **toutes optionnelles** et toutes côté serveur.

## Stack imposée

| Rôle | Outil |
| --- | --- |
| Framework | Next.js 16, App Router, Server Components par défaut |
| Langage | TypeScript strict |
| Style | Tailwind CSS 4 (configuration dans `app/globals.css`, pas de `tailwind.config`) |
| Icônes | SVG en ligne — pas de paquet d'icônes pour une dizaine de pictogrammes |
| Animations | `framer-motion` |
| Données | API publique ESPN + API officielle EuroLeague + flux RSS |
| Hébergement | Vercel |

`"use client"` uniquement là où c'est indispensable (interactivité, stockage navigateur,
rafraîchissement du direct).

## Données

Deux fournisseurs, parce qu'**aucun ne couvre les trois ligues**.

### ESPN — NBA et WNBA

- `site.api.espn.com/apis/site/v2/sports/basketball/{nba|wnba}/teams` — équipes
- `…/scoreboard?dates=YYYYMMDD` — matchs d'un jour ; `?dates=YYYYMM&limit=1000` — d'un mois entier
- `…/teams/{id}` — fiche (dont `franchise.venue` : la salle, absente en WNBA)
- `…/teams/{id}/roster` — effectif et entraîneur
- `…/teams/{id}/statistics` — statistiques d'équipe
- `…/teams/{id}/schedule?season=Y&seasontype=2|3` — saison régulière (2) et playoffs (3)
- `…/news?limit=18` — actualités en anglais
- `site.api.espn.com/apis/v2/sports/basketball/{league}/standings[?season=Y&seasontype=2]` —
  le **vrai** endpoint des classements. Celui sous `/apis/site/v2/` répond mais sans données.
- `site.web.api.espn.com/apis/site/v3/sports/basketball/{league}/leaders?limit=10` — leaders.
  `?season=Y` renvoie 500 : il sert d'office la dernière saison disponible.

Logos : `a.espncdn.com/i/teamlogos/{ligue}/500/{abbr}.png`, variante sombre en `500-dark/`.
Logos de ligue : `…/i/teamlogos/leagues/500[-dark]/{nba|wnba}.png`.

### EuroLeague — API officielle

ESPN **ne couvre pas** l'EuroLeague (`mens-euroleague/scoreboard` renvoie 400, `teams` 404).
`api-live.euroleague.net` est accessible sans clé.

- `/v2/competitions/E/seasons/E{année}/games` — tous les matchs, avec les `partials`
  (quarts-temps) et `extraPeriods` (prolongations)
- `/v2/competitions/E/seasons/E{année}/clubs` — clubs (liste blanche des identifiants)
- `/v2/competitions/E/seasons/E{année}/clubs/{code}/people` — effectif et staff
- `/v3/competitions/E/seasons/E{année}/rounds/{n}/basicstandings` — classement après la journée n
- `/v3/competitions/E/statistics/players/leaders?seasonMode=Single&seasonCode=…&statisticMode=PerGame`
- `live.euroleague.net/api/Header?gamecode=…&seasoncode=…` — score en direct

### Actualités (RSS)

Un petit parseur maison sans dépendance. Médias francophones en premier :

| Ligue | Français | Anglais |
| --- | --- | --- |
| NBA | BasketUSA (rubrique « NBA – ») | ESPN |
| WNBA | BasketUSA (rubrique « WNBA – ») | ESPN |
| EuroLeague | BasketEurope | Eurohoops |

**Règles non négociables :**

1. Tous les appels amont sont faits **côté serveur**. Les modules concernés portent
   `import "server-only"` : aucune URL d'API ne doit apparaître dans le bundle du navigateur.
2. Le navigateur ne parle qu'à **nos propres routes**, toutes en lecture seule :
   `/api/today`, `/api/[league]/{standings,games,teams,leaders,news}`,
   `/api/[league]/teams/[teamId]` et `…/recent`.
3. Le JSON amont ne traverse jamais l'application : un module de normalisation le convertit en
   modèles maison (`types/index.ts`). Les composants ignorent tout de la forme des réponses ESPN
   ou EuroLeague — c'est ce qui permet de faire cohabiter deux fournisseurs.

## Architecture

```
app/
├── (home)/page.tsx                   Accueil (+ loading.tsx)
├── [league]/page.tsx                 /nba, /wnba, /euroleague (onglets)
├── [league]/equipe/[teamId]/         Fiche d'une équipe
└── api/                              Route Handlers = proxy serveur
components/                           home/, league/, team/, games/, standings/, layout/, ui/
lib/
├── leagues.ts      identifiant, nom, région, conférences, logos, couleur, zones de qualification
├── api/            espn.ts, euroleague.ts, rss.ts, http.ts (fetch + cache + réessais),
│                   fallback.ts (dernière donnée valide), respond.ts (enveloppe des routes)
├── normalize/      espn.ts, euroleague.ts — conversion vers le modèle commun
├── data/           service unique utilisé par les routes ET les Server Components
├── client/         useApi (n'appelle que /api), favori, thème
├── validation.ts, time.ts, env.ts
types/              League, Team, Game, Standings, Leader, Player, TeamDetail, NewsItem…
proxy.ts            CSP avec nonce + rate limiting (Next.js 16 : « middleware » renommé « proxy »)
```

Ajouter une ligue doit se réduire à **une ligne dans `leagues.ts`** plus un client dans `lib/api/`.
Corollaire : aucun nombre de ligues codé en dur dans l'interface — tout se déduit de `LEAGUE_IDS`.

**Pas d'appel HTTP vers soi-même côté serveur.** Les Server Components appellent directement
`lib/data`, la même couche que celle derrière `/api`. Passer par HTTP ajouterait de la latence et
exigerait une URL absolue.

## Pages

**Accueil** — chiffres clés (ligues, équipes, matchs et points du jour, points de la saison et
moyenne par match), cartes des trois championnats, **toutes les équipes des trois ligues** en
grilles de logos cliquables (panneau latéral avec les 5 derniers matchs), matchs du jour groupés
par ligue, et **les classements complets**.

> Rien d'essentiel ne se cache derrière un onglet ou un sélecteur sur l'accueil : une ligue sans
> ses deux conférences visibles, c'est la moitié des équipes invisibles.

**Championnat** (`/[league]`) — cinq onglets : Classement, Résultats, Calendrier, Leaders,
Actualités. L'onglet actif vit dans l'ancre d'URL (`#resultats`), donc partageable.

**Fiche d'une équipe** (`/[league]/equipe/[teamId]`) — identité (classement, entraîneur, ville,
salle), derniers résultats et prochains matchs, **bilans détaillés**, **toutes les statistiques
publiées par la ligue** rangées par thème, et l'effectif complet.

## Modèle de données

Un seul modèle pour les trois ligues :

- `Game` — statut (`scheduled` / `live` / `final` / `postponed`), libellé français du statut,
  quart-temps en cours, horloge, **scores par période** (4 quarts puis prolongations), salle,
  phase, journée.
- `Standings` — groupes (conférences, ou tableau unique), `season`, `isPreviousSeason`, totaux.
- `StandingRow` — rang, bilan, pourcentage, différence, série, **`seed`** (le rang qui sert aux
  zones de qualification, distinct du rang affiché) et bilans détaillés.
- `TeamDetail` — équipe, saison, salle, bilans, effectif, matchs, statistiques groupées.

## Cache et direct

| Donnée | Revalidation |
| --- | --- |
| Scores du jour, matchs en cours | **30 s** |
| Classements, calendriers, actualités | **10 min** |
| Effectifs, équipes, leaders, statistiques | **1 h** |

- Les composants client rafraîchissent via `useApi()`, qui **refuse toute URL ne commençant pas
  par `/api/`**. Rafraîchissement suspendu quand l'onglet est masqué.
- Les réponses volumineuses (un mois de scoreboard) **dépassent la limite de 2 Mo du Data Cache**
  de Next : ne pas mettre la réponse brute en cache, mais le **résultat normalisé**, bien plus
  léger, via `unstable_cache`.
- Le statut « en direct » de l'EuroLeague n'existe pas dans le flux des matchs : il se **déduit de
  la fenêtre horaire** (de 10 min avant le début à 3 h après). Pendant cette fenêtre seulement,
  interroger `Header`, qui donne des scores **cumulés** par quart-temps — à reconvertir en scores
  par période.

## Résilience

C'est là que le projet se gagne ou se perd. Trois exigences, dans cet ordre :

1. **Réessayer.** Le premier appel à ESPN après un démarrage à froid (DNS, TLS, cache CDN froids)
   dépasse régulièrement le délai — mesuré à **9,98 s** sur le classement NBA, quand l'appel
   suivant répond en 0,3 s. Délai à 12 s et **deux réessais** avec attente croissante. Un 4xx est
   une réponse définitive de l'amont : ne pas le réessayer.
2. **Servir la dernière donnée valide.** Mémoriser le dernier résultat correct de chaque source et
   le resservir quand l'appel suivant échoue. Un classement d'il y a dix minutes vaut mieux qu'une
   page d'erreur. Au-delà de 24 h, laisser l'erreur repasser.
3. **Ne jamais afficher une panne en « 0 ».** Distinguer « aucune donnée » de « données
   indisponibles ». Un `catch` qui renvoie `0` ou `[]` transforme une panne en information fausse.

Chaque source est indépendante : une ligue ou un flux indisponible n'empêche pas l'affichage des
autres. Les erreurs renvoyées au client sont génériques — ni pile, ni URL amont, ni message brut.

## Gestion de l'inter-saison

Le basket s'arrête plusieurs mois : le site doit rester plein.

- **Classement** : si la saison courante n'a aucun match joué, afficher le classement final de la
  saison précédente, avec un bandeau « Inter-saison ».
- **Résultats** : remonter **mois par mois** (jusqu'à huit) pour retrouver les derniers résultats.
- **Matchs du jour** : une ligue sans match aujourd'hui affiche quand même ses six derniers
  résultats et sa prochaine journée. La section n'est jamais vide.
- **Fiche d'équipe** : les résultats et l'effectif basculent sur la saison précédente si besoin ;
  une équipe sans match officiel reçoit un message explicite, pas un bloc vide.
- **Code de saison EuroLeague** : la saison N **démarre en juillet de l'année N** (`E2026` =
  saison 2026-27). Se tromper d'un an, c'est afficher une saison vide tout l'automne.

## Règles de qualification affichées

| Ligue | Tableau | Zones |
| --- | --- | --- |
| NBA | Est / Ouest | 1–6 qualifiés directs, 7–10 play-in |
| WNBA | Est / Ouest | 1–8 en playoffs, **sur la ligue entière** |
| EuroLeague | tableau unique | 1–6 qualifiés directs, 7–10 play-in |

**Piège à traiter dès l'écriture :** le `playoffSeed` d'ESPN est renvoyé **par conférence**
(1..7 à l'Est, 1..8 à l'Ouest). L'utiliser tel quel comme rang de ligue place les quinze équipes
WNBA dans la zone « top 8 » — y compris celles à 8 victoires pour 35 défaites. Ne le retenir que
s'il forme une numérotation **unique sur toute la ligue** ; sinon, recalculer le rang au
pourcentage de victoires, puis à la différence de points.

## Statistiques d'équipe

ESPN publie **46 statistiques** par équipe. Les afficher toutes, traduites et rangées en Général,
Attaque, Défense et Totaux de la saison, plus un groupe « Autres » de secours si ESPN en ajoute.

Cinq exceptions, à écarter en le documentant : `gamesStarted`, `minutes` et `avgMinutes` ne sont
**jamais alimentés** au niveau de l'équipe (toujours 0 — afficher « 0 minute jouée » sur une saison
complète ressemble à un bug) ; `totalRebounds` et `threePointPct` sont des **doublons exacts** de
`rebounds` et `threePointFieldGoalPct`.

Les bilans détaillés (domicile, extérieur, conférence, division, dix derniers matchs, série,
moyennes de points, retard) ne figurent **que dans le classement**, pas sur la fiche d'équipe :
les y récupérer. Traduire au passage — ESPN livre la série en « L1 » et les pourcentages en
ratios (« .561 »).

L'API EuroLeague n'expose **aucune** statistique d'équipe : les recalculer à partir des matchs
joués, et les présenter dans la même mise en forme.

## « Aujourd'hui » à l'heure de Paris

Un match NBA à 19 h 30 à New York se joue à 1 h 30 à Paris. Pour la journée parisienne J,
interroger les jours ESPN **J-1 et J**, puis filtrer sur la date à Paris. Tous les horaires
affichés utilisent `Europe/Paris` ; les dates envoyées à ESPN utilisent `America/New_York`.

## Ce que le visiteur choisit (mémorisé dans son navigateur)

Même patron pour les deux : `useSyncExternalStore`, une clé `hoopshub:…` dans `localStorage`, un
événement maison pour la synchronisation entre composants et onglets, et un repli si le stockage
est refusé (navigation privée stricte).

1. **Équipe favorite** — choisie parmi **toutes** les équipes des trois ligues, mise en avant au
   classement, sur ses matchs et sur sa fiche. `localStorage` est modifiable par le visiteur :
   **valider** ce qu'on en relit (ligue en liste blanche, format d'identifiant, longueur du nom).
2. **Thème clair / sombre** — un bouton qui fait le tour de trois réglages : système, clair,
   sombre. La variante `dark:` de Tailwind suit **une classe sur `<html>`**, pas
   `prefers-color-scheme`, et un script inline (avec le nonce CSP) applique la classe **avant la
   première peinture** — sinon une page réglée en sombre s'affiche en clair le temps que React
   démarre.

## Sécurité

- **Validation stricte** de tout ce qui vient de l'URL : ligues en liste blanche ; identifiants
  d'équipe vérifiés **par format** (`^\d{1,7}$` pour ESPN, `^[A-Z]{2,4}$` pour l'EuroLeague)
  **puis par appartenance** à la liste des équipes de la ligue ; paramètres non prévus refusés
  (400) ; seul `GET` accepté sur `/api` (405 sinon).
- **CSP stricte avec nonce par requête**, posée dans `proxy.ts` sur les pages HTML.
- **Rate limiting** sur `/api` : 60 requêtes par minute et par IP.
- Les images passent toutes par l'optimiseur Next, avec une liste blanche d'hôtes. Le texte des
  flux RSS est réduit à du texte brut, **jamais injecté comme HTML**.

## Interface

- **Responsive** de 360 px à grand écran, sans aucun défilement horizontal de page. Les tableaux
  larges défilent dans leur propre conteneur, avec la colonne du nom en position collante.
- **Accessibilité** : sections titrées (`aria-labelledby`), onglets au patron WAI-ARIA (flèches,
  Home/End), information jamais portée par la seule couleur (doubler les zones du classement d'un
  texte `sr-only`), `aria-live` sur les scores, panneau d'équipe en `<dialog>` natif.
- **Animations** : respecter `prefers-reduced-motion` partout. Attention aux révélations au
  défilement (`whileInView`) : le contenu reste invisible tant qu'il n'est pas entré dans la
  fenêtre — ce qui vide la page pour un aperçu automatique, un PDF ou un robot qui ne défile pas.
- **Logos clair / sombre** : afficher les deux variantes et basculer en CSS, sans JavaScript ni
  flash au changement de thème. Ne pas passer `sizes` à `next/image` pour un logo de taille fixe :
  cela fait basculer sur le srcset responsive complet, dont le `src` pointe la variante **3840 px**
  — pour un logo de 24 px.

## Pièges de rendu à traiter dès l'écriture

- **Un hook de récupération réinitialise son état quand la ressource change.** Sans cela, il
  conserve la réponse du chemin précédent : le panneau d'une équipe affiche les matchs de celle
  qu'on venait de fermer, et comme la perspective est recalculée avec le nouvel identifiant,
  victoires, adversaires et scores sont tous faux.
- **Un onglet mémorisé dans l'ancre d'URL utilise `pushState`, pas `replaceState`** : avec
  `replaceState`, le bouton « précédent » quitte la page au lieu de revenir à l'onglet précédent.
  Écouter `popstate` en plus de `hashchange`.

## Conventions de code

- Commentaires **en français**, rares, et qui expliquent **pourquoi** — jamais ce que le code dit
  déjà. Un commentaire qui mérite d'exister documente un piège (le `playoffSeed` par conférence,
  la limite du Data Cache, la fenêtre horaire du direct EuroLeague).
- Noms de variables et de fonctions en anglais, textes visibles en français.
- Pas de dépendance ajoutée sans raison : ce qui tient en 20 lignes de code maison — un parseur
  RSS, par exemple — ne vaut pas un paquet npm.
- Messages de commit en français, style Conventional Commits (`feat(equipe): …`), le corps
  expliquant le pourquoi. **Un fichier par commit.** Aucune ligne d'attribution.

## Ordre de construction

1. Squelette Next.js + Tailwind, `leagues.ts`, `types/`, clients amont `server-only` avec cache,
   réessais et repli.
2. Page championnat : classement, puis résultats et calendrier. C'est là que se joue la
   normalisation, et la cohabitation des deux fournisseurs.
3. Direct : matchs du jour, rafraîchissement côté client, scores par quart-temps.
4. Accueil, fiche d'équipe.
5. Équipe favorite, thème.
6. Leaders, actualités, effectifs et statistiques complètes.
7. CSP, rate limiting, validation.
8. Animations en dernier : ce sont des finitions, pas des fondations.

Après chaque jalon : `npm run build` (types et lint compris) **et** un contrôle du rendu réel, en
clair **et** en sombre, en 390 px **et** en grand écran. Vérifier aussi le comportement
inter-saison : c'est le mode dans lequel le site passe le plus clair de l'année.

## Critères d'acceptation

- `npm run build`, `tsc --noEmit` et `eslint` passent sans erreur ni avertissement.
- Aucune URL d'API amont dans le bundle client (`grep -r "espn.com\|euroleague.net" .next/static`).
- Avec l'amont injoignable, le site affiche encore ses dernières données connues — et ne montre
  jamais de zéros.
- Les trois classements sont visibles **en entier** sur l'accueil, conférences comprises.
- Le sélecteur d'équipe favorite propose **toutes** les équipes des trois ligues.
- Exactement huit équipes WNBA sont marquées qualifiées, pas quinze.
- En inter-saison, aucune page n'est vide : chaque section montre soit la saison précédente, soit
  la prochaine journée, et le dit.
- Le thème sombre choisi survit au rechargement, sans flash blanc.
- Aucune page ne défile horizontalement à 360 px.
