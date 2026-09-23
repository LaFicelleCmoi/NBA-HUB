/**
 * Relève l'ossature du site chez les fournisseurs et l'enregistre dans
 * `lib/data/`. Ces fichiers servent de repli : quand une API amont ne répond
 * pas, le site affiche ces données plutôt qu'une page vide.
 *
 * Les matchs (« recent », « upcoming ») sont volontairement écartés : ils se
 * périment en quelques heures, et une affiche périmée vaut moins qu'une
 * section vide qui le dit.
 *
 * Usage : lancer le site en local, puis
 *   node scripts/snapshot.mjs [http://localhost:3000]
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "data");
const LEAGUES = ["nba", "wnba", "euroleague"];

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
};

const save = async (name, data) => {
  await mkdir(OUT, { recursive: true });
  const file = join(OUT, name);
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${name.padEnd(22)} ${(JSON.stringify(data).length / 1024).toFixed(0)} Ko`);
};

const teams = {};
const standings = {};
const leaders = {};
const details = {};

for (const league of LEAGUES) {
  teams[league] = await get(`/api/${league}/teams`);
  standings[league] = await get(`/api/${league}/standings`);
  leaders[league] = await get(`/api/${league}/leaders`);
  details[league] = {};
  for (const team of teams[league]) {
    const d = await get(`/api/${league}/teams/${team.id}`);
    // Sans les matchs : ils se périment trop vite pour être versionnés.
    delete d.recent;
    delete d.upcoming;
    details[league][team.id] = d;
  }
  console.log(`${league} : ${teams[league].length} équipes relevées`);
}

await save("teams.json", teams);
await save("standings.json", standings);
await save("leaders.json", leaders);
await save("team-details.json", details);
