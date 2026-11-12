import { stableId } from '../csv/values';
import { normalize } from '../text';
import type { BankId, ParsedTransaction } from '../types';

/**
 * Bankszámlakivonat PDF-ből kinyert szövegének feldolgozása.
 *
 * A PDF-kivonatok táblázatos elrendezésűek, de a szövegkinyerés után csak sorok maradnak.
 * Feltételezések (a legtöbb magyar banki kivonatra igaz):
 *  - minden tétel egy dátummal kezdődő sorban indul (pl. "2026.11.03."), utána jöhet még egy dátum (értéknap);
 *  - a következő, dátum nélküli sorok a tétel közleményének folytatásai;
 *  - a sorban az utolsó pénzösszeg vagy maga a tétel összege, vagy – ha van egyenlegoszlop – az egyenleg,
 *    és előtte áll a tétel összege.
 * Az egyenlegoszlopot az egymást követő sorok egyenlegének változásából ismerjük fel; ilyenkor az előjelet
 * is ebből határozzuk meg, így a "Terhelés" / "Jóváírás" külön oszlopos kivonatoknál is helyes az előjel.
 */

export interface PdfParseResult {
  transactions: ParsedTransaction[];
  skipped: { row: number; reason: string }[];
  /** Ha az előjelet nem tudtuk biztosan megállapítani, itt jelezzük. */
  warnings: string[];
  /** A felismert sorok száma (diagnosztikához). */
  lineCount: number;
}

const DATE_RE = /(?:^|\s)((?:19|20)\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?(?=\s|$)|(?:^|\s)(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})\.?(?=\s|$)/g;
const LEADING_DATE_RE = /^\s*(?:((?:19|20)\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?|(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})\.?)(?=\s|$)/;

/** Összeg: opcionális előjel, ezres tagolás szóközzel vagy ponttal, opcionális tizedes vessző. */
const MONEY_RE = /(^|[\s(])([-+−]?)\s?(\d{1,3}(?:[ .]\d{3})+|\d{1,7})(,\d{1,2})?(?:\s?(HUF|Ft|EUR|USD|GBP|CHF))?(?=$|[\s)])/g;

/** Ilyen sorok nem tételek, és lezárják az előző tétel közleményét. */
const STOP_WORDS = [
  'NYITO EGYENLEG', 'ZARO EGYENLEG', 'NYITOEGYENLEG', 'ZAROEGYENLEG', 'OSSZESEN', 'EGYENLEG', 'OLDAL',
  'ATHOZAT', 'ATVITEL', 'KIVONAT', 'SZAMLASZAM', 'IDOSZAK', 'TERHELESEK OSSZESEN', 'JOVAIRASOK OSSZESEN',
  'KONYVELES DATUMA', 'ERTEKNAP', 'PAGE', 'BALANCE',
];

const CREDIT_HINTS = ['JOVAIRAS', 'BEERKEZETT', 'BEERKEZO', 'MUNKABER', 'BER ', 'KAMATJOVAIRAS', 'VISSZATERITES', 'BEFIZETES', 'NYUGDIJ'];

const pad = (n: number) => String(n).padStart(2, '0');

function toISO(m: RegExpMatchArray | RegExpExecArray): string | null {
  const y = Number(m[1] ?? m[6]);
  const mo = Number(m[2] ?? m[5]);
  const d = Number(m[3] ?? m[4]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

interface Money {
  value: number;
  signed: boolean;
  currency?: string;
}

/** Pénzösszegek egy sorban – a dátumok, időpontok, számlaszámok és kártyaszámok kiszűrésével. */
export function findMoney(line: string): Money[] {
  const cleaned = line
    .replace(/ | /g, ' ')
    .replace(/\t+/g, ' | ') // oszlophatár: két szomszédos oszlop számai ne olvadjanak össze
    .replace(DATE_RE, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ') // időpont
    .replace(/\b\d{4,}(?:-\d{4,})+\b/g, ' ') // számlaszám
    .replace(/[*xX]{2,}\s?\d{2,4}\b/g, ' ') // maszkolt kártyaszám
    .replace(/\b\d{8,}\b/g, ' '); // hosszú azonosítók
  const out: Money[] = [];
  for (const m of cleaned.matchAll(MONEY_RE)) {
    const sign = m[2];
    const intPart = m[3];
    const dec = m[4];
    const cur = m[5];
    // A tagolás nélküli, tizedes és előjel nélküli 5+ jegyű szám inkább azonosító, nem összeg.
    if (!sign && !dec && !cur && /^\d{5,}$/.test(intPart)) continue;
    // Pont mint ezreselválasztó csak akkor, ha szabályos (1.234.567); egyébként sorszám lehet.
    const value = Number(intPart.replace(/[ .]/g, '') + (dec ? `.${dec.slice(1)}` : ''));
    if (!Number.isFinite(value)) continue;
    out.push({ value: sign === '-' || sign === '−' ? -value : value, signed: Boolean(sign), currency: cur });
  }
  return out;
}

interface Block {
  date: string;
  line: number;
  head: string;
  rest: string[];
  money: Money[];
}

function isStopLine(n: string): boolean {
  return STOP_WORDS.some((w) => n.startsWith(w) || n.includes(` ${w} `) || n === w);
}

function collectBlocks(pages: string[]): { blocks: Block[]; lineCount: number } {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let lineNo = 0;
  for (const page of pages) {
    for (const raw of page.split(/\r?\n/)) {
      lineNo++;
      // A tabulátor oszlophatár (a natív kinyerő teszi be), azt megtartjuk.
      const line = raw.replace(/ /g, ' ').replace(/[ \f\v]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim();
      if (!line) continue;
      const lead = line.match(LEADING_DATE_RE);
      const date = lead ? toISO(lead) : null;
      if (date) {
        if (current) blocks.push(current);
        const money = findMoney(line);
        current = { date, line: lineNo, head: line, rest: [], money };
        continue;
      }
      if (!current) continue;
      const n = normalize(line.replace(/\t/g, ' '));
      if (isStopLine(n)) {
        blocks.push(current);
        current = null;
        continue;
      }
      // Ha a dátumsorban nem volt összeg, a következő sorból vesszük.
      if (current.money.length === 0) current.money = findMoney(line);
      if (current.rest.length < 4) current.rest.push(line);
    }
    // Oldaltörésnél a tétel nem folytatódik (a következő oldal fejléccel indul).
    if (current) {
      blocks.push(current);
      current = null;
    }
  }
  return { blocks, lineCount: lineNo };
}

function description(b: Block): string {
  const strip = (s: string) =>
    s
      .replace(/\t+/g, ' ')
      .replace(DATE_RE, ' ')
      .replace(/(^|\s)[-+−]?\s?(\d{1,3}(?:[ .]\d{3})+|\d{1,7})(,\d{1,2})?(\s?(HUF|Ft|EUR|USD|GBP|CHF))?(?=$|\s)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return [strip(b.head), ...b.rest.map(strip)].filter(Boolean).join(' ').trim();
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.015;

/**
 * Megvizsgálja, hogy az utolsó szám egyenleg-e: az egymást követő tételeknél
 * egyenleg(i) = egyenleg(i-1) ± összeg(i). Időrendben és fordított sorrendben is próbálja.
 */
function balanceFit(blocks: Block[]): { ratio: number; order: 'forward' | 'backward' } {
  const rows = blocks.filter((b) => b.money.length >= 2);
  if (rows.length < 3) return { ratio: 0, order: 'forward' };
  const amt = (b: Block) => Math.abs(b.money[b.money.length - 2].value);
  const bal = (b: Block) => b.money[b.money.length - 1].value;
  let fwd = 0;
  let bwd = 0;
  for (let i = 1; i < rows.length; i++) {
    const diff = bal(rows[i]) - bal(rows[i - 1]);
    if (near(Math.abs(diff), amt(rows[i]))) fwd++;
    if (near(Math.abs(diff), amt(rows[i - 1]))) bwd++;
  }
  const n = rows.length - 1;
  return fwd >= bwd ? { ratio: fwd / n, order: 'forward' } : { ratio: bwd / n, order: 'backward' };
}

export function parsePdfStatement(pages: string[], bank: BankId, defaultCurrency = 'HUF'): PdfParseResult {
  const { blocks, lineCount } = collectBlocks(pages);
  const warnings: string[] = [];
  const skipped: PdfParseResult['skipped'] = [];
  const usable = blocks.filter((b) => {
    if (b.money.length === 0) {
      skipped.push({ row: b.line, reason: 'Nincs összeg a sorban' });
      return false;
    }
    return true;
  });

  const fit = balanceFit(usable);
  const withBalance = fit.ratio >= 0.6;
  const anySigned = usable.some((b) => b.money.some((m) => m.signed));

  const transactions: ParsedTransaction[] = [];
  const occurrences = new Map<string, number>();
  let guessedSigns = 0;

  usable.forEach((b, i) => {
    let amount: number;
    let currency = defaultCurrency;
    if (withBalance && b.money.length >= 2) {
      const a = b.money[b.money.length - 2];
      currency = a.currency && a.currency !== 'Ft' ? a.currency : currency;
      amount = Math.abs(a.value);
      // Előjel az egyenleg változásából: a tétel utáni egyenleg mínusz az előző (korábbi) tétel utáni egyenleg.
      // Időrendben a korábbi tétel felette van, fordított sorrendben (legújabb elöl) alatta.
      const prev = fit.order === 'forward' ? usable[i - 1] : usable[i + 1];
      if (a.signed) amount = a.value;
      else if (prev && prev.money.length >= 2) {
        const diff = b.money[b.money.length - 1].value - prev.money[prev.money.length - 1].value;
        amount = diff < 0 ? -amount : amount;
      } else {
        amount = -amount;
        guessedSigns++;
      }
    } else {
      // Egyenlegoszlop nélkül: az előjeles szám a tétel összege (az egyenleget jellemzően előjel nélkül írják),
      // ennek hiányában a sor utolsó összege.
      const a = [...b.money].reverse().find((m) => m.signed) ?? b.money[b.money.length - 1];
      currency = a.currency && a.currency !== 'Ft' ? a.currency : currency;
      amount = a.value;
      if (!anySigned) {
        const text = normalize(`${b.head} ${b.rest.join(' ')}`);
        amount = CREDIT_HINTS.some((h) => text.includes(h.trim())) ? Math.abs(amount) : -Math.abs(amount);
        guessedSigns++;
      }
    }
    if (amount === 0) {
      skipped.push({ row: b.line, reason: 'Nulla összeg' });
      return;
    }
    const desc = description(b);
    const base = `${b.date}|${amount}|${currency}|${normalize(desc)}`;
    const n = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, n);
    transactions.push({
      id: `${bank}-${stableId(`pdf|${base}#${n}`)}`,
      date: b.date,
      amount: Math.round(amount * 100) / 100,
      currency,
      counterparty: '',
      description: desc,
      bank,
    });
  });

  if (guessedSigns > 0) {
    warnings.push(
      `${guessedSigns} tételnél a kivonat nem jelölte, hogy terhelés vagy jóváírás, ezért a szövegből becsültük. Ellenőrizd az előnézetben.`,
    );
  }
  // Időrend: a legrégebbi elöl, hogy az előnézet egységes legyen.
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  return { transactions, skipped, warnings, lineCount };
}
