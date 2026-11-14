import { getCategory } from './categories';
import { merchantKey, normalize, stripWalletPrefix } from './text';
import type { Transaction } from './types';

/**
 * Előfizetések és havonta ismétlődő terhelések felismerése a kivonatokból, és a következő
 * megújulás napjának becslése.
 *
 * Előfizetésnek számít:
 *  - minden "Előfizetések" kategóriájú kereskedő, már egyetlen terhelés alapján is (havi megújulást
 *    feltételezve – "feltételezett", amíg egy második hónap meg nem erősíti);
 *  - bármely más kereskedő, ha legalább két különböző hónapban, nagyjából azonos összeggel (±20%)
 *    és nagyjából havi időközzel terhelt.
 * A megújulás napja a terhelések hónapon belüli napjainak mediánja (a bank könyvelési napja, ezért
 * ±1-2 nap eltérés lehet a tényleges terheléstől).
 */

export interface Subscription {
  /** Azonosító (kereskedő-kulcs + pénznem) – ezzel lehet elrejteni. */
  key: string;
  name: string;
  /** Előfizetés (szolgáltatás) vagy egyéb rendszeres terhelés (lakbér, rezsi, bérlet, díj). */
  type: 'subscription' | 'recurring';
  categoryId: string;
  /** A legutóbbi terhelés összege (pozitív). */
  amount: number;
  currency: string;
  /** Hány különböző hónapban láttunk terhelést. */
  months: number;
  lastDate: string;
  /** A hónap melyik napján szokott megújulni. */
  dayOfMonth: number;
  /** A következő várható megújulás (YYYY-MM-DD). */
  nextDate: string;
  daysUntil: number;
  /** Legalább két hónap terhelése alapján (különben csak feltételezett). */
  confirmed: boolean;
  /** Régóta nem volt terhelés – valószínűleg lemondtad; nem küldünk rá értesítést. */
  stale: boolean;
  /** Ha a legutóbbi terhelés eltér az előzőtől (áremelés/árcsökkentés). */
  priceChange?: { from: number; to: number };
  yearlyCost: number;
}

/** Ennyi nap terhelés nélkül után tekintjük valószínűleg lemondottnak (két kimaradt ciklus). */
export const STALE_AFTER_DAYS = 70;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A hónap adott napja; ha a hónap rövidebb (pl. 31. februárban), az utolsó napja. */
function dateInMonth(year: number, month: number, day: number): string {
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(year, month, Math.min(day, dim));
}

function addMonths(year: number, month: number, delta: number): [number, number] {
  const idx = year * 12 + (month - 1) + delta;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/**
 * A következő megújulás: a megújulási nap a mai vagy a következő hónapban. Ha az adott hónapban
 * már volt terhelés (pl. pár nappal korábban könyvelték), akkor a következő hónapra esik.
 */
export function nextRenewal(dayOfMonth: number, lastDate: string, today: string): string {
  let [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (let i = 0; i < 3; i++) {
    const candidate = dateInMonth(y, m, dayOfMonth);
    const alreadyCharged = lastDate.slice(0, 7) === candidate.slice(0, 7) && daysBetween(lastDate, candidate) < 20;
    if (candidate >= today && !alreadyCharged) return candidate;
    [y, m] = addMonths(y, m, 1);
  }
  return dateInMonth(y, m, dayOfMonth);
}

/** Csupa nagybetűs szó címbetűssé ("NETFLIX" -> "Netflix"); a rövid márkanevek (HBO, KFC, BKK) maradnak. */
function tidyWord(w: string): string {
  if (w.length <= 3 || w !== w.toUpperCase() || !/[A-ZÁÉÍÓÖŐÚÜŰ]/.test(w)) return w;
  return w[0] + w.slice(1).toLowerCase();
}

/**
 * Megjelenítendő név: a kivonatban szereplő eredeti írásmód (ékezetekkel) azon szavai, amik a
 * kereskedő-kulcsot adják. Pl. "Albérlet – Kovács Anna" (kulcs: ALBERLET) -> "Albérlet".
 */
function displayName(key: string, tx: Transaction): string {
  const keyTokens = key.split(' ');
  const source = stripWalletPrefix(tx.counterparty) || tx.description.split(' | ')[0];
  const words = source.split(/[\s,;:/*#|–-]+/).filter(Boolean);
  const start = words.findIndex((w) => normalize(w).replace(/[^A-Z0-9.&]+$/g, '').replace(/\.+$/, '') === keyTokens[0]);
  const picked = start >= 0 ? words.slice(start, start + keyTokens.length) : keyTokens;
  return picked.map((w) => tidyWord(w.replace(/[.,;:]+$/, ''))).join(' ');
}

const SUBSCRIPTION_CATEGORIES = new Set(['elofizetes', 'szorakozas']);

export function detectSubscriptions(txs: Transaction[], today: string, ignored: string[] = []): Subscription[] {
  const hidden = new Set(ignored);
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.amount >= 0 || getCategory(t.categoryId).kind !== 'expense') continue;
    const mk = merchantKey(t.counterparty, t.description);
    if (!mk) continue;
    const key = `${mk}|${t.currency}`;
    if (hidden.has(key)) continue;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }

  const out: Subscription[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    // Havonta a legutolsó terhelés számít.
    const perMonth = new Map<string, Transaction>();
    for (const t of list) perMonth.set(t.date.slice(0, 7), t);
    const items = [...perMonth.values()];
    // Ha egy hónapban sokszor fizettél ugyanott (pl. kávézó, roller), az nem előfizetés.
    if (list.length > perMonth.size * 1.5) continue;

    const last = items[items.length - 1];
    const isSubscriptionCategory = last.categoryId === 'elofizetes';
    const amounts = items.map((t) => -t.amount);
    const med = median(amounts);
    const stableAmount = amounts.every((a) => Math.abs(a - med) <= med * 0.2);
    const gaps = items.slice(1).map((t, i) => daysBetween(items[i].date, t.date));
    const monthlyGap = gaps.length > 0 && median(gaps) >= 25 && median(gaps) <= 35;
    const recurring = items.length >= 2 && stableAmount && monthlyGap;
    if (!isSubscriptionCategory && !recurring) continue;

    const dayOfMonth = Math.round(median(items.slice(-6).map((t) => Number(t.date.slice(8, 10)))));
    const nextDate = nextRenewal(dayOfMonth, last.date, today);
    const amount = -last.amount;
    const prev = items.length >= 2 ? -items[items.length - 2].amount : null;
    out.push({
      key,
      name: displayName(key.split('|')[0], last),
      type: SUBSCRIPTION_CATEGORIES.has(last.categoryId) ? 'subscription' : 'recurring',
      categoryId: last.categoryId,
      amount,
      currency: last.currency,
      months: items.length,
      lastDate: last.date,
      dayOfMonth,
      nextDate,
      daysUntil: daysBetween(today, nextDate),
      confirmed: items.length >= 2,
      stale: daysBetween(last.date, today) > STALE_AFTER_DAYS,
      priceChange: prev !== null && Math.abs(prev - amount) > prev * 0.02 ? { from: prev, to: amount } : undefined,
      yearlyCost: Math.round(amount * 12),
    });
  }
  return out.sort((a, b) => Number(a.stale) - Number(b.stale) || a.nextDate.localeCompare(b.nextDate));
}

/** A következő `days` napban esedékes, nem lemondott előfizetések. */
export function upcomingRenewals(subs: Subscription[], days: number): Subscription[] {
  return subs.filter((s) => !s.stale && s.daysUntil <= days);
}

/**
 * Mikor szóljon az értesítés: a megújulás előtt `daysBefore` nappal, `hour` órakor (helyi idő).
 * Null, ha ez az időpont már elmúlt – ilyenkor, ha a megújulás még előttünk van, a megújulás napján szól.
 */
export function alertTime(nextDate: string, daysBefore: number, now: Date, hour = 9): Date | null {
  const [y, m, d] = nextDate.split('-').map(Number);
  const at = new Date(y, m - 1, d - daysBefore, hour, 0, 0);
  if (at.getTime() > now.getTime() + 60_000) return at;
  const sameDay = new Date(y, m - 1, d, hour, 0, 0);
  return sameDay.getTime() > now.getTime() + 60_000 ? sameDay : null;
}

/** Az értesítés szövege. */
export function alertText(sub: Pick<Subscription, 'name' | 'nextDate'>, at: Date): string {
  const [y, m, d] = sub.nextDate.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / DAY_MS);
  if (days <= 0) return `Ma megújul: ${sub.name}`;
  if (days === 1) return `Holnap megújul: ${sub.name}`;
  return `${days} nap múlva megújul: ${sub.name}`;
}
