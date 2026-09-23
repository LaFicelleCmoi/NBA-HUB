/** Utilitaires de dates — tout l'affichage se fait en Europe/Paris. */

export const TZ = "Europe/Paris";
const US_TZ = "America/New_York";

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Clé de jour « YYYY-MM-DD » dans le fuseau de Paris. */
export function parisDayKey(date: Date | string = new Date()): string {
  const { y, m, d } = partsIn(new Date(date), TZ);
  return `${y}-${m}-${d}`;
}

/** Date « YYYYMMDD » (fuseau de New York) utilisée par l'API ESPN. */
export function espnDay(date: Date): string {
  const { y, m, d } = partsIn(date, US_TZ);
  return `${y}${m}${d}`;
}

/** Mois « YYYYMM » (fuseau de New York). */
export function espnMonth(date: Date): string {
  const { y, m } = partsIn(date, US_TZ);
  return `${y}${m}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDay = (iso: string) => capitalize(dayFmt.format(new Date(iso)));
export const formatShortDay = (iso: string) => shortDayFmt.format(new Date(iso));
export const formatFullDate = (iso: string) => fullFmt.format(new Date(iso));

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
