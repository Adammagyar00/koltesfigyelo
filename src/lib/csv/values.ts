export type DecimalSeparator = ',' | '.';

/**
 * Egy oszlop értékei alapján kitalálja a tizedesjelet.
 * "-1 234,50" -> ','   "-12.50" -> '.'   Ha nem dönthető el (csak egész számok), magyar alapértelmezés: ','.
 */
export function inferDecimalSeparator(values: string[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const v = raw.replace(/[\s ]/g, '');
    if (/,\d{1,2}$/.test(v)) comma++;
    else if (/\.\d{1,2}$/.test(v)) dot++;
    else if (/\d,\d{3}\.\d+$/.test(v)) dot++;
    else if (/\d\.\d{3},\d+$/.test(v)) comma++;
  }
  return dot > comma ? '.' : ',';
}

/**
 * Összeg értelmezése a magyar és nemzetközi formátumokból.
 * Kezeli: szóköz/nem törő szóköz ezreselválasztó, pénznem-jelölés ("Ft", "HUF"),
 * zárójeles negatív szám, záró mínuszjel ("1234-").
 */
export function parseAmount(raw: string, decimal: DecimalSeparator = ','): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  ']/g, '').replace(/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű€$£]+/g, '');
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  const thousands = decimal === ',' ? '.' : ',';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Dátum értelmezése YYYY-MM-DD formára.
 * Elfogadja: 2024-01-15, 2024.01.15., 2024. 01. 15., 2024/01/15, 15-01-2024, 15.01.2024, 15/01/2024,
 * opcionális időponttal a végén ("2024-01-15 10:22:33", "2024-01-15T10:22:33Z").
 */
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\.\s+/g, '.');
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?(?:[ T].*)?$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})\.?(?:[ T].*)?$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return null;
}

/** FNV-1a 32 bites hash, hex. Determinisztikus tételazonosítóhoz. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 64 bites stabil azonosító (két független FNV-kör), hogy több ezer tételnél se legyen ütközés. */
export function stableId(input: string): string {
  return fnv1a(input) + fnv1a(`${input.length}#${input}`);
}
