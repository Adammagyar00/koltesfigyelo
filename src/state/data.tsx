import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { defaultRules } from '@/lib/categories';
import { categorize, recategorize, sortRules } from '@/lib/categorize';
import { cleanProfile, EMPTY_PROFILE, type OwnProfile } from '@/lib/own-transfers';
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
  /**
   * Importálás. Ha `replaceIds` meg van adva, ezeket a (korábban importált) tételeket előbb törli –
   * így egy kivonat újraimportálása lecseréli ugyanannak az időszaknak a régi tételeit.
   */
  importTransactions(parsed: ParsedTransaction[], replaceIds?: string[]): Promise<ImportOutcome>;
  /** Ugyanannál a banknál, ugyanebben az időszakban lévő, de az új importban nem szereplő tételek. */
  overlapping(parsed: ParsedTransaction[]): Transaction[];
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
  /** Saját név és számlaszámok – ezekből ismerjük fel a saját számlák közötti átvezetéseket. */
  profile: OwnProfile;
  /** Elmenti a profilt, és újrasorol mindent. Visszaadja, hány tétel került át "Átvezetés"-be. */
  setProfile(profile: OwnProfile): Promise<number>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userRules, setUserRules] = useState<Rule[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loaded, setLoaded] = useState({ tx: false, rules: false, budgets: false });
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfileState] = useState<OwnProfile>(EMPTY_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);

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
    let alive = true;
    store
      .loadProfile()
      .then((p) => alive && setProfileState(p))
      .catch(onError)
      .finally(() => alive && setProfileLoaded(true));
    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  }, []);

  const rules = useMemo(() => sortRules([...userRules, ...defaultRules()]), [userRules]);
  const existingIds = useMemo(() => new Set(transactions.map((t) => t.id)), [transactions]);

  const preview = useCallback(
    (parsed: ParsedTransaction[]) => {
      const now = Date.now();
      return parsed.map((p) => ({
        tx: { ...p, ...categorize(p, rules, profile), importedAt: now } as Transaction,
        duplicate: existingIds.has(p.id),
      }));
    },
    [rules, existingIds, profile],
  );

  const value: DataState = {
    loading: !(loaded.tx && loaded.rules && loaded.budgets && profileLoaded),
    error,
    transactions,
    userRules,
    budgets,
    rules,
    preview,

    overlapping(parsed) {
      if (parsed.length === 0) return [];
      const ids = new Set(parsed.map((p) => p.id));
      const banks = new Set(parsed.map((p) => p.bank));
      const dates = parsed.map((p) => p.date).sort();
      const from = dates[0];
      const to = dates[dates.length - 1];
      return transactions.filter((t) => banks.has(t.bank) && t.date >= from && t.date <= to && !ids.has(t.id));
    },

    async importTransactions(parsed, replaceIds) {
      const replaced = new Set(replaceIds ?? []);
      if (replaced.size) await store.deleteTransactions([...replaced]);
      const rows = preview(parsed);
      // A már meglévő tételeket nem írjuk felül, hogy a kézi besorolások megmaradjanak.
      const fresh = rows.filter((r) => !r.duplicate).map((r) => r.tx);
      await store.saveTransactions(fresh);
      // Az új tételekkel együtt keressük a bankok közötti átutalás-párokat (pl. Erste → Wise).
      await store.updateCategories(recategorize([...transactions.filter((t) => !replaced.has(t.id)), ...fresh], rules, profile));
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
      const changed = recategorize(others, [...userRules.filter((r) => r.id !== old?.id), rule, ...defaultRules()], profile);
      await store.updateCategories(changed);
      return changed.length;
    },

    async removeRule(id) {
      await store.deleteRule(id);
      const changed = recategorize(transactions, [...userRules.filter((r) => r.id !== id), ...defaultRules()], profile);
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

    async clearAll() {
      await store.clearAll();
      setProfileState(EMPTY_PROFILE);
    },

    profile,

    async setProfile(next) {
      const p = cleanProfile(next);
      await store.saveProfile(p);
      setProfileState(p);
      const changed = recategorize(transactions, rules, p);
      await store.updateCategories(changed);
      return changed.filter((t) => t.categoryId === 'atvezetes').length;
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData csak DataProvider-en belül használható');
  return ctx;
}
