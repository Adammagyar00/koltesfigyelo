import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { defaultRules, FALLBACK_EXPENSE, newCustomCategory, setCustomCategories } from '@/lib/categories';
import { categorize, recategorize, sortRules } from '@/lib/categorize';
import { toBaseCurrency } from '@/lib/currency';
import { cleanProfile, EMPTY_PROFILE, type OwnProfile } from '@/lib/own-transfers';
import { DEFAULT_SETTINGS, type AppSettings, type PendingItem } from '@/lib/settings';
import { isGenericPattern, normalize } from '@/lib/text';
import type { BankId, Budget, Category, ParsedTransaction, Rule, Transaction } from '@/lib/types';
import * as store from '@/services/data';

interface ImportOutcome {
  added: number;
  duplicates: number;
}

interface DataState {
  loading: boolean;
  error: string | null;
  /** Dátum szerint csökkenő sorrendben, eredeti pénznemben (listákhoz). */
  transactions: Transaction[];
  /** Ugyanezek forintra számolva (összesítésekhez, grafikonokhoz, tippekhez). */
  baseTransactions: Transaction[];
  userRules: Rule[];
  budgets: Budget[];
  /** Felhasználói + alapértelmezett szabályok, alkalmazási sorrendben. */
  rules: Rule[];
  /** Előnézethez: mi lenne a besorolás importáláskor. */
  preview(parsed: ParsedTransaction[]): { tx: Transaction; duplicate: boolean }[];
  /**
   * Importálás. Ha `replaceIds` meg van adva, ezeket a (korábban importált) tételeket előbb törli –
   * így egy kivonat újraimportálása lecseréli ugyanannak az időszaknak a régi tételeit.
   * A `pending` a kivonat zárolt (még le nem könyvelt) tételei: lecserélik az adott bank korábbiakat.
   */
  importTransactions(
    parsed: ParsedTransaction[],
    replaceIds?: string[],
    pending?: { bank: BankId; items: Omit<PendingItem, 'bank'>[] },
  ): Promise<ImportOutcome>;
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
  settings: AppSettings;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  addCategory(name: string, icon: string): Promise<Category>;
  /** Saját kategória törlése: a tételei újra besorolódnak, a rá mutató szabályok és keret törlődik. */
  removeCategory(id: string): Promise<void>;
  /** A teljes adatbázis JSON-mentése. */
  exportBackup(): Promise<string>;
  /** Mentés visszatöltése (minden jelenlegi adat cseréje). Visszaadja a visszatöltött tételek számát. */
  restoreBackup(json: string): Promise<number>;
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
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const applySettings = useCallback((s: AppSettings) => {
    // A kategória-nyilvántartást a state előtt frissítjük, hogy a következő renderben már az új lista látsszon.
    setCustomCategories(s.customCategories);
    setSettingsState(s);
  }, []);

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
    store
      .loadSettings()
      .then((s) => alive && applySettings(s))
      .catch(onError)
      .finally(() => alive && setSettingsLoaded(true));
    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  }, [applySettings]);

  const rules = useMemo(() => sortRules([...userRules, ...defaultRules()]), [userRules]);
  const ready = loaded.tx && loaded.rules && loaded.budgets && profileLoaded && settingsLoaded;
  const baseTransactions = useMemo(() => toBaseCurrency(transactions, settings.rates), [transactions, settings.rates]);

  // Induláskor egyszer újrasorolunk mindent: így egy frissítés javított/új szabályai (és a túl általános
  // saját szabályok kikapcsolása) a korábban importált tételekre is érvényesek lesznek.
  // A kézzel besorolt tételekhez nem nyúl.
  const recategorizedOnStart = useRef(false);
  useEffect(() => {
    if (!ready || recategorizedOnStart.current) return;
    recategorizedOnStart.current = true;
    const changed = recategorize(transactions, rules, profile);
    if (changed.length) store.updateCategories(changed).catch((e: Error) => setError(e.message));
  }, [ready, transactions, rules, profile]);
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

  const saveSettings = async (next: AppSettings) => {
    await store.saveSettings(next);
    applySettings(next);
  };

  const value: DataState = {
    loading: !ready,
    error,
    transactions,
    baseTransactions,
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

    async importTransactions(parsed, replaceIds, pending) {
      const replaced = new Set(replaceIds ?? []);
      if (replaced.size) await store.deleteTransactions([...replaced]);
      const rows = preview(parsed);
      // A már meglévő tételeket nem írjuk felül, hogy a kézi besorolások megmaradjanak.
      const fresh = rows.filter((r) => !r.duplicate).map((r) => r.tx);
      await store.saveTransactions(fresh);
      // Az új tételekkel együtt keressük a bankok közötti átutalás-párokat (pl. Erste → Wise).
      await store.updateCategories(recategorize([...transactions.filter((t) => !replaced.has(t.id)), ...fresh], rules, profile));
      if (pending) {
        await saveSettings({
          ...settings,
          pending: [
            ...settings.pending.filter((p) => p.bank !== pending.bank),
            ...pending.items.map((i) => ({ ...i, bank: pending.bank })),
          ],
        });
      }
      return { added: fresh.length, duplicates: rows.length - fresh.length };
    },

    async setCategory(tx, categoryId, rulePattern) {
      await store.updateCategories([{ id: tx.id, categoryId, categorySource: 'user', ruleId: undefined }]);
      const pattern = rulePattern ? normalize(rulePattern) : '';
      if (!pattern || isGenericPattern(pattern)) return 0;
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
      applySettings(DEFAULT_SETTINGS);
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

    settings,

    async updateSettings(patch) {
      await saveSettings({ ...settings, ...patch });
    },

    async addCategory(name, icon) {
      const cat = newCustomCategory(name, icon, settings.customCategories);
      await saveSettings({ ...settings, customCategories: [...settings.customCategories, cat] });
      return cat;
    },

    async removeCategory(id) {
      await saveSettings({ ...settings, customCategories: settings.customCategories.filter((c) => c.id !== id) });
      const remainingRules = userRules.filter((r) => r.categoryId !== id);
      for (const r of userRules) if (r.categoryId === id) await store.deleteRule(r.id);
      if (budgets.some((b) => b.categoryId === id)) await store.deleteBudget(id);
      // A kategória tételei (a kézzel besoroltak is) újra automatikus besorolást kapnak.
      const orphans = transactions
        .filter((t) => t.categoryId === id)
        .map((t) => ({ ...t, categoryId: FALLBACK_EXPENSE, categorySource: 'default' as const, ruleId: undefined }));
      const others = transactions.filter((t) => t.categoryId !== id);
      const changed = recategorize([...others, ...orphans], [...remainingRules, ...defaultRules()], profile);
      const changedIds = new Set(changed.map((c) => c.id));
      await store.updateCategories([...changed, ...orphans.filter((o) => !changedIds.has(o.id))]);
    },

    async exportBackup() {
      return JSON.stringify(await store.exportAll());
    },

    async restoreBackup(json) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error('A fájl nem olvasható (nem JSON).');
      }
      const data = store.validateBackup(parsed);
      await store.restoreAll(data);
      setProfileState(data.profile);
      applySettings(data.settings);
      return data.transactions.length;
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData csak DataProvider-en belül használható');
  return ctx;
}
