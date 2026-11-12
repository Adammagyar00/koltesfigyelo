import { FALLBACK_EXPENSE, FALLBACK_INCOME, getCategory } from './categories';
import { EMPTY_PROFILE, findTransferPairs, matchOwnTransfer, TRANSFER_CATEGORY, type OwnProfile } from './own-transfers';
import { containsToken, merchantKey, normalize } from './text';
import type { CategorySource, ParsedTransaction, Rule, Transaction } from './types';

export interface CategoryAssignment {
  categoryId: string;
  categorySource: CategorySource;
  ruleId?: string;
}

/**
 * Szabályok sorrendje: a felhasználó saját szabályai mindig megelőzik az alapértelmezetteket,
 * azon belül a hosszabb (konkrétabb) minta nyer: "MOL BUBI" előbb, mint "MOL".
 */
export function sortRules(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
    if (b.pattern.length !== a.pattern.length) return b.pattern.length - a.pattern.length;
    return b.createdAt - a.createdAt;
  });
}

export function matchText(tx: Pick<ParsedTransaction, 'counterparty' | 'description'>): string {
  return normalize(`${tx.counterparty} ${tx.description}`);
}

/**
 * Egy tétel besorolása. Elsőként a saját számlák közötti átvezetést nézzük (saját név vagy
 * számlaszám a tételben), utána a (már rendezett) szabályokat.
 */
export function categorize(
  tx: ParsedTransaction,
  sortedRules: Rule[],
  profile: OwnProfile = EMPTY_PROFILE,
): CategoryAssignment {
  const own = matchOwnTransfer(tx, profile);
  if (own) return { categoryId: TRANSFER_CATEGORY, categorySource: 'rule', ruleId: `own:${own}` };
  const text = matchText(tx);
  // Kártyás visszatérítés (pl. "KÁRTYA HASZNÁLAT - JÓV"): a kereskedő kategóriájának költését csökkenti,
  // nem bevétel.
  const cardRefund = tx.amount > 0 && /\bKARTYA HASZNALAT\b|\bVISSZATERITES\b|\bREFUND\b/.test(text);
  for (const rule of sortedRules) {
    if (!containsToken(text, rule.pattern)) continue;
    const kind = getCategory(rule.categoryId).kind;
    // Egy kiadási kulcsszó ne sorolja kiadásnak a bejövő pénzt (pl. egy átutalást a Lidltől),
    // kivéve ha a felhasználó maga mondta így, vagy ha kártyás visszatérítésről van szó.
    if (rule.source === 'default' && kind === 'expense' && tx.amount > 0 && !cardRefund) continue;
    if (rule.source === 'default' && kind === 'income' && tx.amount < 0) continue;
    return { categoryId: rule.categoryId, categorySource: 'rule', ruleId: rule.id };
  }
  return { categoryId: tx.amount > 0 && !cardRefund ? FALLBACK_INCOME : FALLBACK_EXPENSE, categorySource: 'default' };
}

/**
 * Új szabályok után az összes tétel újrabesorolása. A kézzel beállított tételekhez nem nyúlunk.
 * A két bank közötti átutalás-párokat (pl. Erste → Wise) is átvezetésnek jelöli.
 * Csak a ténylegesen megváltozott tételeket adja vissza (ezeket kell menteni).
 */
export function recategorize(
  transactions: Transaction[],
  rules: Rule[],
  profile: OwnProfile = EMPTY_PROFILE,
): Transaction[] {
  const sorted = sortRules(rules);
  const assigned = new Map<string, CategoryAssignment>();
  const next = transactions.map((tx) => {
    if (tx.categorySource === 'user') return tx;
    const a = categorize(tx, sorted, profile);
    assigned.set(tx.id, a);
    return { ...tx, ...a };
  });
  for (const id of findTransferPairs(next)) {
    if (!assigned.get(id)?.ruleId?.startsWith('own:')) {
      assigned.set(id, { categoryId: TRANSFER_CATEGORY, categorySource: 'rule', ruleId: 'own:pair' });
    }
  }
  const changed: Transaction[] = [];
  for (const tx of transactions) {
    const a = assigned.get(tx.id);
    if (!a) continue;
    // A hiányzó ruleId lehet null vagy undefined (régebbi mentésekből) – ezeket azonosnak vesszük.
    const ruleChanged = (a.ruleId ?? null) !== (tx.ruleId ?? null);
    if (a.categoryId !== tx.categoryId || ruleChanged || a.categorySource !== tx.categorySource) {
      changed.push({ ...tx, ...a });
    }
  }
  return changed;
}

/** Kézi átsoroláskor javasolt szabályminta (a felhasználó szerkesztheti). */
export function suggestRulePattern(tx: Pick<ParsedTransaction, 'counterparty' | 'description'>): string {
  return merchantKey(tx.counterparty, tx.description);
}

/** Hány másik tételre illene egy minta – ezt mutatjuk a szabály mentése előtt. */
export function countMatches(transactions: Transaction[], pattern: string, excludeId?: string): number {
  const p = normalize(pattern);
  if (!p) return 0;
  return transactions.filter((t) => t.id !== excludeId && containsToken(matchText(t), p)).length;
}
