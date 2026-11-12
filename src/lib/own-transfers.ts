import { normalize } from './text';
import type { ParsedTransaction, Transaction } from './types';

/**
 * Saját számlák közötti átvezetések felismerése. Ezek nem költések és nem bevételek,
 * ezért az "Átvezetés (saját)" kategóriába kerülnek, amit az összesítések kihagynak.
 */

export const TRANSFER_CATEGORY = 'atvezetes';

export interface OwnProfile {
  /** A felhasználó neve(i), ahogy a bankszámlán szerepelnek (pl. "Kovács Anna"). */
  names: string[];
  /** Saját számlaszámok (bármilyen tagolással), vagy IBAN-ok. */
  accounts: string[];
}

export const EMPTY_PROFILE: OwnProfile = { names: [], accounts: [] };

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** A számlaszám szóközök, kötőjelek és IBAN-előtag nélkül; a 8 jegynél rövidebbeket nem vesszük figyelembe. */
function accountKeys(accounts: string[]): string[] {
  const keys = new Set<string>();
  for (const a of accounts) {
    let d = digitsOnly(a.replace(/^\s*[A-Z]{2}\d{2}/i, '')); // IBAN: országkód + ellenőrző jegyek le
    if (d.length < 8) continue;
    // A 3×8 jegyű magyar számlaszám végén a "00000000" gyakran el is maradhat.
    if (d.length === 24 && d.endsWith('00000000')) keys.add(d.slice(0, 16));
    keys.add(d);
  }
  return [...keys];
}

/** A név minden szava szerepel-e a szövegben (sorrendtől függetlenül: "Kovács Anna" = "ANNA KOVACS"). */
function nameMatches(text: string, name: string): boolean {
  const tokens = normalize(name).split(' ').filter((t) => t.length >= 2);
  if (tokens.length < 2) return false; // egyetlen szó (pl. csak vezetéknév) túl sok mindenre illene
  const words = new Set(text.split(/[^A-Z0-9]+/));
  return tokens.every((t) => words.has(t));
}

export type OwnMatch = 'name' | 'account';

export function matchOwnTransfer(
  tx: Pick<ParsedTransaction, 'counterparty' | 'description'>,
  profile: OwnProfile,
): OwnMatch | null {
  const text = normalize(`${tx.counterparty} ${tx.description}`);
  if (profile.names.some((n) => nameMatches(text, n))) return 'name';
  const keys = accountKeys(profile.accounts);
  if (keys.length) {
    // Számlaszámok a szövegben: a számjegyek tagolás nélkül, de csak a hosszú számsorozatokat nézzük.
    const runs = (`${tx.counterparty} ${tx.description}`.match(/\d[\d\s-]{6,}\d/g) ?? []).map(digitsOnly);
    if (runs.some((r) => keys.some((k) => r.includes(k) || (r.length >= 16 && k.startsWith(r))))) return 'account';
  }
  return null;
}

/**
 * Párok keresése két különböző bank között: ugyanakkora összeg megy ki az egyikből és jön be a
 * másikba, legfeljebb 2 napon belül (pl. Erste → Wise feltöltés). Csak a nem kézzel besorolt
 * tételeket párosítja; mindegyik tétel legfeljebb egy párba kerül.
 */
export function findTransferPairs(txs: Transaction[]): Set<string> {
  const out = new Set<string>();
  const candidates = txs.filter((t) => t.categorySource !== 'user');
  const incoming = candidates.filter((t) => t.amount > 0);
  const used = new Set<string>();
  const day = (d: string) => Date.parse(d) / 86_400_000;
  for (const o of candidates) {
    if (o.amount >= 0 || used.has(o.id)) continue;
    const match = incoming.find(
      (i) =>
        !used.has(i.id) &&
        i.bank !== o.bank &&
        i.currency === o.currency &&
        Math.abs(i.amount + o.amount) < 0.005 &&
        Math.abs(day(i.date) - day(o.date)) <= 2,
    );
    if (match) {
      used.add(o.id);
      used.add(match.id);
      out.add(o.id);
      out.add(match.id);
    }
  }
  return out;
}

/** A profil normalizált, üres soroktól mentes változata. */
export function cleanProfile(p: OwnProfile): OwnProfile {
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return { names: clean(p.names), accounts: clean(p.accounts) };
}
