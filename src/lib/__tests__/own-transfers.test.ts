import { describe, expect, it } from 'vitest';

import { defaultRules } from '../categories';
import { categorize, recategorize, sortRules } from '../categorize';
import { findTransferPairs, matchOwnTransfer } from '../own-transfers';
import { summarizeMonth } from '../insights';
import type { Transaction } from '../types';

const profile = { names: ['Kovács Anna'], accounts: ['11600006-00000000-12345678', 'HU42 1177 3016 1111 1018 0000 0000'] };

let n = 0;
const t = (p: Partial<Transaction>): Transaction => ({
  id: String(n++),
  date: '2026-10-05',
  amount: -10000,
  currency: 'HUF',
  counterparty: '',
  description: '',
  bank: 'erste',
  categoryId: 'egyeb',
  categorySource: 'default',
  importedAt: 0,
  ...p,
});

describe('matchOwnTransfer', () => {
  it('matches own name in any order and without accents', () => {
    expect(matchOwnTransfer({ counterparty: 'KOVACS ANNA', description: '' }, profile)).toBe('name');
    expect(matchOwnTransfer({ counterparty: 'Anna Kovács', description: 'Átutalás' }, profile)).toBe('name');
  });

  it('two words of a longer name are enough ("Kovács Anna Mária" = "ANNA KOVÁCS")', () => {
    const p = { names: ['Kovács Anna Mária'], accounts: [] };
    expect(matchOwnTransfer({ counterparty: 'ANNA KOVÁCS', description: '' }, p)).toBe('name');
    expect(matchOwnTransfer({ counterparty: 'KOVÁCS PÉTERNÉ', description: '' }, p)).toBeNull();
  });

  it('ignores the own name in details (card holder, actual beneficiary)', () => {
    expect(
      matchOwnTransfer({ counterparty: 'Google Pay SMPLPAY*SHOP', description: 'KÁRTYA HASZNÁLAT Kártyabirtokos: Kovács Anna' }, profile),
    ).toBeNull();
  });

  it('does not match relatives with the same surname or a single word', () => {
    expect(matchOwnTransfer({ counterparty: 'Kovács Péter', description: '' }, profile)).toBeNull();
    expect(matchOwnTransfer({ counterparty: 'Kovács', description: '' }, { names: ['Kovács'], accounts: [] })).toBeNull();
  });

  it('matches own account numbers in any formatting, including IBAN and short 16-digit form', () => {
    expect(matchOwnTransfer({ counterparty: '', description: 'Átvezetés 11600006 00000000 12345678' }, profile)).toBe('account');
    expect(matchOwnTransfer({ counterparty: '', description: 'Számla: 1160000600000000-12345678' }, profile)).toBe('account');
    expect(matchOwnTransfer({ counterparty: '', description: 'Ellenszámla 11773016-11111018' }, profile)).toBe('account');
    expect(matchOwnTransfer({ counterparty: '', description: 'Ellenszámla 11773016-99999999' }, profile)).toBeNull();
  });
});

describe('categorize with own profile', () => {
  it('own transfers win over keyword rules and fallbacks, in both directions', () => {
    const rules = sortRules(defaultRules());
    expect(categorize(t({ counterparty: 'Kovács Anna', description: 'Megtakarítás', amount: -50000 }), rules, profile)).toEqual({
      categoryId: 'atvezetes',
      categorySource: 'rule',
      ruleId: 'own:name',
    });
    expect(categorize(t({ counterparty: 'KOVACS ANNA', amount: 50000 }), rules, profile).categoryId).toBe('atvezetes');
  });
});

describe('findTransferPairs / recategorize', () => {
  it('pairs an outgoing and incoming transfer between two banks within 2 days', () => {
    const out = t({ bank: 'erste', amount: -100000, date: '2026-10-05', description: 'Átutalás' });
    const inn = t({ bank: 'wise', amount: 100000, date: '2026-10-06', categoryId: 'bevetel' });
    const otherBankOld = t({ bank: 'wise', amount: 100000, date: '2026-10-20', categoryId: 'bevetel' });
    const sameBank = t({ bank: 'erste', amount: 100000, date: '2026-10-05', categoryId: 'bevetel' });
    expect([...findTransferPairs([out, inn, otherBankOld, sameBank])].sort()).toEqual([out.id, inn.id].sort());
  });

  it('marks pairs as transfers but keeps manual categories, and excludes them from summaries', () => {
    const out = t({ bank: 'erste', amount: -100000, description: 'Átutalás' });
    const inn = t({ bank: 'wise', amount: 100000, categoryId: 'bevetel' });
    const manual = t({ bank: 'mbh', amount: 100000, categoryId: 'bevetel', categorySource: 'user' });
    const shop = t({ counterparty: 'LIDL', amount: -5000 });
    const changed = recategorize([out, inn, manual, shop], defaultRules());
    const byId = Object.fromEntries(changed.map((c) => [c.id, c]));
    expect(byId[out.id]).toMatchObject({ categoryId: 'atvezetes', ruleId: 'own:pair' });
    expect(byId[inn.id]).toMatchObject({ categoryId: 'atvezetes', ruleId: 'own:pair' });
    expect(byId[manual.id]).toBeUndefined();
    const all = [out, inn, manual, shop].map((x) => byId[x.id] ?? x);
    const s = summarizeMonth(all, '2026-10');
    expect(s.spent).toBe(5000);
    expect(s.income).toBe(100000); // csak a kézzel bevételnek jelölt
  });
});
