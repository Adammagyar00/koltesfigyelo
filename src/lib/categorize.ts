import { FALLBACK_EXPENSE, FALLBACK_INCOME, getCategory } from './categories';
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

/** Egy tétel besorolása a (már rendezett) szabályok alapján. */
export function categorize(tx: ParsedTransaction, sortedRules: Rule[]): CategoryAssignment {
  const text = matchText(tx);
  for (const rule of sortedRules) {
    if (!containsToken(text, rule.pattern)) continue;
    const kind = getCategory(rule.categoryId).kind;
    // Egy kiadási kulcsszó ne sorolja kiadásnak a bejövő pénzt (pl. visszatérítés a Lidltől),
    // kivéve ha a felhasználó maga mondta így.
    if (rule.source === 'default' && kind === 'expense' && tx.amount > 0) continue;
    if (rule.source === 'default' && kind === 'income' && tx.amount < 0) continue;
    return { categoryId: rule.categoryId, categorySource: 'rule', ruleId: rule.id };
  }
  return { categoryId: tx.amount > 0 ? FALLBACK_INCOME : FALLBACK_EXPENSE, categorySource: 'default' };
}

/**
 * Új szabályok után az összes tétel újrabesorolása. A kézzel beállított tételekhez nem nyúlunk.
 * Csak a ténylegesen megváltozott tételeket adja vissza (ezeket kell menteni).
 */
export function recategorize(transactions: Transaction[], rules: Rule[]): Transaction[] {
  const sorted = sortRules(rules);
  const changed: Transaction[] = [];
  for (const tx of transactions) {
    if (tx.categorySource === 'user') continue;
    const a = categorize(tx, sorted);
    if (a.categoryId !== tx.categoryId || a.ruleId !== tx.ruleId || a.categorySource !== tx.categorySource) {
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
