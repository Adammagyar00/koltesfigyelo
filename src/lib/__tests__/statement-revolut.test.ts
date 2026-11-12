import { describe, expect, it } from 'vitest';

import { defaultRules } from '../categories';
import { categorize, sortRules } from '../categorize';
import { parseStatement, type ParseSuccess } from '../csv/statement';

// Revolut számlakivonat CSV (kitalált adatok).
const EN = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
TOPUP,Current,2026-10-04 13:40:00,2026-10-04 13:40:05,Top-up by *1234,20000.00,0.00,HUF,COMPLETED,20000.00
CARD_PAYMENT,Current,2026-10-05 12:00:00,2026-10-06 09:00:00,Lidl,-3450.00,0.00,HUF,COMPLETED,16550.00
CARD_PAYMENT,Current,2026-10-06 18:00:00,,Wolt,-4990.00,0.00,HUF,PENDING,
CARD_PAYMENT,Current,2026-10-07 18:00:00,2026-10-07 18:00:00,Netflix,-4490.00,0.00,HUF,REVERTED,16550.00
EXCHANGE,Current,2026-10-08 10:00:00,2026-10-08 10:00:00,Exchanged to EUR,-4000.00,40.00,HUF,COMPLETED,12510.00
EXCHANGE,Current,2026-10-08 10:00:00,2026-10-08 10:00:00,Exchanged from HUF,10.00,0.00,EUR,COMPLETED,10.00
TRANSFER,Current,2026-10-09 10:00:00,2026-10-09 10:00:00,To EUR Savings,-5.00,0.00,EUR,COMPLETED,5.00
TRANSFER,Savings,2026-10-09 10:00:00,2026-10-09 10:00:00,From EUR Current,5.00,0.00,EUR,COMPLETED,5.00
`;

const HU = `Típus,Termék,Kezdés dátuma,Teljesítés dátuma,Leírás,Összeg,Díj,Pénznem,Állapot,Egyenleg
CARD_PAYMENT,Folyószámla,2026-10-05 12:00:00,2026-10-06 09:00:00,Lidl,-3450.00,0.00,HUF,TELJESÍTVE,16550.00
CARD_PAYMENT,Folyószámla,2026-10-06 18:00:00,,Wolt,-4990.00,0.00,HUF,FÜGGŐBEN,
`;

const ok = (r: ReturnType<typeof parseStatement>): ParseSuccess => {
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`);
  return r;
};

describe('parseStatement – Revolut', () => {
  const r = ok(parseStatement(EN, { bank: 'erste' }));

  it('auto-detects Revolut and uses the completed date', () => {
    expect(r.bank).toBe('revolut');
    expect(r.transactions[1]).toMatchObject({ date: '2026-10-06', amount: -3450, currency: 'HUF' });
  });

  it('skips pending/reverted rows and the savings pocket own rows; adds the fee', () => {
    expect(r.transactions.map((t) => [t.amount, t.currency])).toEqual([
      [20000, 'HUF'],
      [-3450, 'HUF'],
      [-4040, 'HUF'], // -4000 + 40 díj
      [10, 'EUR'],
      [-5, 'EUR'],
    ]);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      'Státusz: PENDING',
      'Státusz: REVERTED',
      'Megtakarítási zseb saját sora (Savings)',
    ]);
  });

  it('categorizes top-ups and exchanges as own transfers, the savings pocket as savings', () => {
    const rules = sortRules(defaultRules());
    const cats = r.transactions.map((t) => categorize(t, rules).categoryId);
    expect(cats).toEqual(['atvezetes', 'elelmiszer', 'atvezetes', 'atvezetes', 'befektetes']);
  });

  it('reads the Hungarian export too', () => {
    const h = ok(parseStatement(HU, { bank: 'revolut' }));
    expect(h.transactions.map((t) => t.amount)).toEqual([-3450]);
  });
});
