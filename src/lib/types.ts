export type BankId = 'erste' | 'mbh' | 'wise' | 'revolut' | 'other';

export type CategoryKind = 'expense' | 'income' | 'transfer';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
}

/** Hogyan kapta a tétel a kategóriáját. A 'user' kézi döntés, azt soha nem írjuk felül automatikusan. */
export type CategorySource = 'rule' | 'user' | 'default';

export interface Transaction {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Negatív = kiadás, pozitív = bevétel. A tétel saját pénznemében. */
  amount: number;
  currency: string;
  /** Partner / kereskedő neve, ha a kivonat külön oszlopban adja. */
  counterparty: string;
  /** Közlemény / leírás. */
  description: string;
  bank: BankId;
  categoryId: string;
  categorySource: CategorySource;
  /** Melyik szabály sorolta be (ha szabály volt). */
  ruleId?: string;
  importedAt: number;
}

/** Tétel kategória nélkül, ahogy a CSV-ből kijön. */
export type ParsedTransaction = Omit<Transaction, 'categoryId' | 'categorySource' | 'ruleId' | 'importedAt'>;

export interface Rule {
  id: string;
  /** Normalizált (nagybetűs, ékezet nélküli) kulcsszó, pl. "WOLT" vagy "APPLE.COM/BILL". */
  pattern: string;
  categoryId: string;
  source: 'default' | 'user';
  createdAt: number;
}

export interface Budget {
  categoryId: string;
  /** Havi keret, pozitív szám, alap pénznemben. */
  monthlyLimit: number;
}
