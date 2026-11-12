import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';

import type { Budget, Rule, Transaction } from '@/lib/types';

import { db } from './firebase';

/**
 * Adatszerkezet Firestore-ban (minden felhasználónak a sajátja, lásd firestore.rules):
 *   users/{uid}/transactions/{transactionId}
 *   users/{uid}/rules/{ruleId}         – csak a felhasználó saját szabályai
 *   users/{uid}/budgets/{categoryId}
 */

type CollectionName = 'transactions' | 'rules' | 'budgets';

function requireDb() {
  if (!db) throw new Error('A Firebase nincs beállítva.');
  return db;
}

const col = (uid: string, name: CollectionName) => collection(requireDb(), 'users', uid, name);

export function subscribe<T>(
  uid: string,
  name: CollectionName,
  onData: (items: T[]) => void,
  onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    col(uid, name),
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }) as T)),
    onError,
  );
}

/** Firestore egy batch-ben legfeljebb 500 írást enged; 400-asával írunk. */
export async function saveTransactions(uid: string, txs: Transaction[]): Promise<void> {
  const database = requireDb();
  for (let i = 0; i < txs.length; i += 400) {
    const batch = writeBatch(database);
    for (const t of txs.slice(i, i + 400)) {
      const { id, ...data } = t;
      batch.set(doc(database, 'users', uid, 'transactions', id), data);
    }
    await batch.commit();
  }
}

export async function updateCategories(
  uid: string,
  updates: Pick<Transaction, 'id' | 'categoryId' | 'categorySource' | 'ruleId'>[],
): Promise<void> {
  const database = requireDb();
  for (let i = 0; i < updates.length; i += 400) {
    const batch = writeBatch(database);
    for (const u of updates.slice(i, i + 400)) {
      batch.update(doc(database, 'users', uid, 'transactions', u.id), {
        categoryId: u.categoryId,
        categorySource: u.categorySource,
        ruleId: u.ruleId ?? null,
      });
    }
    await batch.commit();
  }
}

export async function deleteTransaction(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'users', uid, 'transactions', id));
}

export async function saveRule(uid: string, rule: Rule): Promise<void> {
  const { id, ...data } = rule;
  await setDoc(doc(requireDb(), 'users', uid, 'rules', id), data);
}

export async function deleteRule(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'users', uid, 'rules', id));
}

export async function saveBudget(uid: string, budget: Budget): Promise<void> {
  await setDoc(doc(requireDb(), 'users', uid, 'budgets', budget.categoryId), budget);
}

export async function deleteBudget(uid: string, categoryId: string): Promise<void> {
  await deleteDoc(doc(requireDb(), 'users', uid, 'budgets', categoryId));
}
