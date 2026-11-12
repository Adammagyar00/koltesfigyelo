import Papa from 'papaparse';

import { normalize } from '../text';
import type { BankId, ParsedTransaction } from '../types';
import { inferDecimalSeparator, parseAmount, parseDate, stableId } from './values';

/**
 * Banki kivonat (CSV) feldolgozása.
 *
 * Az Erste, MBH és Wise exportjai eltérő oszlopneveket, elválasztót, kódolást és
 * előszöveget (számlaszám, időszak a fejléc előtt) használnak. Ezért nem fix oszlopsorrendre
 * építünk, hanem a fejléc szavai alapján ismerjük fel a szerepeket (dátum, összeg, partner...).
 * Ha a felismerés nem sikerül, a felhasználó kézzel párosíthatja az oszlopokat (ColumnMapping).
 */

export type Role =
  | 'date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'currency'
  | 'counterparty'
  | 'description'
  | 'id'
  | 'status'
  | 'direction';

/** Szerepenként a fejlécszinonimák, prioritási sorrendben (normalizált formában). */
const SYNONYMS: Record<Role, string[]> = {
  date: [
    'TRANZAKCIO DATUMA', 'TRANZAKCIO IDOPONTJA', 'TRANZAKCIO DATUM', 'VASARLAS DATUMA',
    'KONYVELES DATUMA', 'KONYVELESI DATUM', 'KONYVELES NAPJA', 'TERHELES DATUMA', 'DATUM',
    'DATE', 'CREATED ON', 'ERTEKNAP', 'ERTEKNAPJA', 'FINISHED ON',
  ],
  amount: [
    'OSSZEG', 'TRANZAKCIO OSSZEGE', 'KONYVELT OSSZEG', 'TERHELT OSSZEG', 'AMOUNT',
  ],
  debit: ['TERHELES', 'TERHELES OSSZEGE', 'KIADAS', 'DEBIT', 'PAID OUT'],
  credit: ['JOVAIRAS', 'JOVAIRAS OSSZEGE', 'BEVETEL', 'CREDIT', 'PAID IN'],
  currency: ['PENZNEM', 'DEVIZANEM', 'DEVIZA', 'CURRENCY', 'SZAMLA DEVIZANEME'],
  counterparty: [
    'PARTNER NEVE', 'PARTNER', 'ELLENOLDALI NEV', 'ELLENOLDAL NEVE', 'ELLENOLDALI PARTNER NEVE',
    'KEDVEZMENYEZETT NEVE', 'KEDVEZMENYEZETT', 'KEDVEZMENYEZETT/BEFIZETO NEVE', 'BEFIZETO NEVE',
    'KERESKEDO', 'KERESKEDO NEVE', 'ELFOGADOHELY', 'MERCHANT', 'PAYEE NAME', 'PAYER NAME',
  ],
  description: [
    'KOZLEMENY', 'TRANZAKCIO KOZLEMENYE', 'MEGJEGYZES', 'LEIRAS', 'TRANZAKCIO LEIRASA',
    'TRANZAKCIO TIPUSA', 'TRANZAKCIO MEGNEVEZESE', 'MEGNEVEZES', 'TIPUS',
    'DESCRIPTION', 'PAYMENT REFERENCE', 'REFERENCE', 'NOTE',
  ],
  id: ['TRANZAKCIO AZONOSITO', 'TRANZAKCIO AZONOSITOJA', 'AZONOSITO', 'TRANSFERWISE ID', 'ID'],
  status: ['STATUS', 'STATUSZ', 'ALLAPOT'],
  direction: ['DIRECTION', 'IRANY', 'T/J', 'JELLEG', 'TERHELES/JOVAIRAS'],
};

/** Ezekből a szerepekből több oszlop is felhasználható (az első nem üres / összefűzve). */
const MULTI_ROLES: Role[] = ['counterparty', 'description'];

export interface ColumnMapping {
  date: number;
  amount?: number;
  debit?: number;
  credit?: number;
  currency?: number;
  counterparty: number[];
  description: number[];
  id?: number;
  status?: number;
  direction?: number;
}

export interface ParseOptions {
  bank: BankId;
  /** Kézi oszloppárosítás, ha az automatikus nem sikerült. */
  mapping?: ColumnMapping;
  /** A fejlécsor indexe (kézi párosításnál). */
  headerRow?: number;
  delimiter?: string;
  defaultCurrency?: string;
}

export interface ParseSuccess {
  ok: true;
  bank: BankId;
  /** Ha a fájl alapján egyértelműen más bank exportja (pl. Wise), itt jelezzük. */
  detectedBank?: BankId;
  transactions: ParsedTransaction[];
  skipped: { row: number; reason: string }[];
  headers: string[];
  mapping: ColumnMapping;
}

export interface ParseNeedsMapping {
  ok: false;
  reason: 'empty' | 'no-header';
  /** Táblázat-előnézet a kézi párosításhoz. */
  rows: string[][];
  delimiter: string;
  /** A legvalószínűbb fejlécsor. */
  headerRow: number;
}

export type ParseResult = ParseSuccess | ParseNeedsMapping;

function matchRole(header: string, role: Role): number {
  const h = normalize(header).replace(/[:*]+$/, '').trim();
  const list = SYNONYMS[role];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (h === s || h.startsWith(`${s} (`) || h.startsWith(`${s}(`) || h.startsWith(`${s} [`)) return i;
  }
  return -1;
}

/** Fejlécsorból szerepek → oszlopindexek. */
export function detectMapping(headers: string[]): ColumnMapping | null {
  const best: Partial<Record<Role, { col: number; prio: number }[]>> = {};
  const used = new Set<number>();
  // A szerepeket sorrendben osztjuk ki, hogy egy oszlop csak egy szerepet kapjon.
  const order: Role[] = ['date', 'amount', 'debit', 'credit', 'currency', 'id', 'status', 'direction', 'counterparty', 'description'];
  for (const role of order) {
    const hits: { col: number; prio: number }[] = [];
    headers.forEach((h, col) => {
      if (used.has(col)) return;
      const prio = matchRole(h, role);
      if (prio >= 0) hits.push({ col, prio });
    });
    hits.sort((a, b) => a.prio - b.prio || a.col - b.col);
    if (!MULTI_ROLES.includes(role)) hits.splice(1);
    hits.forEach((x) => used.add(x.col));
    best[role] = hits;
  }
  const one = (r: Role) => best[r]?.[0]?.col;
  const date = one('date');
  const amount = one('amount');
  const debit = one('debit');
  const credit = one('credit');
  if (date === undefined || (amount === undefined && debit === undefined && credit === undefined)) return null;
  return {
    date,
    amount,
    debit,
    credit,
    currency: one('currency'),
    counterparty: (best.counterparty ?? []).map((x) => x.col),
    description: (best.description ?? []).map((x) => x.col),
    id: one('id'),
    status: one('status'),
    direction: one('direction'),
  };
}

const SKIP_STATUSES = [
  'CANCELLED', 'DECLINED', 'FAILED', 'REFUNDED', 'PENDING',
  'ELUTASITVA', 'ELUTASITOTT', 'VISSZAUTASITVA', 'TOROLT', 'TOROLVE', 'SIKERTELEN',
  'FUGGO', 'FUGGOBEN', 'FOLYAMATBAN', 'ZAROLT', 'ZAROLAS', 'ELOJEGYZETT',
];
const OUT_DIRECTIONS = ['OUT', 'T', 'TERHELES', 'DEBIT', 'D', '-', 'KIMENO'];
const IN_DIRECTIONS = ['IN', 'J', 'JOVAIRAS', 'CREDIT', 'C', '+', 'BEJOVO'];

function parseRows(text: string, delimiter: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    delimiter,
    // Az üres sorokat megtartjuk, hogy a hibaüzenetek sorszáma egyezzen a fájléval.
    skipEmptyLines: false,
  });
  return res.data.map((r) => r.map((c) => (c ?? '').trim()));
}

function isWiseHistoryHeader(row: string[]): boolean {
  const n = row.map(normalize);
  return n.includes('DIRECTION') && n.some((h) => h.startsWith('SOURCE AMOUNT'));
}

function findHeader(rows: string[][]): { index: number; mapping: ColumnMapping } | null {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    if (isWiseHistoryHeader(rows[i])) return { index: i, mapping: { date: -1, counterparty: [], description: [] } };
    const m = detectMapping(rows[i]);
    if (m) return { index: i, mapping: m };
  }
  return null;
}

function detectBankFromHeaders(headers: string[]): BankId | undefined {
  if (headers.map(normalize).includes('TRANSFERWISE ID') || isWiseHistoryHeader(headers)) return 'wise';
  return undefined;
}

/** A Wise újabb "Transaction history" exportja: irány + forrás/cél összeg külön oszlopban. */
function parseWiseHistory(rows: string[][], headerIdx: number): ParseSuccess {
  const headers = rows[headerIdx];
  const n = headers.map(normalize);
  const col = (name: string) => n.findIndex((h) => h === name || h.startsWith(`${name} (`));
  const c = {
    id: col('ID'),
    status: col('STATUS'),
    direction: col('DIRECTION'),
    created: col('CREATED ON'),
    sourceName: col('SOURCE NAME'),
    sourceAmount: col('SOURCE AMOUNT'),
    sourceCurrency: col('SOURCE CURRENCY'),
    targetName: col('TARGET NAME'),
    targetAmount: col('TARGET AMOUNT'),
    targetCurrency: col('TARGET CURRENCY'),
    reference: col('REFERENCE'),
    note: col('NOTE'),
    category: col('CATEGORY'),
  };
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const amountValues = rows.slice(headerIdx + 1).flatMap((r) => [get(r, c.sourceAmount), get(r, c.targetAmount)]);
  const decimal = inferDecimalSeparator(amountValues);
  const transactions: ParsedTransaction[] = [];
  const skipped: ParseSuccess['skipped'] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((x) => x)) continue;
    const status = normalize(get(r, c.status));
    if (status && status !== 'COMPLETED') {
      skipped.push({ row: i + 1, reason: `Státusz: ${get(r, c.status)}` });
      continue;
    }
    const dir = normalize(get(r, c.direction));
    if (dir !== 'OUT' && dir !== 'IN') {
      // NEUTRAL = átváltás a saját egyenlegeid között, nem költés.
      skipped.push({ row: i + 1, reason: 'Saját egyenlegek közötti átváltás' });
      continue;
    }
    const date = parseDate(get(r, c.created));
    const out = dir === 'OUT';
    const amount = parseAmount(get(r, out ? c.sourceAmount : c.targetAmount), decimal);
    if (!date || amount === null) {
      skipped.push({ row: i + 1, reason: 'Hiányzó dátum vagy összeg' });
      continue;
    }
    const currency = (get(r, out ? c.sourceCurrency : c.targetCurrency) || 'HUF').toUpperCase();
    const signed = out ? -Math.abs(amount) : Math.abs(amount);
    const extId = get(r, c.id);
    transactions.push({
      id: `wise-${stableId(`${extId}|${signed}|${currency}`)}`,
      date,
      amount: signed,
      currency,
      counterparty: get(r, out ? c.targetName : c.sourceName),
      description: [get(r, c.reference), get(r, c.category), get(r, c.note)].filter(Boolean).join(' | '),
      bank: 'wise',
    });
  }
  return {
    ok: true,
    bank: 'wise',
    detectedBank: 'wise',
    transactions,
    skipped,
    headers,
    mapping: { date: c.created, counterparty: [], description: [] },
  };
}

function bestDelimiter(text: string): { delimiter: string; rows: string[][]; header: ReturnType<typeof findHeader> } {
  let fallback: { delimiter: string; rows: string[][]; header: null } | null = null;
  for (const delimiter of [';', ',', '\t', '|']) {
    const rows = parseRows(text, delimiter);
    const header = findHeader(rows);
    if (header) return { delimiter, rows, header };
    const width = Math.max(0, ...rows.slice(0, 40).map((r) => r.length));
    if (!fallback || width > Math.max(0, ...fallback.rows.slice(0, 40).map((r) => r.length))) {
      fallback = { delimiter, rows, header: null };
    }
  }
  return fallback!;
}

/** A legszélesebb sor a fájl elején – kézi párosításnál ezt ajánljuk fejlécnek. */
function guessHeaderRow(rows: string[][]): number {
  let best = 0;
  rows.slice(0, 40).forEach((r, i) => {
    if (r.filter(Boolean).length > rows[best].filter(Boolean).length) best = i;
  });
  return best;
}

export function parseStatement(text: string, opts: ParseOptions): ParseResult {
  if (!text.trim()) return { ok: false, reason: 'empty', rows: [], delimiter: ';', headerRow: 0 };

  let rows: string[][];
  let headerIdx: number;
  let mapping: ColumnMapping;

  if (opts.mapping && opts.headerRow !== undefined) {
    rows = parseRows(text, opts.delimiter ?? ';');
    headerIdx = opts.headerRow;
    mapping = opts.mapping;
  } else {
    const found = bestDelimiter(text);
    rows = found.rows;
    if (!found.header) {
      return { ok: false, reason: 'no-header', rows: rows.slice(0, 15), delimiter: found.delimiter, headerRow: guessHeaderRow(rows) };
    }
    headerIdx = found.header.index;
    mapping = found.header.mapping;
    if (isWiseHistoryHeader(rows[headerIdx])) return parseWiseHistory(rows, headerIdx);
  }

  const headers = rows[headerIdx] ?? [];
  const detectedBank = detectBankFromHeaders(headers);
  const bank = detectedBank ?? opts.bank;
  const dataRows = rows.slice(headerIdx + 1);
  const get = (r: string[], i: number | undefined) => (i === undefined ? '' : (r[i] ?? '').trim());

  const amountCols = [mapping.amount, mapping.debit, mapping.credit].filter((x): x is number => x !== undefined);
  const decimal = inferDecimalSeparator(dataRows.flatMap((r) => amountCols.map((c) => get(r, c))));

  const transactions: ParsedTransaction[] = [];
  const skipped: ParseSuccess['skipped'] = [];
  const occurrences = new Map<string, number>();

  dataRows.forEach((r, k) => {
    const rowNo = headerIdx + k + 2; // 1-alapú sorszám a fájlban
    const date = parseDate(get(r, mapping.date));
    if (!date) {
      // Összesítő/lábléc sorok ("Záró egyenleg", "Összesen") – csendben kihagyjuk, ha nincs bennük összeg.
      if (r.some((c) => c)) skipped.push({ row: rowNo, reason: 'Nem értelmezhető dátum' });
      return;
    }

    const status = normalize(get(r, mapping.status));
    if (status && SKIP_STATUSES.some((s) => status === s || status.startsWith(`${s} `))) {
      skipped.push({ row: rowNo, reason: `Státusz: ${get(r, mapping.status)}` });
      return;
    }

    let amount: number | null = null;
    if (mapping.amount !== undefined) {
      amount = parseAmount(get(r, mapping.amount), decimal);
    }
    if (amount === null && (mapping.debit !== undefined || mapping.credit !== undefined)) {
      const d = parseAmount(get(r, mapping.debit), decimal);
      const c = parseAmount(get(r, mapping.credit), decimal);
      if (d !== null || c !== null) amount = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
    }
    if (amount === null) {
      skipped.push({ row: rowNo, reason: 'Nem értelmezhető összeg' });
      return;
    }
    const dir = normalize(get(r, mapping.direction));
    if (dir && OUT_DIRECTIONS.includes(dir)) amount = -Math.abs(amount);
    else if (dir && IN_DIRECTIONS.includes(dir)) amount = Math.abs(amount);
    if (amount === 0) {
      skipped.push({ row: rowNo, reason: 'Nulla összeg' });
      return;
    }

    const currency = (get(r, mapping.currency) || opts.defaultCurrency || 'HUF').toUpperCase();
    const counterparty = mapping.counterparty.map((c) => get(r, c)).find(Boolean) ?? '';
    const description = [...new Set(mapping.description.map((c) => get(r, c)).filter(Boolean))].join(' | ');
    const extId = get(r, mapping.id);

    let key: string;
    if (extId) {
      key = `${extId}|${amount}|${currency}`;
    } else {
      // Azonos tételek ugyanazon a napon (pl. két kávé) – sorszámmal különböztetjük meg őket,
      // így ugyanannak a fájlnak az újraimportálása ugyanazokat az azonosítókat adja.
      const base = `${date}|${amount}|${currency}|${normalize(counterparty)}|${normalize(description)}`;
      const n = (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, n);
      key = `${base}#${n}`;
    }

    transactions.push({
      id: `${bank}-${stableId(key)}`,
      date,
      amount: Math.round(amount * 100) / 100,
      currency,
      counterparty,
      description,
      bank,
    });
  });

  return { ok: true, bank, detectedBank, transactions, skipped, headers, mapping };
}
