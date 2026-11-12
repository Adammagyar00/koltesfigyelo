import { describe, expect, it } from 'vitest';

import { parseStatement, type ParseSuccess } from '../csv/statement';
import { inferDecimalSeparator, parseAmount, parseDate } from '../csv/values';
import { base64ToBytes, decodeBankFile, decodeCp1250 } from '../encoding';

const ok = (r: ReturnType<typeof parseStatement>): ParseSuccess => {
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`);
  return r;
};

describe('parseAmount', () => {
  it.each([
    ['-12 345,67', ',', -12345.67],
    ['-12.345,67', ',', -12345.67],
    ['1 234 Ft', ',', 1234],
    ['-4 990 HUF', ',', -4990],
    ['(1 500)', ',', -1500],
    ['1500-', ',', -1500],
    ['-12.50', '.', -12.5],
    ['1,234.56', '.', 1234.56],
    ['+250', ',', 250],
    ['abc', ',', null],
    ['', ',', null],
  ] as const)('%s -> %s', (raw, dec, expected) => {
    expect(parseAmount(raw, dec)).toBe(expected);
  });

  it('infers decimal separator from a column', () => {
    expect(inferDecimalSeparator(['-12.50', '3.00', '-1200'])).toBe('.');
    expect(inferDecimalSeparator(['-1 234,50', '-5 000'])).toBe(',');
    expect(inferDecimalSeparator(['-5000', '1200'])).toBe(',');
  });
});

describe('parseDate', () => {
  it.each([
    ['2024-01-15', '2024-01-15'],
    ['2024.01.15.', '2024-01-15'],
    ['2024. 01. 15.', '2024-01-15'],
    ['2024/1/5', '2024-01-05'],
    ['15-01-2024', '2024-01-15'],
    ['15.01.2024', '2024-01-15'],
    ['2024-01-15 10:22:33', '2024-01-15'],
    ['2024-01-15T10:22:33Z', '2024-01-15'],
    ['2024-02-30', null],
    ['Záró egyenleg', null],
  ])('%s -> %s', (raw, expected) => {
    expect(parseDate(raw)).toBe(expected);
  });
});

describe('encoding', () => {
  it('decodes Windows-1250 exactly like the platform decoder', () => {
    const bytes = new Uint8Array(128).map((_, i) => 0x80 + i);
    const ref = new TextDecoder('windows-1250').decode(bytes);
    const mine = decodeCp1250(bytes);
    for (let i = 0; i < 128; i++) {
      if (mine[i] === '�') continue; // definiálatlan pozíciók
      expect(mine[i], `byte 0x${(0x80 + i).toString(16)}`).toBe(ref[i]);
    }
  });

  it('detects UTF-8 vs Windows-1250', () => {
    const text = 'Könyvelés dátuma;Összeg;Közlemény\n2024.01.15.;-1 000;Árvíztűrő tükörfúrógép';
    const utf8 = new TextEncoder().encode(text);
    expect(decodeBankFile(utf8)).toEqual({ text, encoding: 'utf-8' });

    const cp = new Uint8Array([...text].map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0x80) return code;
      const idx = decodeCp1250(new Uint8Array(128).map((_, i) => 0x80 + i)).indexOf(ch);
      return 0x80 + idx;
    }));
    expect(decodeBankFile(cp)).toEqual({ text, encoding: 'windows-1250' });
  });

  it('decodes base64 (with data: prefix)', () => {
    const b64 = Buffer.from('Ősz;ű', 'utf8').toString('base64');
    expect(new TextDecoder().decode(base64ToBytes(b64))).toBe('Ősz;ű');
    expect(new TextDecoder().decode(base64ToBytes(`data:text/csv;base64,${b64}`))).toBe('Ősz;ű');
  });
});

// Erste (George) jellegű export: pontosvessző, előszöveg a fejléc előtt, magyar fejlécek.
const ERSTE = `Számlaszám;11600006-00000000-12345678
Időszak;2024.01.01.-2024.01.31.

Könyvelés dátuma;Tranzakció dátuma;Partner neve;Partner számlaszáma;Összeg;Pénznem;Közlemény;Tranzakció azonosító
2024.01.03.;2024.01.02.;LIDL MAGYARORSZAG BT;;-12 450,00;HUF;Vásárlás kártyával;TX001
2024.01.05.;2024.01.04.;WOLT;;-4 990,00;HUF;;TX002
2024.01.10.;2024.01.10.;Munkáltató Kft.;11700000-11111111;450 000,00;HUF;Munkabér január;TX003
2024.01.12.;2024.01.12.;;;-1 200,00;HUF;Számlavezetési díj;TX004
Záró egyenleg;;;;;;;
`;

// MBH jellegű export: terhelés/jóváírás külön oszlopban, nincs tranzakció-azonosító.
const MBH = `Tranzakció dátuma;Könyvelés dátuma;Kedvezményezett neve;Közlemény;Terhelés;Jóváírás;Devizanem
2024-01-02;2024-01-03;SPAR MAGYARORSZAG;;5 432;;HUF
2024-01-02;2024-01-03;STARBUCKS;;1 590;;HUF
2024-01-02;2024-01-03;STARBUCKS;;1 590;;HUF
2024-01-06;2024-01-06;Visszatérítés;EMAG;;12 990;HUF
`;

// Wise klasszikus kivonat (vessző, angol fejléc, pont tizedesjel, DD-MM-YYYY).
const WISE_STATEMENT = `"TransferWise ID",Date,Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees"
CARD-1001,15-01-2024,-12.50,EUR,"Card transaction of 12.50 EUR issued by Spotify",,87.50,,,,,,,Spotify,1234,"Teszt Elek",,,0.00
BALANCE-2002,16-01-2024,-50.00,EUR,"Converted 50.00 EUR to 19,500.00 HUF",,37.50,EUR,HUF,390.00,,,,,,,,,0.00
CARD-1003,17-01-2024,-8.90,EUR,"Card transaction of 8.90 EUR issued by Wolt",,28.60,,,,,,,Wolt,1234,"Teszt Elek",,,0.00
`;

// Wise újabb "Transaction history" export.
const WISE_HISTORY = `ID,Status,Direction,"Created on","Finished on","Source fee amount","Source fee currency","Target fee amount","Target fee currency","Source name","Source amount (after fees)","Source currency","Target name","Target amount (after fees)","Target currency","Exchange rate",Reference,Batch,"Created by",Category,Note
CARD_TRANSACTION-1,COMPLETED,OUT,"2024-01-15 10:22:33","2024-01-15 10:22:35",0,EUR,,,"Teszt Elek",12.50,EUR,Netflix,12.50,EUR,1,,,"Teszt Elek",Entertainment,
TRANSFER-2,COMPLETED,IN,"2024-01-16 09:00:00","2024-01-16 09:00:01",,,,,"Ügyfél Kft",1000.00,EUR,"Teszt Elek",1000.00,EUR,1,"Invoice 12",,"Ügyfél Kft",,
BALANCE-3,COMPLETED,NEUTRAL,"2024-01-17 09:00:00","2024-01-17 09:00:01",,,,,"Teszt Elek",100,EUR,"Teszt Elek",39000,HUF,390,,,"Teszt Elek",,
CARD_TRANSACTION-4,CANCELLED,OUT,"2024-01-18 12:00:00",,,,,,"Teszt Elek",5.00,EUR,Lime,5.00,EUR,1,,,"Teszt Elek",,
`;

describe('parseStatement – Erste', () => {
  const r = ok(parseStatement(ERSTE, { bank: 'erste' }));

  it('finds the header after the preamble and reads all rows', () => {
    expect(r.transactions).toHaveLength(4);
    expect(r.transactions[0]).toMatchObject({
      date: '2024-01-02', // tranzakció dátuma előnyben a könyveléssel szemben
      amount: -12450,
      currency: 'HUF',
      counterparty: 'LIDL MAGYARORSZAG BT',
      description: 'Vásárlás kártyával',
      bank: 'erste',
    });
    expect(r.transactions[2].amount).toBe(450000);
  });

  it('reports footer rows as skipped instead of failing', () => {
    expect(r.skipped).toEqual([{ row: 9, reason: 'Nem értelmezhető dátum' }]);
  });

  it('produces stable ids across re-imports', () => {
    const again = ok(parseStatement(ERSTE, { bank: 'erste' }));
    expect(again.transactions.map((t) => t.id)).toEqual(r.transactions.map((t) => t.id));
    expect(new Set(r.transactions.map((t) => t.id)).size).toBe(4);
  });
});

describe('parseStatement – MBH', () => {
  const r = ok(parseStatement(MBH, { bank: 'mbh' }));

  it('combines debit/credit columns into a signed amount', () => {
    expect(r.transactions.map((t) => t.amount)).toEqual([-5432, -1590, -1590, 12990]);
  });

  it('keeps two identical same-day purchases as distinct transactions', () => {
    const [, a, b] = r.transactions;
    expect(a.id).not.toBe(b.id);
  });
});

describe('parseStatement – Wise', () => {
  it('reads the classic statement and auto-detects Wise', () => {
    const r = ok(parseStatement(WISE_STATEMENT, { bank: 'erste' }));
    expect(r.bank).toBe('wise');
    expect(r.detectedBank).toBe('wise');
    expect(r.transactions).toHaveLength(3);
    expect(r.transactions[0]).toMatchObject({ date: '2024-01-15', amount: -12.5, currency: 'EUR', counterparty: 'Spotify' });
  });

  it('reads the transaction-history export, skipping conversions and cancelled rows', () => {
    const r = ok(parseStatement(WISE_HISTORY, { bank: 'wise' }));
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0]).toMatchObject({ amount: -12.5, currency: 'EUR', counterparty: 'Netflix' });
    expect(r.transactions[1]).toMatchObject({ amount: 1000, counterparty: 'Ügyfél Kft' });
    expect(r.skipped.map((s) => s.reason)).toEqual(['Saját egyenlegek közötti átváltás', 'Státusz: CANCELLED']);
  });
});

describe('parseStatement – fallback', () => {
  it('asks for manual mapping when headers are unknown', () => {
    const r = parseStatement('Nap;Mennyi;Kinek\n2024.01.01.;-100;Valaki\n', { bank: 'other' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-header');
      expect(r.rows[0]).toEqual(['Nap', 'Mennyi', 'Kinek']);
    }
  });

  it('parses with a manual mapping', () => {
    const r = ok(
      parseStatement('Nap;Mennyi;Kinek\n2024.01.01.;-100;Valaki\n', {
        bank: 'other',
        delimiter: ';',
        headerRow: 0,
        mapping: { date: 0, amount: 1, counterparty: [2], description: [] },
      }),
    );
    expect(r.transactions[0]).toMatchObject({ date: '2024-01-01', amount: -100, counterparty: 'Valaki' });
  });
});
