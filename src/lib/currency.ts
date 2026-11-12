import type { Transaction } from './types';

export const BASE_CURRENCY = 'HUF';

/**
 * A nem forintos tételek forintra számolása az összesítésekhez (a megadott árfolyammal).
 * Az ismeretlen árfolyamú pénznemek változatlanok maradnak (azokat az összesítés külön jelzi).
 */
export function toBaseCurrency(txs: Transaction[], rates: Record<string, number>): Transaction[] {
  return txs.map((t) => {
    if (t.currency === BASE_CURRENCY) return t;
    const rate = rates[t.currency];
    if (!rate || rate <= 0) return t;
    return { ...t, amount: Math.round(t.amount * rate), currency: BASE_CURRENCY };
  });
}
