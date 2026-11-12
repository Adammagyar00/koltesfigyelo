import { describe, expect, it } from 'vitest';

import { budgetStatuses, detectRecurring, savingTips, shiftMonth, summarizeMonth } from '../insights';
import type { Transaction } from '../types';

let n = 0;
const t = (date: string, amount: number, categoryId: string, counterparty = 'X', currency = 'HUF'): Transaction => ({
  id: String(n++),
  date,
  amount,
  currency,
  counterparty,
  description: '',
  bank: 'erste',
  categoryId,
  categorySource: 'rule',
  importedAt: 0,
});

describe('month helpers', () => {
  it('shifts across years', () => {
    expect(shiftMonth('2024-01', -1)).toBe('2023-12');
    expect(shiftMonth('2023-12', 1)).toBe('2024-01');
  });
});

describe('summarizeMonth', () => {
  it('sums spending per category, ignoring transfers and other currencies; refunds reduce spending', () => {
    const s = summarizeMonth(
      [
        t('2024-03-01', -10000, 'elelmiszer'),
        t('2024-03-02', -5000, 'elelmiszer'),
        t('2024-03-03', 2000, 'elelmiszer'), // visszatérítés
        t('2024-03-04', -3000, 'etterem'),
        t('2024-03-05', -50000, 'atvezetes'),
        t('2024-03-06', 400000, 'bevetel'),
        t('2024-03-07', -10, 'etterem', 'Y', 'EUR'),
        t('2024-02-28', -99999, 'elelmiszer'),
      ],
      '2024-03',
    );
    expect(s.spent).toBe(16000);
    expect(s.income).toBe(400000);
    expect(s.byCategory).toEqual([
      { categoryId: 'elelmiszer', total: 13000, count: 2 },
      { categoryId: 'etterem', total: 3000, count: 1 },
    ]);
    expect(s.otherCurrencyCount).toBe(1);
  });
});

describe('budgetStatuses', () => {
  it('warns based on pace, not only on the amount already spent', () => {
    const s = summarizeMonth([t('2024-03-10', -40000, 'etterem')], '2024-03');
    const [b] = budgetStatuses([{ categoryId: 'etterem', monthlyLimit: 60000 }], s, '2024-03-10');
    expect(b.ratio).toBeCloseTo(0.667, 2);
    expect(b.projected).toBeCloseTo(124000, -2);
    expect(b.state).toBe('warning');
  });

  it('marks over-budget', () => {
    const s = summarizeMonth([t('2024-03-10', -70000, 'etterem')], '2024-03');
    expect(budgetStatuses([{ categoryId: 'etterem', monthlyLimit: 60000 }], s, '2024-04-01')[0].state).toBe('over');
  });
});

describe('detectRecurring', () => {
  const months = ['2024-01', '2024-02', '2024-03', '2024-04'];

  it('finds monthly subscriptions with stable amounts', () => {
    const txs = months.map((m) => t(`${m}-05`, -4490, 'elofizetes', 'NETFLIX'));
    const r = detectRecurring(txs, '2024-04-20');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchant: 'NETFLIX', averageAmount: 4490, yearlyCost: 53880, months: 4 });
  });

  it('ignores frequent everyday purchases at the same place', () => {
    const txs = months.flatMap((m) => [1, 8, 15, 22].map((d) => t(`${m}-${String(d).padStart(2, '0')}`, -1500, 'etterem', 'STARBUCKS')));
    expect(detectRecurring(txs, '2024-04-25')).toEqual([]);
  });

  it('ignores cancelled subscriptions and varying amounts', () => {
    const old = months.map((m) => t(`${m}-05`, -4490, 'elofizetes', 'HBO'));
    const varying = months.map((m, i) => t(`${m}-05`, -(5000 + i * 3000), 'egyeb', 'VALTOZO'));
    expect(detectRecurring([...old, ...varying], '2024-07-01')).toEqual([]);
  });
});

describe('savingTips', () => {
  it('flags a category spike and mentions the frequency', () => {
    const txs: Transaction[] = [];
    for (const m of ['2024-01', '2024-02', '2024-03']) {
      txs.push(t(`${m}-10`, -20000, 'etterem', 'WOLT'), t(`${m}-11`, -60000, 'elelmiszer', 'LIDL'));
    }
    for (let d = 1; d <= 12; d++) txs.push(t(`2024-04-${String(d).padStart(2, '0')}`, -3500, 'etterem', 'WOLT'));
    const tips = savingTips(txs, '2024-04', '2024-04-30');
    const spike = tips.find((x) => x.id === 'spike:etterem')!;
    expect(spike.monthlySaving).toBe(42000 - 20000);
    expect(spike.body).toContain('12 alkalom');
  });

  it('is quiet when spending is normal', () => {
    const txs = ['2024-01', '2024-02', '2024-03', '2024-04'].map((m) => t(`${m}-10`, -20000, 'elelmiszer', 'LIDL'));
    expect(savingTips(txs, '2024-04', '2024-04-30')).toEqual([]);
  });
});

describe('savingTips – edge cases', () => {
  it('does not extrapolate fixed monthly charges early in the month', () => {
    const txs: Transaction[] = [];
    for (const m of ['2024-01', '2024-02', '2024-03', '2024-04']) {
      txs.push(t(`${m}-05`, -4490, 'elofizetes', 'NETFLIX'), t(`${m}-07`, -2390, 'elofizetes', 'SPOTIFY'));
    }
    const ids = savingTips(txs, '2024-04', '2024-04-12').map((x) => x.id);
    expect(ids.some((id) => id.startsWith('spike:elofizetes'))).toBe(false);
  });

  it('does not double count a spike and frequent eating out', () => {
    const txs: Transaction[] = [];
    for (const m of ['2024-01', '2024-02', '2024-03']) txs.push(t(`${m}-10`, -20000, 'etterem', 'WOLT'));
    for (let d = 1; d <= 12; d++) txs.push(t(`2024-04-${String(d).padStart(2, '0')}`, -3500, 'etterem', 'WOLT'));
    const tips = savingTips(txs, '2024-04', '2024-04-30').filter((x) => x.id.endsWith('etterem'));
    expect(tips).toHaveLength(1);
    expect(tips[0].id).toBe('spike:etterem');
  });
});
