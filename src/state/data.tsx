import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { defaultRules } from '@/lib/categories';
import { categorize, recategorize, sortRules } from '@/lib/categorize';
import { normalize } from '@/lib/text';
import type { Budget, ParsedTransaction, Rule, Transaction } from '@/lib/types';
import * as store from '@/services/data';

interface ImportOutcome {
  added: number;
  duplicates: number;
}

interface DataState {
  loading: boolean;
  error: string | null;
  /** Dátum szerint csökkenő sorrendben. */
  transactions: Transaction[];
  userRules: Rule[];
  budgets: Budget[];
  /** Felhasználói + alapértelmezett szabályok, alkalmazási sorrendben. */
  rules: Rule[];
  /** Előnézethez: mi lenne a besorolás importáláskor. */
  preview(parsed: ParsedTransaction[]): { tx: Transaction; duplicate: boolean }[];
  importTransactions(parsed: ParsedTransaction[]): Promise<ImportOutcome>;
  /**
   * Kézi átsorolás. Ha `rulePattern` meg van adva, szabályt is ment belőle, és az összes
   * nem kézzel besorolt tételt újrasorolja. Visszaadja, hány további tétel változott.
   */
  setCategory(tx: Transaction, categoryId: string, rulePattern?: string): Promise<number>;
  removeRule(id: string): Promise<number>;
  setBudget(categoryId: string, monthlyLimit: number | null): Promise<void>;
  removeTransaction(id: string): Promise<void>;
  /** Minden adat törlése a telefonról. */
  clearAll(): Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userRules, setUserRules] = useState<Rule[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loaded, setLoaded] = useState({ tx: false, rules: false, budgets: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: Error) => setError(e.message);
    const unsubs = [
      store.subscribe<Transaction>('transactions', (items) => {
        items.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
        setTransactions(items);
        setLoaded((l) => ({ ...l, tx: true }));
      }, onError),
      store.subscribe<Rule>('rules', (items) => {
        setUserRules(items);
        setLoaded((l) => ({ ...l, rules: true }));
      }, onError),
      store.subscribe<Budget>('budgets', (items) => {
        setBudgets(items);
        setLoaded((l) => ({ ...l, budgets: true }));
      }, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const rules = useMemo(() => sortRules([...userRules, ...defaultRules()]), [userRules]);
  const existingIds = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions]);

  const preview = useCallback(
    (parsed: ParsedTransaction[]) => {
      const now = Date.now();
      return parsed.map((p) => ({
        tx: { ...p, ...categorize(p, rules), importedAt: now } as Transaction,
        duplicate: existingIds.has(p.id),
      }));
    },
    [rules, existingIds],
  );

  const value: DataState = {
    loading: !(loaded.tx && loaded.rules && loaded.budgets),
    error,
    transactions,
    userRules,
    budgets,
    rules,
    preview,

    async importTransactions(parsed) {
      const rows = preview(parsed);
      // A már meglévő tételeket nem írjuk felül, hogy a kézi besorolások megmaradjanak.
      const fresh = rows.filter((r) => !r.duplicate).map((r) => r.tx);
      await store.saveTransactions(fresh);
      return { added: fresh.length, duplicates: rows.length - fresh.length };
    },

    async setCategory(tx, categoryId, rulePattern) {
      await store.updateCategories([{ id: tx.id, categoryId, categorySource: 'user', ruleId: undefined }]);
      const pattern = rulePattern ? normalize(rulePattern) : '';
      if (!pattern) return 0;
      const rule: Rule = {
        id: `user-${Date.now().toString(36)}`,
        pattern,
        categoryId,
        source: 'user',
        createdAt: Date.now(),
      };
      // Ha ugyanerre a mintára már volt szabály, azt lecseréljük.
      const old = userRules.find((r) => r.pattern === pattern);
      if (old) await store.deleteRule(old.id);
      await store.saveRule(rule);
      const others = transactions.filter((t) => t.id !== tx.id);
      const changed = recategorize(others, [...userRules.filter((r) => r.id !== old?.id), rule, ...defaultRules()]);
      await store.updateCategories(changed);
      return changed.length;
    },

    async removeRule(id) {
      await store.deleteRule(id);
      const changed = recategorize(transactions, [...userRules.filter((r) => r.id !== id), ...defaultRules()]);
      await store.updateCategories(changed);
      return changed.length;
    },

    async setBudget(categoryId, monthlyLimit) {
      if (!monthlyLimit || monthlyLimit <= 0) await store.deleteBudget(categoryId);
      else await store.saveBudget({ categoryId, monthlyLimit });
    },

    async removeTransaction(id) {
      await store.deleteTransaction(id);
    },

    clearAll: store.clearAll,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData csak DataProvider-en belül használható');
  return ctx;
}
