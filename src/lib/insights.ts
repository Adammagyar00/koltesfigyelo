import { getCategory } from './categories';
import { formatMoney } from './format';
import { merchantKey, normalize } from './text';
import type { Budget, Transaction } from './types';

/** 'YYYY-MM' */
export type MonthKey = string;

export const monthOf = (date: string): MonthKey => date.slice(0, 7);

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const isExpense = (t: Transaction) => t.amount < 0 && getCategory(t.categoryId).kind === 'expense';

export interface CategoryTotal {
  categoryId: string;
  total: number;
  count: number;
}

export interface MonthSummary {
  month: MonthKey;
  spent: number;
  income: number;
  byCategory: CategoryTotal[];
  /** Más pénznemű tételek száma, amik nincsenek benne az összegekben. */
  otherCurrencyCount: number;
}

/**
 * Havi összesítés egy pénznemben. A kiadás pozitív számként szerepel.
 * Az "Átvezetés" kategória (saját számlák között) nem számít se kiadásnak, se bevételnek.
 * A kiadási kategóriába sorolt jóváírás (pl. visszatérítés) csökkenti az adott kategória költését.
 */
export function summarizeMonth(
  txs: Transaction[],
  month: MonthKey,
  currency = 'HUF',
  /** Ha meg van adva, csak a hónap 1..untilDay napjait számolja (azonos időszak összevetéséhez). */
  untilDay?: number,
): MonthSummary {
  const map = new Map<string, CategoryTotal>();
  let spent = 0;
  let income = 0;
  let otherCurrencyCount = 0;
  for (const t of txs) {
    if (monthOf(t.date) !== month) continue;
    if (untilDay !== undefined && Number(t.date.slice(8, 10)) > untilDay) continue;
    if (t.currency !== currency) {
      otherCurrencyCount++;
      continue;
    }
    const kind = getCategory(t.categoryId).kind;
    if (kind === 'transfer') continue;
    if (kind === 'income') {
      income += t.amount;
      continue;
    }
    const cur = map.get(t.categoryId) ?? { categoryId: t.categoryId, total: 0, count: 0 };
    cur.total += -t.amount;
    if (t.amount < 0) cur.count++;
    map.set(t.categoryId, cur);
    spent += -t.amount;
  }
  const byCategory = [...map.values()].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  return { month, spent, income, byCategory, otherCurrencyCount };
}

export function monthlyTrend(txs: Transaction[], lastMonth: MonthKey, months = 6, currency = 'HUF'): MonthSummary[] {
  const out: MonthSummary[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(summarizeMonth(txs, shiftMonth(lastMonth, -i), currency));
  return out;
}

/** Napi kiadás a hónapban (index 0 = 1. nap), a kiadási kategóriák alapján; a visszatérítés csökkenti. */
export function dailySpending(txs: Transaction[], month: MonthKey, currency = 'HUF'): number[] {
  const days = new Array<number>(daysInMonth(month)).fill(0);
  for (const t of txs) {
    if (t.currency !== currency || monthOf(t.date) !== month) continue;
    if (getCategory(t.categoryId).kind !== 'expense') continue;
    days[Number(t.date.slice(8, 10)) - 1] -= t.amount;
  }
  return days.map((d) => Math.max(0, Math.round(d)));
}

export interface InvestmentMonth {
  month: MonthKey;
  /** Nettó befektetés/megtakarítás (kiutalások mínusz visszavételek), pozitív = félretett. */
  invested: number;
  income: number;
  /** A bevétel hányad részét tetted félre (null, ha nincs bevétel). */
  rate: number | null;
}

/** Havi nettó befektetés a "Befektetés, megtakarítás" kategória alapján. */
export function investmentTrend(txs: Transaction[], lastMonth: MonthKey, months = 6, currency = 'HUF'): InvestmentMonth[] {
  const out: InvestmentMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = shiftMonth(lastMonth, -i);
    let invested = 0;
    for (const t of txs) {
      if (t.categoryId === 'befektetes' && t.currency === currency && monthOf(t.date) === month) invested -= t.amount;
    }
    const income = summarizeMonth(txs, month, currency).income;
    out.push({ month, invested: Math.round(invested), income, rate: income > 0 ? invested / income : null });
  }
  return out;
}

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  categoryId: string;
  limit: number;
  spent: number;
  ratio: number;
  /** Várható hó végi költés az eddigi tempó alapján (csak az aktuális hónapban értelmes). */
  projected: number;
  state: BudgetState;
}

/**
 * @param today YYYY-MM-DD – ha a vizsgált hónap az aktuális, ebből számoljuk a tempót.
 */
export function budgetStatuses(budgets: Budget[], summary: MonthSummary, today: string): BudgetStatus[] {
  const isCurrent = monthOf(today) === summary.month;
  const dim = daysInMonth(summary.month);
  const day = isCurrent ? Number(today.slice(8, 10)) : dim;
  return budgets
    .filter((b) => b.monthlyLimit > 0)
    .map((b) => {
      const spent = summary.byCategory.find((c) => c.categoryId === b.categoryId)?.total ?? 0;
      const projected = isCurrent && day >= 5 ? (spent / day) * dim : spent;
      const ratio = spent / b.monthlyLimit;
      let state: BudgetState = 'ok';
      if (spent > b.monthlyLimit) state = 'over';
      else if (ratio >= 0.8 || projected > b.monthlyLimit * 1.05) state = 'warning';
      return { categoryId: b.categoryId, limit: b.monthlyLimit, spent, ratio, projected, state };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface RecurringCharge {
  merchant: string;
  categoryId: string;
  averageAmount: number;
  currency: string;
  months: number;
  lastDate: string;
  /** Becsült éves költség. */
  yearlyCost: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Havonta ismétlődő terhelések (előfizetések, rezsi, bérlet) felismerése:
 * ugyanaz a kereskedő legalább 3 különböző hónapban, nagyjából azonos összeggel (±20%),
 * nagyjából havi időközzel, és az utolsó terhelés 45 napon belüli (tehát még él).
 */
export function detectRecurring(txs: Transaction[], today: string): RecurringCharge[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const key = merchantKey(t.counterparty, t.description);
    if (!key) continue;
    const g = groups.get(`${key}|${t.currency}`) ?? [];
    g.push(t);
    groups.set(`${key}|${t.currency}`, g);
  }
  const todayMs = Date.parse(today);
  const result: RecurringCharge[] = [];
  for (const [k, list] of groups) {
    const months = new Set(list.map((t) => monthOf(t.date)));
    if (months.size < 3) continue;
    // Havonta egy reprezentatív tétel (a legnagyobb), hogy pl. a havi több kávé ne zavarjon be.
    const perMonth = new Map<string, Transaction>();
    for (const t of list) {
      const m = monthOf(t.date);
      const cur = perMonth.get(m);
      if (!cur || -t.amount > -cur.amount) perMonth.set(m, t);
    }
    // Ha egy hónapban sok tétel van ugyanott (pl. napi kávé), az nem előfizetés.
    if (list.length > perMonth.size * 1.5) continue;
    const items = [...perMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = items.map((t) => -t.amount);
    const med = median(amounts);
    if (amounts.some((a) => Math.abs(a - med) > med * 0.2)) continue;
    const gaps = items.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(items[i].date)) / 86_400_000);
    const medGap = median(gaps);
    if (medGap < 25 || medGap > 35) continue;
    const last = items[items.length - 1];
    if ((todayMs - Date.parse(last.date)) / 86_400_000 > 45) continue;
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    result.push({
      merchant: k.split('|')[0],
      categoryId: last.categoryId,
      averageAmount: Math.round(avg),
      currency: last.currency,
      months: items.length,
      lastDate: last.date,
      yearlyCost: Math.round(avg * 12),
    });
  }
  return result.sort((a, b) => b.yearlyCost - a.yearlyCost);
}

export interface SavingTip {
  id: string;
  icon: string;
  title: string;
  body: string;
  /** Becsült havi megtakarítás (alap pénznemben), ha számszerűsíthető. */
  monthlySaving?: number;
}

/**
 * Változó, csökkenthető kategóriák. Csak ezeknél van értelme a hó közbeni tempóból vetíteni;
 * a havonta egyszer esedékes tételeket (előfizetés, rezsi, lakbér) nem vetítjük fel.
 */
/** Budapesti havibérlet ára (Ft) – ha változik, itt kell átírni. */
export const BKK_MONTHLY_PASS = 8950;
/** Roller-, bicikli- és taxiszolgáltatások. */
const MICROMOBILITY = /\b(LIME|TIER|DOTT|BOLT|BUBI|UBER|TAXI|FOTAXI|FREENOW|FREE NOW)\b/;

const VARIABLE = new Set(['etterem', 'vasarlas', 'szorakozas', 'egyeb', 'haztartas']);

/**
 * Spórolási tippek az adott hónap és az előző 3 hónap alapján.
 * A tippek konkrét, forintosított javaslatok, nem általános tanácsok.
 */
export function savingTips(
  txs: Transaction[],
  month: MonthKey,
  today: string,
  budgets: Budget[] = [],
  currency = 'HUF',
): SavingTip[] {
  const tips: SavingTip[] = [];
  const cur = summarizeMonth(txs, month, currency);
  const prev = [1, 2, 3].map((i) => summarizeMonth(txs, shiftMonth(month, -i), currency));
  const prevWithData = prev.filter((p) => p.spent > 0);
  const isCurrent = monthOf(today) === month;
  const dim = daysInMonth(month);
  const day = isCurrent ? Number(today.slice(8, 10)) : dim;
  const scale = (v: number) => (isCurrent && day >= 5 ? (v / day) * dim : v);
  const fmt = (n: number) => formatMoney(n, currency);

  // 1) Kategóriák, amik jelentősen meghaladják az előző hónapok átlagát.
  if (prevWithData.length >= 2) {
    for (const c of cur.byCategory) {
      if (!VARIABLE.has(c.categoryId)) continue;
      const avg =
        prevWithData.reduce((s, p) => s + (p.byCategory.find((x) => x.categoryId === c.categoryId)?.total ?? 0), 0) /
        prevWithData.length;
      const projected = scale(c.total);
      if (avg > 0 && projected > avg * 1.25 && projected - avg > 5000) {
        const cat = getCategory(c.categoryId);
        const pct = Math.round((projected / avg - 1) * 100);
        tips.push({
          id: `spike:${c.categoryId}`,
          icon: cat.icon,
          title: `${cat.name}: ${pct}%-kal több a szokásosnál`,
          body: isCurrent
            ? `Ezzel a tempóval a hónap végére kb. ${fmt(projected)} lesz, az elmúlt hónapok átlaga ${fmt(avg)}.`
            : `Ebben a hónapban ${fmt(c.total)} ment el, az előző hónapok átlaga ${fmt(avg)}.`,
          monthlySaving: Math.round(projected - avg),
        });
      }
    }
  }

  // 2) Gyakori apró kiadások (kávé, ételrendelés): "ha a felére csökkented".
  // Ha ugyanerre a kategóriára már van "kiugrás" tipp, ahhoz fűzzük hozzá, hogy ne számoljuk kétszer.
  const eating = cur.byCategory.find((c) => c.categoryId === 'etterem');
  if (eating && eating.count >= 8) {
    const perItem = eating.total / eating.count;
    const monthlyCount = Math.round(scale(eating.count));
    const saving = (monthlyCount / 2) * perItem;
    const spike = tips.find((t) => t.id === 'spike:etterem');
    if (spike) {
      spike.body += ` ${monthlyCount} alkalom, átlagosan ${fmt(perItem)}.`;
    } else tips.push({
      id: 'frequent:etterem',
      icon: '☕',
      title: `${monthlyCount} alkalom étteremben, kávézóban vagy rendelésnél`,
      body: `Átlagosan ${fmt(perItem)} alkalmanként. Ha a felére csökkented, havonta kb. ${fmt(saving)}, évente ${fmt(saving * 12)} marad nálad.`,
      monthlySaving: Math.round(saving),
    });
  }

  // 3) Ismétlődő terhelések / előfizetések.
  const recurring = detectRecurring(txs, today).filter((r) => r.currency === currency);
  const subs = recurring.filter((r) => r.categoryId === 'elofizetes' || r.categoryId === 'szorakozas' || r.categoryId === 'egyeb');
  if (subs.length > 0) {
    const monthly = subs.reduce((s, r) => s + r.averageAmount, 0);
    const names = subs.slice(0, 4).map((r) => `${r.merchant} (${fmt(r.averageAmount)})`).join(', ');
    tips.push({
      id: 'subscriptions',
      icon: '🔁',
      title: `${subs.length} rendszeres előfizetés: havi ${fmt(monthly)}`,
      body: `${names}${subs.length > 4 ? ', …' : ''}. Ez évente ${fmt(monthly * 12)}. Nézd át, melyiket használod ténylegesen.`,
      monthlySaving: subs[0].averageAmount,
    });
  }

  // 3/b) Roller és taxi a BKK-bérlethez képest.
  const micro = txs.filter(
    (t) =>
      t.currency === currency &&
      t.amount < 0 &&
      monthOf(t.date) === month &&
      t.categoryId === 'kozlekedes' &&
      MICROMOBILITY.test(normalize(`${t.counterparty} ${t.description}`)),
  );
  const hasPass = txs.some(
    (t) => monthOf(t.date) === month && t.amount < 0 && /\bBKK\b|BERLET/.test(normalize(`${t.counterparty} ${t.description}`)),
  );
  const microTotal = micro.reduce((s, t) => s - t.amount, 0);
  const microProjected = scale(microTotal);
  if (!hasPass && micro.length >= 4 && microProjected > BKK_MONTHLY_PASS) {
    tips.push({
      id: 'transport:pass',
      icon: '🛴',
      title: `Roller és taxi: ${micro.length} út, ${fmt(microTotal)} ebben a hónapban`,
      body:
        `${isCurrent ? `Ezzel a tempóval a hónap végére kb. ${fmt(microProjected)} lesz. ` : ''}` +
        `Egy BKK-havibérlet kb. ${fmt(BKK_MONTHLY_PASS)}: ha az utak nagy részét tömegközlekedéssel tennéd meg, ` +
        `havonta kb. ${fmt(microProjected - BKK_MONTHLY_PASS)} maradna nálad.`,
      monthlySaving: Math.round(microProjected - BKK_MONTHLY_PASS),
    });
  }

  // 4) Bankköltség.
  const fees = cur.byCategory.find((c) => c.categoryId === 'dijak');
  if (fees && fees.total >= 1000) {
    tips.push({
      id: 'fees',
      icon: '🏦',
      title: `${fmt(fees.total)} bankköltség ebben a hónapban`,
      body: 'Érdemes összevetni a számlacsomagodat egy olcsóbbal, vagy megnézni, melyik díj kerülhető el (pl. készpénzfelvétel, SMS-értesítő).',
      monthlySaving: Math.round(fees.total * 0.5),
    });
  }

  // 5) Keret túllépése várható.
  for (const b of budgetStatuses(budgets, cur, today)) {
    if (b.state === 'ok') continue;
    const cat = getCategory(b.categoryId);
    const remaining = b.limit - b.spent;
    const daysLeft = dim - day;
    tips.push({
      id: `budget:${b.categoryId}`,
      icon: '⚠️',
      title:
        b.state === 'over'
          ? `${cat.name}: túllépted a keretet ${fmt(b.spent - b.limit)}-tal`
          : `${cat.name}: a keret ${Math.round(b.ratio * 100)}%-a elfogyott`,
      body:
        b.state === 'over' || !isCurrent || daysLeft <= 0
          ? `Keret: ${fmt(b.limit)}, elköltve: ${fmt(b.spent)}.`
          : `Még ${fmt(Math.max(0, remaining))} maradt ${daysLeft} napra, ez napi ${fmt(Math.max(0, remaining) / daysLeft)}.`,
    });
  }

  return tips.sort((a, b) => (b.monthlySaving ?? 0) - (a.monthlySaving ?? 0));
}

