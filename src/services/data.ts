import AsyncStorage from '@react-native-async-storage/async-storage';

import { cleanProfile, EMPTY_PROFILE, type OwnProfile } from '@/lib/own-transfers';
import type { Budget, Rule, Transaction } from '@/lib/types';

/**
 * Helyi adattárolás a telefonon (AsyncStorage), fiók és szerver nélkül.
 *
 * Kulcsok:
 *   kf:v1:tx:YYYY-MM   – az adott hónap tételei (JSON tömb). Havonta bontjuk, hogy egy kulcs se
 *                        legyen túl nagy (Androidon egy elem mérete korlátozott).
 *   kf:v1:rules        – a felhasználó saját szabályai
 *   kf:v1:budgets      – havi keretek
 *   kf:v1:profile      – saját név és számlaszámok (a saját átvezetések felismeréséhez)
 *
 * Az adatokat induláskor egyszer betöltjük a memóriába; minden írás a memóriát frissíti,
 * majd a megváltozott kulcsokat menti, és értesíti a feliratkozókat.
 */

const PREFIX = 'kf:v1:';
const TX_PREFIX = `${PREFIX}tx:`;
const RULES_KEY = `${PREFIX}rules`;
const BUDGETS_KEY = `${PREFIX}budgets`;
const PROFILE_KEY = `${PREFIX}profile`;

type CollectionName = 'transactions' | 'rules' | 'budgets';

interface State {
  transactions: Map<string, Transaction>;
  rules: Rule[];
  budgets: Budget[];
}

let state: State | null = null;
let loading: Promise<State> | null = null;
const listeners: Record<CollectionName, Set<(items: unknown[]) => void>> = {
  transactions: new Set(),
  rules: new Set(),
  budgets: new Set(),
};

function load(): Promise<State> {
  if (state) return Promise.resolve(state);
  if (!loading) {
    loading = (async () => {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
      const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
      const s: State = { transactions: new Map(), rules: [], budgets: [] };
      for (const [key, value] of pairs) {
        if (!value) continue;
        const data = JSON.parse(value);
        if (key.startsWith(TX_PREFIX)) for (const t of data as Transaction[]) s.transactions.set(t.id, t);
        else if (key === RULES_KEY) s.rules = data;
        else if (key === BUDGETS_KEY) s.budgets = data;
      }
      state = s;
      return s;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function snapshot(s: State, name: CollectionName): unknown[] {
  if (name === 'transactions') return [...s.transactions.values()];
  return name === 'rules' ? [...s.rules] : [...s.budgets];
}

function emit(s: State, name: CollectionName) {
  const items = snapshot(s, name);
  listeners[name].forEach((l) => l(items));
}

// Az írásokat sorba rendezzük, hogy két egyidejű mentés ne írja felül egymást.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function persistMonths(s: State, months: Set<string>) {
  const byMonth = new Map<string, Transaction[]>([...months].map((m) => [m, []]));
  for (const t of s.transactions.values()) byMonth.get(t.date.slice(0, 7))?.push(t);
  const sets: [string, string][] = [];
  const removes: string[] = [];
  for (const [m, list] of byMonth) {
    if (list.length) sets.push([`${TX_PREFIX}${m}`, JSON.stringify(list)]);
    else removes.push(`${TX_PREFIX}${m}`);
  }
  if (sets.length) await AsyncStorage.multiSet(sets);
  if (removes.length) await AsyncStorage.multiRemove(removes);
}

export function subscribe<T>(
  name: CollectionName,
  onData: (items: T[]) => void,
  onError: (e: Error) => void,
): () => void {
  const listener = onData as (items: unknown[]) => void;
  listeners[name].add(listener);
  load().then(
    (s) => {
      if (listeners[name].has(listener)) listener(snapshot(s, name));
    },
    (e: Error) => onError(e),
  );
  return () => {
    listeners[name].delete(listener);
  };
}

export function saveTransactions(txs: Transaction[]): Promise<void> {
  return serial(async () => {
    if (txs.length === 0) return;
    const s = await load();
    const months = new Set<string>();
    for (const t of txs) {
      const old = s.transactions.get(t.id);
      if (old) months.add(old.date.slice(0, 7));
      s.transactions.set(t.id, t);
      months.add(t.date.slice(0, 7));
    }
    await persistMonths(s, months);
    emit(s, 'transactions');
  });
}

export function updateCategories(
  updates: Pick<Transaction, 'id' | 'categoryId' | 'categorySource' | 'ruleId'>[],
): Promise<void> {
  return serial(async () => {
    if (updates.length === 0) return;
    const s = await load();
    const months = new Set<string>();
    for (const u of updates) {
      const t = s.transactions.get(u.id);
      if (!t) continue;
      s.transactions.set(u.id, { ...t, categoryId: u.categoryId, categorySource: u.categorySource, ruleId: u.ruleId });
      months.add(t.date.slice(0, 7));
    }
    await persistMonths(s, months);
    emit(s, 'transactions');
  });
}

export function deleteTransaction(id: string): Promise<void> {
  return serial(async () => {
    const s = await load();
    const t = s.transactions.get(id);
    if (!t) return;
    s.transactions.delete(id);
    await persistMonths(s, new Set([t.date.slice(0, 7)]));
    emit(s, 'transactions');
  });
}

export function saveRule(rule: Rule): Promise<void> {
  return serial(async () => {
    const s = await load();
    s.rules = [...s.rules.filter((r) => r.id !== rule.id), rule];
    await AsyncStorage.setItem(RULES_KEY, JSON.stringify(s.rules));
    emit(s, 'rules');
  });
}

export function deleteRule(id: string): Promise<void> {
  return serial(async () => {
    const s = await load();
    s.rules = s.rules.filter((r) => r.id !== id);
    await AsyncStorage.setItem(RULES_KEY, JSON.stringify(s.rules));
    emit(s, 'rules');
  });
}

export function saveBudget(budget: Budget): Promise<void> {
  return serial(async () => {
    const s = await load();
    s.budgets = [...s.budgets.filter((b) => b.categoryId !== budget.categoryId), budget];
    await AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(s.budgets));
    emit(s, 'budgets');
  });
}

export function deleteBudget(categoryId: string): Promise<void> {
  return serial(async () => {
    const s = await load();
    s.budgets = s.budgets.filter((b) => b.categoryId !== categoryId);
    await AsyncStorage.setItem(BUDGETS_KEY, JSON.stringify(s.budgets));
    emit(s, 'budgets');
  });
}

/** Minden adat törlése a telefonról. */
export function clearAll(): Promise<void> {
  return serial(async () => {
    const s = await load();
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
    s.transactions.clear();
    s.rules = [];
    s.budgets = [];
    (['transactions', 'rules', 'budgets'] as const).forEach((n) => emit(s, n));
  });
}

export async function loadProfile(): Promise<OwnProfile> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return EMPTY_PROFILE;
  try {
    return cleanProfile({ ...EMPTY_PROFILE, ...JSON.parse(raw) });
  } catch {
    return EMPTY_PROFILE;
  }
}

export async function saveProfile(profile: OwnProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(cleanProfile(profile)));
}
