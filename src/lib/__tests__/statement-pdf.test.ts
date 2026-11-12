import { describe, expect, it } from 'vitest';

import { findMoney, parsePdfStatement } from '../pdf/statement-pdf';

// A minták kitalált, PDF-ből kinyert szövegre hasonlító sorok – valódi Erste PDF-et még nem láttunk.

describe('findMoney', () => {
  it('finds signed and unsigned amounts, ignoring dates, times and account numbers', () => {
    expect(findMoney('2026.11.03. 2026.11.03. LIDL MAGYARORSZAG -12 450,00 HUF 1 234 567,00 HUF')).toEqual([
      { value: -12450, signed: true, currency: 'HUF' },
      { value: 1234567, signed: false, currency: 'HUF' },
    ]);
    expect(findMoney('Átutalás 11600006-00000000-12345678 10:22 4 990')).toEqual([{ value: 4990, signed: false, currency: undefined }]);
    expect(findMoney('Kártya **** 1234 SPAR 2 450,50')).toEqual([{ value: 2450.5, signed: false, currency: undefined }]);
    expect(findMoney('Azonosító 123456789')).toEqual([]);
  });
});

describe('parsePdfStatement', () => {
  it('layout A: signed amount + running balance, multi-line descriptions, footers', () => {
    const page1 = `Erste Bank Hungary Zrt.
Számlakivonat
Számlaszám: 11600006-00000000-12345678
Időszak: 2026.10.01. - 2026.10.31.
Könyvelés dátuma Értéknap Megnevezés Összeg Egyenleg
Nyitó egyenleg 100 000,00
2026.10.02. 2026.10.02. Kártyás vásárlás -12 450,00 87 550,00
LIDL MAGYARORSZAG BT BUDAPEST
2026.10.05. 2026.10.05. Bejövő átutalás 450 000,00 537 550,00
Minta Munkáltató Kft.
Munkabér október
Oldal 1/2`;
    const page2 = `Könyvelés dátuma Értéknap Megnevezés Összeg Egyenleg
2026.10.07. 2026.10.07. Kártyás vásárlás -4 990,00 532 560,00
WOLT
Záró egyenleg 532 560,00`;
    const r = parsePdfStatement([page1, page2], 'erste');
    expect(r.transactions.map((t) => [t.date, t.amount])).toEqual([
      ['2026-10-02', -12450],
      ['2026-10-05', 450000],
      ['2026-10-07', -4990],
    ]);
    expect(r.transactions[0].description).toContain('LIDL MAGYARORSZAG');
    expect(r.transactions[1].description).toContain('Munkabér');
    expect(r.transactions[1].description).not.toContain('Oldal');
  });

  it('layout B: unsigned amounts with balance – sign from balance change, newest first', () => {
    // A natív kinyerő az oszlopok közé tabulátort tesz.
    const text = [
      'Dátum\tPartner\tÖsszeg\tEgyenleg',
      '2026.10.07.\tWOLT\t4 990\t532 560',
      '2026.10.05.\tMunkabér\t450 000\t537 550',
      '2026.10.02.\tLIDL\t12 450\t87 550',
      '2026.10.01.\tNyitás\t1 000\t100 000',
    ].join('\n');
    const r = parsePdfStatement([text], 'erste');
    const byDate = Object.fromEntries(r.transactions.map((t) => [t.date, t.amount]));
    expect(byDate['2026-10-07']).toBe(-4990);
    expect(byDate['2026-10-05']).toBe(450000);
    expect(byDate['2026-10-02']).toBe(-12450);
  });

  it('layout C: no balance column, signed amounts', () => {
    const text = `2026.10.02. LIDL -12 450,00
2026.10.03. Munkabér +450 000,00
2026.10.03. SPAR -3 100,00`;
    const r = parsePdfStatement([text], 'erste');
    expect(r.transactions.map((t) => t.amount)).toEqual([-12450, 450000, -3100]);
    expect(r.warnings).toEqual([]);
  });

  it('layout D: no signs, no balance – guesses from keywords and warns', () => {
    const text = `2026.10.02. Kártyás vásárlás LIDL 12 450
2026.10.05. Jóváírás munkabér 450 000`;
    const r = parsePdfStatement([text], 'erste');
    expect(r.transactions.map((t) => t.amount)).toEqual([-12450, 450000]);
    expect(r.warnings).toHaveLength(1);
  });

  it('gives stable ids and keeps identical same-day purchases apart', () => {
    const text = `2026.10.02. STARBUCKS -1 590,00
2026.10.02. STARBUCKS -1 590,00`;
    const a = parsePdfStatement([text], 'erste');
    const b = parsePdfStatement([text], 'erste');
    expect(a.transactions.map((t) => t.id)).toEqual(b.transactions.map((t) => t.id));
    expect(new Set(a.transactions.map((t) => t.id)).size).toBe(2);
  });

  it('returns nothing for a PDF without transaction lines', () => {
    expect(parsePdfStatement(['Tájékoztató\nNincs tétel'], 'erste').transactions).toEqual([]);
  });
});

describe('parsePdfStatement – column separators', () => {
  it('does not merge neighbouring columns separated by a tab', () => {
    const r = parsePdfStatement(['2026.10.07.\tWOLT\t-4 990\t532 560'], 'erste');
    expect(r.transactions[0].amount).toBe(-4990);
    expect(r.transactions[0].description).toBe('WOLT');
  });
});
