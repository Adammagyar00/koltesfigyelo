import { describe, expect, it } from 'vitest';

import { defaultRules } from '../categories';
import { categorize, countMatches, recategorize, sortRules, suggestRulePattern } from '../categorize';
import { containsToken, merchantKey, normalize } from '../text';
import type { ParsedTransaction, Rule, Transaction } from '../types';

const rules = sortRules(defaultRules());
const tx = (counterparty: string, amount = -1000, description = ''): ParsedTransaction => ({
  id: counterparty,
  date: '2024-01-01',
  amount,
  currency: 'HUF',
  counterparty,
  description,
  bank: 'erste',
});

describe('text helpers', () => {
  it('normalizes accents and case', () => {
    expect(normalize('  Árvíztűrő   tükörfúrógép ')).toBe('ARVIZTURO TUKORFUROGEP');
  });

  it('matches on token boundaries only', () => {
    expect(containsToken('MOL TOLTOALLOMAS', 'MOL')).toBe(true);
    expect(containsToken('MOLNAR ES TARSA', 'MOL')).toBe(false);
    expect(containsToken('DOHANYBOLT 12', 'BOLT.EU')).toBe(false);
    expect(containsToken('APPLE.COM/BILL CORK', 'APPLE.COM/BILL')).toBe(true);
  });

  it('derives a merchant key from noisy card descriptions', () => {
    expect(merchantKey('', 'WOLT HU 1234 BUDAPEST')).toBe('WOLT');
    expect(merchantKey('LIDL MAGYARORSZAG BT', '')).toBe('LIDL');
    expect(merchantKey('DM-DROGERIE MARKT KFT', '')).toBe('DM-DROGERIE');
    expect(merchantKey('H&M HENNES', '')).toBe('H&M HENNES');
    expect(merchantKey('', '2024.01.02 1234')).toBe('');
  });
});

describe('categorize with default rules', () => {
  it.each([
    ['LIDL MAGYARORSZAG BT', 'elelmiszer'],
    ['WOLT', 'etterem'],
    ['MOL TOLTOALLOMAS 123', 'kozlekedes'],
    ['MOL BUBI', 'kozlekedes'],
    ['NETFLIX.COM', 'elofizetes'], // a pont szóhatár
    ['Netflix', 'elofizetes'],
    ['MVM Next Energiakereskedelmi', 'rezsi'],
    ['Molnár Péter', 'egyeb'],
    ['DOHÁNYBOLT', 'egyeb'],
  ])('%s -> %s', (name, expected) => {
    expect(categorize(tx(name), rules).categoryId).toBe(expected);
  });

  it('uses the description too', () => {
    expect(categorize(tx('', -1200, 'Számlavezetési díj'), rules).categoryId).toBe('dijak');
  });

  it('does not treat a refund from a shop as spending', () => {
    expect(categorize(tx('LIDL', 2500), rules).categoryId).toBe('bevetel');
  });

  it('falls back to income/other by sign', () => {
    expect(categorize(tx('Ismeretlen', 5000), rules)).toEqual({ categoryId: 'bevetel', categorySource: 'default' });
    expect(categorize(tx('Ismeretlen', -5000), rules)).toEqual({ categoryId: 'egyeb', categorySource: 'default' });
  });

  it('prefers user rules over default ones', () => {
    const user: Rule = { id: 'u1', pattern: 'LIDL', categoryId: 'haztartas', source: 'user', createdAt: 1 };
    const r = categorize(tx('LIDL MAGYARORSZAG'), sortRules([...defaultRules(), user]));
    expect(r).toEqual({ categoryId: 'haztartas', categorySource: 'rule', ruleId: 'u1' });
  });
});

describe('recategorize', () => {
  const base = (p: Partial<Transaction>): Transaction => ({
    ...tx('X'),
    categoryId: 'egyeb',
    categorySource: 'default',
    importedAt: 0,
    ...p,
  });

  it('updates rule/default transactions but never manual ones', () => {
    const txs = [
      base({ id: 'a', counterparty: 'KISBOLT ABC' }),
      base({ id: 'b', counterparty: 'KISBOLT ABC', categoryId: 'vasarlas', categorySource: 'user' }),
      base({ id: 'c', counterparty: 'MASIK' }),
    ];
    const user: Rule = { id: 'u', pattern: 'KISBOLT', categoryId: 'elelmiszer', source: 'user', createdAt: 1 };
    const changed = recategorize(txs, [...defaultRules(), user]);
    expect(changed.map((t) => [t.id, t.categoryId])).toEqual([['a', 'elelmiszer']]);
    expect(countMatches(txs, 'kisbolt', 'a')).toBe(1);
  });

  it('suggests a usable rule pattern', () => {
    expect(suggestRulePattern({ counterparty: 'KISBOLT ABC KFT', description: '' })).toBe('KISBOLT');
  });
});
