import { describe, expect, it } from 'vitest';

import { defaultRules } from '../categories';
import { recategorize } from '../categorize';
import { toBaseCurrency } from '../currency';
import { BKK_MONTHLY_PASS, investmentTrend, savingTips, summarizeMonth } from '../insights';
import type { Transaction } from '../types';

let n = 0;
const t = (p: Partial<Transaction>): Transaction => ({
  id: String(n++),
  date: '2026-10-05',
  amount: -1000,
  currency: 'HUF',
  counterparty: '',
  description: '',
  bank: 'erste',
  categoryId: 'egyeb',
  categorySource: 'default',
  importedAt: 0,
  ...p,
});

describe('savings netting', () => {
  it('money coming back from the savings account offsets the deposit, not income', () => {
    const iban = 'HU35116000060000000233333333';
    const deposit = t({ amount: -6000, counterparty: 'Erste CélBetét Megtakarítási Számla', description: `ÁTUTALÁS SAJÁT SZÁMLÁRA | Számla: ${iban}` });
    const back = t({ amount: 1000, counterparty: 'Teszt Elek', description: `SAJÁT SZÁMLÁRÓL INDÍTOTT | Számla: ${iban}`, categoryId: 'bevetel' });
    const salary = t({ amount: 300000, counterparty: 'Munkahely Kft', description: 'Munkabér', categoryId: 'bevetel' });
    const changed = new Map(recategorize([deposit, back, salary], defaultRules()).map((c) => [c.id, c]));
    const all = [deposit, back, salary].map((x) => changed.get(x.id) ?? x);
    expect(all.map((x) => x.categoryId)).toEqual(['befektetes', 'befektetes', 'bevetel']);
    const [oct] = investmentTrend(all, '2026-10', 1);
    expect(oct).toMatchObject({ invested: 5000, income: 300000 });
    expect(oct.rate).toBeCloseTo(5000 / 300000);
  });
});

describe('toBaseCurrency', () => {
  it('converts foreign currencies with the given rates and leaves unknown ones', () => {
    const txs = [t({ amount: -12.5, currency: 'EUR', categoryId: 'elofizetes' }), t({ amount: -10, currency: 'JPY' }), t({ amount: -1000 })];
    const out = toBaseCurrency(txs, { EUR: 400 });
    expect(out.map((x) => [x.amount, x.currency])).toEqual([[-5000, 'HUF'], [-10, 'JPY'], [-1000, 'HUF']]);
    const s = summarizeMonth(out, '2026-10');
    expect(s.spent).toBe(6000);
    expect(s.otherCurrencyCount).toBe(1);
  });
});

describe('transport tip', () => {
  const ride = (d: number, amount: number, name: string) =>
    t({ date: `2026-10-${String(d).padStart(2, '0')}`, amount, counterparty: name, categoryId: 'kozlekedes' });

  it('suggests a monthly pass when scooters and taxis cost more', () => {
    const txs = [ride(2, -1200, 'Google Pay LIME*2 UT'), ride(6, -3100, 'UBER *TRIP'), ride(9, -2400, 'UBER *TRIP'), ride(12, -1500, 'LIME*RIDE'), ride(20, -900, 'LIME*RIDE')];
    const tip = savingTips(txs, '2026-10', '2026-10-31').find((x) => x.id === 'transport:pass');
    expect(tip?.monthlySaving).toBe(9100 - BKK_MONTHLY_PASS);
  });

  it('stays quiet when a pass was already bought or rides are few', () => {
    const rides = [ride(2, -4000, 'UBER'), ride(6, -4000, 'UBER'), ride(9, -4000, 'UBER'), ride(12, -4000, 'UBER')];
    const pass = t({ date: '2026-10-01', amount: -8950, counterparty: 'BKK', description: 'Havibérlet', categoryId: 'kozlekedes' });
    expect(savingTips([...rides, pass], '2026-10', '2026-10-31').some((x) => x.id === 'transport:pass')).toBe(false);
    expect(savingTips(rides.slice(0, 3), '2026-10', '2026-10-31').some((x) => x.id === 'transport:pass')).toBe(false);
  });
});
