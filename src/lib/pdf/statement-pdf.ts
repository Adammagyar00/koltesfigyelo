import { stableId } from '../csv/values';
import { normalize } from '../text';
import type { BankId, ParsedTransaction } from '../types';

/**
 * Bankszámlakivonat PDF-ből kinyert szövegének feldolgozása.
 *
 * A natív kinyerő soronként adja a szöveget, az oszlopok közé tabulátort tesz. Feltételezések
 * (az Erste kivonatán ellenőrizve, de a legtöbb magyar banki kivonatra igaz):
 *  - minden tétel egy dátummal kezdődő sorban indul (könyvelés dátuma, utána értéknap);
 *  - a dátumsorban: megnevezés, (referencia), összeg, egyenleg, és zárójelben az illeték – pl. "(0,00)";
 *  - a következő sorok részletek: vagy a megnevezés folytatása, vagy "Címke: érték" mezők
 *    (Elfogadó, Partner számlatulajdonos, Megbízó, Közlemény, IBAN szám...);
 *  - a "Zárolások" rész (még le nem könyvelt tételek) után nincs több könyvelt tétel.
 * Az egyenlegoszlopot az egymást követő sorok egyenlegének változásából ismerjük fel; ha az összegnél
 * nincs előjel, az előjelet is ebből határozzuk meg.
 */

export interface PdfPendingItem {
  date: string;
  /** Negatív = várható kiadás. */
  amount: number;
  currency: string;
  description: string;
}

export interface PdfParseResult {
  transactions: ParsedTransaction[];
  /** Zárolt, még le nem könyvelt tételek (pl. Erste "Zárolások" rész). */
  pending: PdfPendingItem[];
  /** A kivonat pénzneme (a fejléc "Devizanem" mezőjéből), ha felismertük. */
  currency: string;
  skipped: { row: number; reason: string }[];
  /** Ha az előjelet nem tudtuk biztosan megállapítani, itt jelezzük. */
  warnings: string[];
  /** A felismert sorok száma (diagnosztikához). */
  lineCount: number;
}

const DATE_RE = /(?:^|\s)((?:19|20)\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?(?=\s|$)|(?:^|\s)(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})\.?(?=\s|$)/g;
const LEADING_DATE_RE = /^\s*(?:((?:19|20)\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?|(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)\d{2})\.?)(?=\s|$)/;

/** Összeg: opcionális előjel, ezres tagolás szóközzel vagy ponttal, opcionális tizedes vessző. */
const MONEY_RE = /(^|\s)([-+−]?)\s?(\d{1,3}(?:[ .]\d{3})+|\d{1,7})(,\d{1,2})?(?:\s?(HUF|Ft|EUR|USD|GBP|CHF))?(?=$|\s)/g;

/** Zárójeles érték (illeték, pl. "(0,00)", "(90,00)") vagy üres jelölés "( - )" – ez nem a tétel összege. */
const PAREN_RE = /\(\s*[-+−]?\s*[\d\s.,]*\)/g;

/** Ilyen sorok lezárják az előző tétel részleteit. */
const STOP_WORDS = [
  'NYITO EGYENLEG', 'ZARO EGYENLEG', 'NYITOEGYENLEG', 'ZAROEGYENLEG', 'OSSZESEN', 'EGYENLEG', 'OLDAL',
  'ATHOZAT', 'ATVITEL', 'KIVONAT', 'IDOSZAK', 'TERHELESEK OSSZESEN', 'JOVAIRASOK OSSZESEN',
  'KONYVELES DATUMA', 'ERTEKNAP', 'PAGE', 'BALANCE', 'BANKSZAMLAKIVONAT', 'MASOLAT', 'UGYFEL NEVE',
];

/** Ezek után a kivonatban nincs több könyvelt tétel (zárolások, összesítők). */
const END_WORDS = ['ZARO EGYENLEG', 'ZAROEGYENLEG', 'ZAROLASOK', 'ZAROLT TETELEK', 'FUGGO TETELEK'];

const CREDIT_HINTS = ['JOVAIRAS', 'BEERKEZETT', 'BEERKEZO', 'MUNKABER', 'BER ', 'KAMATJOVAIRAS', 'VISSZATERITES', 'BEFIZETES', 'NYUGDIJ'];

/** Részletmezők: normalizált címke -> szerep. A többi címkés sort (kártyaszám, azonosítók...) kihagyjuk. */
const FIELD_ROLES: Record<string, 'merchant' | 'partner' | 'payer' | 'note' | 'account'> = {
  ELFOGADO: 'merchant',
  'PARTNER SZAMLATULAJDONOS': 'partner',
  'PARTNER NEVE': 'partner',
  KEDVEZMENYEZETT: 'partner',
  'KEDVEZMENYEZETT NEVE': 'partner',
  MEGBIZO: 'payer',
  'MEGBIZO NEVE': 'payer',
  KOZLEMENY: 'note',
  MEGJEGYZES: 'note',
  'IBAN SZAM': 'account',
  BANKSZAMLASZAM: 'account',
  SZAMLASZAM: 'account',
  'PARTNER SZAMLASZAMA': 'account',
};

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

/** Pénzösszegek egy sorban – a dátumok, időpontok, számlaszámok, kártyaszámok és zárójeles illetékek kiszűrésével. */
export function findMoney(line: string): Money[] {
  const cleaned = line
    .replace(/ | /g, ' ')
    .replace(PAREN_RE, ' ')
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
    const value = Number(intPart.replace(/[ .]/g, '') + (dec ? `.${dec.slice(1)}` : ''));
    if (!Number.isFinite(value)) continue;
    out.push({ value: sign === '-' || sign === '−' ? -value : value, signed: Boolean(sign), currency: cur });
  }
  return out;
}

interface Block {
  date: string;
  line: number;
  /** A dátumsor szöveges cellái (megnevezés). */
  title: string[];
  /** A megnevezés folytatása (címke nélküli sorok az első címkés sor előtt). */
  extra: string[];
  fields: { merchant?: string; partner?: string; payer?: string; note: string[]; account: string[] };
  money: Money[];
  /** Hány nem üres sor jött eddig a dátumsor után (a megnevezés folytatása csak az első kettő lehet). */
  seen: number;
}

function isStopLine(n: string): boolean {
  return STOP_WORDS.some((w) => n.startsWith(w) || n.includes(` ${w} `) || n === w);
}

/** "( - )" és zárójeles illeték kivétele, szóközök rendezése; a tabulátor (oszlophatár) marad. */
function cleanLine(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    .replace(PAREN_RE, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/ *\t[\t ]*/g, '\t')
    .replace(/^\t+|\t+$/g, '')
    .trim();
}

/** "Címke :\térték" vagy "Címke\térték" sor felbontása. Null, ha nem címkés sor. */
function splitLabel(line: string): { label: string; value: string } | null {
  const m = line.match(/^([^\t:]{2,60}?)\s*:\s*(?:\t\s*)?(.*)$/) ?? line.match(/^([^\t]{2,60})\t(.*)$/);
  if (!m) return null;
  const label = normalize(m[1]).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!label || !/[A-Z]{2}/.test(label)) return null;
  return { label, value: m[2].replace(/\t/g, ' ').trim() };
}

/** A dátumsor szöveges cellái: nem dátum, nem összeg, nem azonosító. */
function titleCells(line: string): string[] {
  return line
    .split('\t')
    .map((c) => c.replace(DATE_RE, ' ').trim())
    .filter((c) => c && !/^[-+−]?[\d\s.,]+$/.test(c) && !/^\d{6,}$/.test(c));
}

/**
 * Oldal alji jogi szöveg vagy lábléc: sorkizárt bekezdés (a szavak közé is tabulátor kerül, így egy sorban
 * 10+ "oszlop" van – egy táblázat fejléce ennél jóval kevesebb), vagy nyomdai azonosító sor.
 */
function isFooterLine(line: string): boolean {
  return (line.match(/\t/g)?.length ?? 0) >= 9 || /\.afp\b/i.test(line);
}

function collectBlocks(pages: string[]): { blocks: Block[]; lineCount: number } {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let lineNo = 0;
  let skipNextDate = false;
  let ended = false;
  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };
  pages.forEach((page, pageIndex) => {
    // A második oldaltól az oldal eleje ismétlődő fejléc (név, számlaszám, oszlopfejlécek): a tétel
    // részletei csak utána folytatódnak, ezért a fejléc végéig (vagy az első dátumsorig) mindent kihagyunk.
    let inHeader = pageIndex > 0;
    let inFooter = false;
    for (const raw of page.split(/\r?\n/)) {
      lineNo++;
      if (ended || inFooter) continue;
      const line = cleanLine(raw);
      if (!line) continue;
      const n = normalize(line.replace(/\t/g, ' '));
      if (END_WORDS.some((w) => n.startsWith(w))) {
        close();
        ended = true;
        continue;
      }
      const lead = line.match(LEADING_DATE_RE);
      const date = lead ? toISO(lead) : null;
      if (inHeader && !date) {
        if (n.startsWith('DATUMA')) inHeader = false; // az oszlopfejléc második sora ("dátuma (PTI+KPTI)")
        continue;
      }
      inHeader = false;
      if (!date && isFooterLine(line)) {
        // A jogi szöveg/lábléc az oldal végéig tart; a tétel a következő oldalon folytatódhat.
        inFooter = !/\.afp\b/i.test(line) || inFooter;
        continue;
      }
      if (date) {
        close();
        // A "Nyitó egyenleg" utáni dátumsor maga a nyitó egyenleg, nem tétel.
        if (skipNextDate) {
          skipNextDate = false;
          continue;
        }
        current = {
          date,
          line: lineNo,
          title: titleCells(line),
          extra: [],
          fields: { note: [], account: [] },
          money: findMoney(line),
          seen: 0,
        };
        continue;
      }
      if (isStopLine(n)) {
        close();
        if (n.startsWith('NYITO EGYENLEG') || n.startsWith('NYITOEGYENLEG')) {
          // Ha a nyitó egyenleg összege ugyanebben a sorban van, nincs külön dátumsor.
          skipNextDate = findMoney(line).length === 0;
        }
        continue;
      }
      if (!current) continue;
      current.seen++;
      // Ha a dátumsorban nem volt összeg, a következő sorból vesszük.
      if (current.money.length === 0) current.money = findMoney(line);
      const lf = splitLabel(line);
      const role = lf ? FIELD_ROLES[lf.label] : undefined;
      if (lf && role) {
        if (role === 'note' || role === 'account') {
          if (lf.value) current.fields[role].push(lf.value);
        } else if (!current.fields[role] && lf.value) {
          current.fields[role] = lf.value;
        }
      } else if (!lf && !line.includes('\t') && current.seen <= 2 && !hasLabels(current)) {
        // Címke nélküli sor a részletek előtt: a megnevezés folytatása.
        current.extra.push(line);
      }
    }
  });
  close();
  return { blocks, lineCount: lineNo };
}

function hasLabels(b: Block): boolean {
  const f = b.fields;
  return Boolean(f.merchant || f.partner || f.payer || f.note.length || f.account.length);
}

function stripNumbers(s: string): string {
  return s
    .replace(DATE_RE, ' ')
    .replace(/(^|\s)[-+−]?\s?(\d{1,3}(?:[ .]\d{3})+|\d{1,7})(,\d{1,2})?(\s?(HUF|Ft|EUR|USD|GBP|CHF))?(?=$|\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

/** A kivonat pénzneme a fejlécből ("Devizanem\tEUR"); a tételrészletek "Devizanem, összeg:" sorait kihagyja. */
export function detectStatementCurrency(pages: string[]): string | null {
  for (const raw of (pages[0] ?? '').split(/\r?\n/).slice(0, 60)) {
    const m = normalize(raw.replace(/\t/g, ' ')).match(/\bDEVIZANEM\s+([A-Z]{3})\b/);
    if (m) return m[1];
  }
  return null;
}

/** A "Zárolások" rész sorai: dátum, típus, részletek, zárolt összeg; a kereskedő a következő sor(ok)ban. */
function collectPending(pages: string[], currency: string): PdfPendingItem[] {
  const lines = pages.join('\n').split(/\r?\n/);
  const start = lines.findIndex((l) => normalize(l).startsWith('ZAROLASOK'));
  if (start < 0) return [];
  const out: PdfPendingItem[] = [];
  let current: { date: string; amount: number; text: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.text
      .join(' ')
      .replace(/Eredeti\b.*$/i, '')
      .replace(/Terminal:\S+/gi, ' ')
      .replace(/\+?\d[\d ]{7,}\d/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ date: current.date, amount: current.amount, currency, description: text || 'Zárolt kártyás tétel' });
    current = null;
  };
  for (const raw of lines.slice(start + 1)) {
    const line = cleanLine(raw);
    if (!line || isFooterLine(line)) continue;
    const lead = line.match(LEADING_DATE_RE);
    const date = lead ? toISO(lead) : null;
    if (date) {
      flush();
      const cells = line.split('\t');
      const money = findMoney(cells[cells.length - 1] ?? '');
      if (money.length) current = { date, amount: -Math.abs(money[money.length - 1].value), text: [] };
      continue;
    }
    if (current && current.text.length < 2) current.text.push(line.replace(/\t/g, ' '));
  }
  flush();
  return out;
}

export function parsePdfStatement(pages: string[], bank: BankId, defaultCurrency?: string): PdfParseResult {
  const currency = defaultCurrency ?? detectStatementCurrency(pages) ?? 'HUF';
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
  // Ha a kivonat a terheléseket mínuszjellel írja, az előjel nélküli összeg jóváírás.
  const anySigned = usable.some((b) => b.money.some((m) => m.signed && m.value < 0));

  const transactions: ParsedTransaction[] = [];
  const occurrences = new Map<string, number>();
  let guessedSigns = 0;

  usable.forEach((b, i) => {
    let amount: number;
    let txCurrency = currency;
    const a =
      withBalance && b.money.length >= 2
        ? b.money[b.money.length - 2]
        : ([...b.money].reverse().find((m) => m.signed) ?? b.money[b.money.length - 1]);
    txCurrency = a.currency && a.currency !== 'Ft' ? a.currency : txCurrency;

    if (a.signed || (anySigned && a.value > 0)) {
      amount = a.value;
    } else if (withBalance && b.money.length >= 2) {
      // Előjel az egyenleg változásából: a tétel utáni egyenleg mínusz az előző (korábbi) tétel utáni egyenleg.
      // Időrendben a korábbi tétel felette van, fordított sorrendben (legújabb elöl) alatta.
      const prev = fit.order === 'forward' ? usable[i - 1] : usable[i + 1];
      if (prev && prev.money.length >= 2) {
        const diff = b.money[b.money.length - 1].value - prev.money[prev.money.length - 1].value;
        amount = diff < 0 ? -Math.abs(a.value) : Math.abs(a.value);
      } else {
        amount = -Math.abs(a.value);
        guessedSigns++;
      }
    } else {
      const text = normalize([...b.title, ...b.extra].join(' '));
      amount = CREDIT_HINTS.some((h) => text.includes(h.trim())) ? Math.abs(a.value) : -Math.abs(a.value);
      guessedSigns++;
    }
    if (amount === 0) {
      skipped.push({ row: b.line, reason: 'Nulla összeg' });
      return;
    }

    const f = b.fields;
    // Partner: kártyás vásárlásnál az elfogadóhely, utalásnál a partner, bejövő tételnél a megbízó.
    const counterparty = (f.merchant ?? f.partner ?? (amount > 0 ? f.payer : undefined) ?? f.payer ?? '').trim();
    const title = stripNumbers([...b.title, ...b.extra].join(' '));
    const description = [title, ...f.note, ...f.account.map((x) => `Számla: ${x}`)].filter(Boolean).join(' | ');

    const base = `${b.date}|${amount}|${txCurrency}|${normalize(counterparty)}|${normalize(title)}`;
    const n = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, n);
    transactions.push({
      id: `${bank}-${stableId(`pdf|${base}#${n}`)}`,
      date: b.date,
      amount: Math.round(amount * 100) / 100,
      currency: txCurrency,
      counterparty,
      description,
      bank,
    });
  });

  if (guessedSigns > 0) {
    warnings.push(
      `${guessedSigns} tételnél a kivonat nem jelölte, hogy terhelés vagy jóváírás, ezért a szövegből becsültük. Ellenőrizd az előnézetben.`,
    );
  }
  // Időrend: a legrégebbi elöl, hogy az előnézet egységes legyen.
  transactions.sort((x, y) => x.date.localeCompare(y.date));
  return { transactions, skipped, warnings, lineCount, currency, pending: collectPending(pages, currency) };
}
