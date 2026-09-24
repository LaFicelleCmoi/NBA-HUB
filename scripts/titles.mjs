/**
 * Relève le palmarès des Finales NBA et l'enregistre dans `lib/data/titles.json`.
 *
 * Deux sources, parce qu'aucune ne couvre tout :
 *
 * - **Wikidata** pour l'histoire (1947 à sa dernière saison renseignée). Chaque
 *   saison y désigne son vainqueur (P1346), et Wikidata rattache le titre à la
 *   *franchise actuelle* : les Lakers de Minneapolis comptent pour Los Angeles,
 *   les Royals de Rochester pour Sacramento. C'est la convention de la ligue.
 * - **ESPN** pour les saisons récentes, que Wikidata met du temps à renseigner :
 *   le champion est le vainqueur du dernier match portant la mention
 *   « NBA Finals ». Rien n'est deviné, tout vient d'un résultat réel.
 *
 * Les titres BAA (1947-1949) sont inclus : la NBA les comptabilise. Celui de
 * 1948 revient aux Baltimore Bullets, franchise disparue sans héritier — il
 * n'est donc attribué à personne et c'est volontaire.
 *
 * Usage : node scripts/titles.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "data");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const UA = "HoopsHub/1.0 (palmares)";

/* ------------------------------ Wikidata ------------------------------ */

/**
 * Deux requêtes plutôt qu'une : filtrer sur le libellé des saisons oblige
 * Wikidata à les parcourir toutes et dépasse son délai (504). Partir de la
 * ligue, elle, est immédiat.
 */
const QUERIES = [
  // NBA (1949-50 et après)
  `SELECT DISTINCT ?seasonLabel ?winnerLabel WHERE {
     ?season wdt:P3450 wd:Q155223 ; wdt:P1346 ?winner .
     SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
   }`,
  // BAA (1946-47 à 1948-49) : la NBA comptabilise officiellement ces titres.
  `SELECT DISTINCT ?seasonLabel ?winnerLabel WHERE {
     ?season wdt:P3450 wd:Q810343 ; wdt:P1346 ?winner .
     SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
   }`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Le point d'accès public est régulièrement saturé (502, 504) : on insiste. */
async function sparql(query, attempts = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": UA,
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return res.json();
    if (i >= attempts) throw new Error(`Wikidata → HTTP ${res.status} après ${attempts} tentatives`);
    // Le service annonce lui-même combien de temps attendre quand il limite.
    const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * i;
    console.warn(`  Wikidata ${res.status}, nouvelle tentative dans ${Math.round(wait / 1000)} s (${i}/${attempts - 1})…`);
    await sleep(wait);
  }
}

async function fromWikidata() {
  const titles = new Map();
  for (const query of QUERIES) {
    const { results } = await sparql(query);
    for (const row of results.bindings) {
      // « 1949–50 NBA season » : le titre se joue l'année de fin de saison.
      const start = Number(row.seasonLabel.value.slice(0, 4));
      if (Number.isFinite(start)) titles.set(start + 1, row.winnerLabel.value);
    }
  }
  return titles;
}

/* -------------------------------- ESPN -------------------------------- */

/** Champion d'une saison : vainqueur du dernier match marqué « NBA Finals ». */
async function championFromEspn(year) {
  let latest = null;
  for (const month of ["06", "07"]) {
    const res = await fetch(`${ESPN}/scoreboard?dates=${year}${month}&limit=1000`, {
      headers: { accept: "application/json", "user-agent": UA },
    });
    if (!res.ok) continue;
    const { events = [] } = await res.json();
    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!/NBA Finals/i.test(comp?.notes?.[0]?.headline ?? "")) continue;
      if (comp.status?.type?.state !== "post") continue;
      if (!latest || ev.date > latest.date) {
        latest = { date: ev.date, team: comp.competitors.find((c) => c.winner)?.team?.displayName };
      }
    }
  }
  return latest?.team;
}

/* ------------------------------ Assemblage ---------------------------- */

/**
 * Wikidata rattache presque tous les titres à la franchise actuelle, mais garde
 * ici le nom d'époque. La NBA, elle, crédite la franchise : le titre 1979 figure
 * au palmarès du Thunder, héritier direct des SuperSonics.
 *
 * Le titre 1948 des Baltimore Bullets n'a pas sa place ici : cette franchise a
 * été dissoute en 1954 sans successeur — les Wizards actuels descendent des
 * Chicago Packers, créés en 1961. Il reste donc non attribué, volontairement.
 */
const FRANCHISE_ALIASES = {
  "Seattle SuperSonics": "Oklahoma City Thunder",
};

const teams = JSON.parse(await readFile(join(DATA, "teams.json"), "utf8")).nba;
const byName = new Map(teams.map((t) => [t.name, t.id]));

const titles = await fromWikidata();
const lastKnown = Math.max(...titles.keys());
console.log(`Wikidata : ${titles.size} titres, jusqu'à ${lastKnown}`);

// Saisons terminées depuis : la finale se joue en juin, donc l'année en cours
// ne compte que si l'on est après.
const now = new Date();
const lastFinished = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
for (let year = lastKnown + 1; year <= lastFinished; year++) {
  const champion = await championFromEspn(year);
  if (!champion) {
    console.warn(`  ${year} : aucun champion trouvé chez ESPN`);
    continue;
  }
  titles.set(year, champion);
  console.log(`  ESPN ${year} : ${champion}`);
}

const byTeam = {};
const orphans = [];
for (const [year, name] of [...titles.entries()].sort((a, b) => a[0] - b[0])) {
  const id = byName.get(FRANCHISE_ALIASES[name] ?? name);
  if (!id) {
    orphans.push(`${year} ${name}`);
    continue;
  }
  (byTeam[id] ??= []).push(year);
}
for (const years of Object.values(byTeam)) years.sort((a, b) => b - a);

if (orphans.length) console.warn(`Franchises disparues, titre non attribué : ${orphans.join(", ")}`);

const total = Object.values(byTeam).reduce((n, y) => n + y.length, 0);
console.log(`${total} titres attribués à ${Object.keys(byTeam).length} franchises`);

await writeFile(join(DATA, "titles.json"), `${JSON.stringify({ nba: byTeam }, null, 2)}\n`);
console.log("titles.json écrit");
