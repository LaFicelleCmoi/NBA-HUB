/**
 * Relève le palmarès NBA et WNBA — titres de champion et titres de conférence —
 * et l'enregistre dans `lib/data/titles.json` et `lib/data/conference-titles.json`.
 *
 * Source : Wikipédia (anglais), pages « List of NBA champions » et
 * « WNBA Finals ». Chacune tient un tableau *par franchise* des finales
 * gagnées et perdues. C'est le point décisif : la filiation des franchises y
 * est déjà résolue — les Lakers de Minneapolis comptent pour Los Angeles, les
 * SuperSonics pour Oklahoma City, le Shock de Detroit pour Dallas —, selon la
 * convention des ligues. Wikidata, utilisé auparavant, n'a presque rien sur la
 * WNBA et se trompait de finaliste en 1951.
 *
 * Titre de conférence = place en finale, mais seulement quand la finale
 * opposait bel et bien les champions des deux conférences :
 *
 * - NBA : depuis 1971, année de création des conférences. Avant, les
 *   finalistes étaient champions de *division*, un autre titre.
 * - WNBA : de 1999 à 2015, seules saisons à finales de conférence. En 1997 et
 *   1998, les deux finalistes venaient parfois de la même conférence ; depuis
 *   2016, les huit qualifiées sont classées sans tenir compte des conférences.
 *
 * Les franchises disparues (Baltimore Bullets 1948, Comets de Houston…) n'ont
 * pas d'héritier : leurs titres ne sont attribués à personne, volontairement.
 *
 * Usage : node scripts/titles.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "data");

const SOURCES = {
  nba: { page: "List_of_NBA_champions", conference: (y) => y >= 1971 },
  wnba: { page: "WNBA_Finals", conference: (y) => y >= 1999 && y <= 2015 },
};

/**
 * Noms de franchise qui diffèrent entre Wikipédia et ESPN. La ligne du Shock
 * garde son ancien nom sur Wikipédia, mais la franchise est l'actuelle Dallas.
 */
const ALIASES = {
  "Detroit Shock": "Dallas Wings",
  "Los Angeles Clippers": "LA Clippers",
};

async function wikitext(page) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikipédia ${page} → HTTP ${res.status}`);
  return (await res.json()).parse.wikitext;
}

/** Années citées dans une cellule (`{{nbafy|1957}}`, `[[2011 WNBA Finals|2011]]`…). */
const years = (cell) => [...new Set((cell.match(/\b(?:19[4-9]\d|20\d\d)\b/g) ?? []).map(Number))];

/**
 * Le tableau par franchise est le seul à porter la colonne « Year(s) won ».
 * Chaque ligne : le nom de la franchise, puis une ligne de cellules dont les
 * deux dernières sont les années gagnées et perdues.
 */
function franchiseTable(text) {
  const start = text.lastIndexOf("{|", text.indexOf("Year(s) won"));
  const table = text.slice(start, text.indexOf("\n|}", start));
  const rows = [];
  for (const chunk of table.split(/\n\|-[^\n]*/).slice(1)) {
    const name = chunk.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/)?.[1];
    const cells = chunk.split("\n").filter(Boolean).at(-1)?.split("||") ?? [];
    if (!name || cells.length < 2) continue;
    rows.push({ name: name.trim(), won: years(cells.at(-2)), lost: years(cells.at(-1)) });
  }
  if (rows.length < 10) throw new Error("tableau des franchises introuvable ou incomplet");
  return rows;
}

const teams = JSON.parse(await readFile(join(DATA, "teams.json"), "utf8"));
const titles = {};
const conferences = {};

for (const [league, { page, conference }] of Object.entries(SOURCES)) {
  const byName = new Map(teams[league].map((t) => [t.name, t.id]));
  const rows = franchiseTable(await wikitext(page));
  const orphans = [];
  titles[league] = {};
  conferences[league] = {};

  for (const { name, won, lost } of rows) {
    const id = byName.get(ALIASES[name] ?? name);
    if (!id) {
      orphans.push(name);
      continue;
    }
    const desc = (list) => list.sort((a, b) => b - a);
    if (won.length) titles[league][id] = desc(won);
    const conf = [...won, ...lost].filter(conference);
    if (conf.length) conferences[league][id] = desc(conf);
  }

  const count = (o) => Object.values(o).reduce((n, y) => n + y.length, 0);
  console.log(
    `${league} : ${count(titles[league])} titres, ${count(conferences[league])} titres de conférence` +
      (orphans.length ? ` — franchises disparues, non attribuées : ${orphans.join(", ")}` : ""),
  );
}

await writeFile(join(DATA, "titles.json"), `${JSON.stringify(titles, null, 2)}\n`);
await writeFile(join(DATA, "conference-titles.json"), `${JSON.stringify(conferences, null, 2)}\n`);
console.log("titles.json et conference-titles.json écrits");
