import { describe, expect, it, vi } from 'vitest';

import { validateBackup } from '../../services/data';
import { allCategories, getCategory, newCustomCategory, setCustomCategories } from '../categories';

// A vi.mock-ot a Vitest az importok elé emeli.
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

describe('custom categories', () => {
  it('registers custom categories before "Egyéb" and resolves them by id', () => {
    const c = newCustomCategory('Roller', '🛴', []);
    setCustomCategories([c]);
    const ids = allCategories().map((x) => x.id);
    expect(ids.indexOf(c.id)).toBe(ids.indexOf('egyeb') - 1);
    expect(getCategory(c.id).name).toBe('Roller');
    setCustomCategories([]);
    expect(getCategory(c.id).id).toBe('egyeb');
  });
});

describe('validateBackup', () => {
  const good = {
    app: 'koltesfigyelo',
    version: 1,
    exportedAt: '2026-11-12T10:00:00Z',
    transactions: [{ id: 'a', date: '2026-10-01', amount: -100, currency: 'HUF', counterparty: '', description: '', bank: 'erste', categoryId: 'egyeb', categorySource: 'default', importedAt: 0 }],
    rules: [{ id: 'u', pattern: 'LIDL', categoryId: 'elelmiszer', source: 'user', createdAt: 1 }, { id: 'd', pattern: 'X', categoryId: 'egyeb', source: 'default', createdAt: 0 }],
    budgets: [],
    profile: { names: ['Teszt Elek'], accounts: [] },
    settings: { reminder: true },
  };

  it('accepts a valid backup and fills in defaults', () => {
    const b = validateBackup(good);
    expect(b.transactions).toHaveLength(1);
    expect(b.rules.map((r) => r.id)).toEqual(['u']); // csak a saját szabályok
    expect(b.settings.reminder).toBe(true);
    expect(b.settings.rates.EUR).toBeGreaterThan(0);
  });

  it('rejects foreign or broken files with a Hungarian message', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow('Ez nem a Költésfigyelő mentésfájlja.');
    expect(() => validateBackup({ ...good, transactions: [{ id: 'a', date: 'tegnap', amount: 'x' }] })).toThrow('sérült');
  });
});
