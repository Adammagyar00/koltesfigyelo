import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { base64ToBytes, bytesToBase64, decodeUtf8Strict, utf8Encode } from './encoding';

/**
 * Jelszóval titkosított biztonsági mentés.
 * Kulcs: PBKDF2-SHA256 a jelszóból (véletlen sóval), titkosítás: AES-256-GCM (hitelesített, így a
 * hibás jelszó vagy a módosított fájl biztosan kiderül). A jelszót sehol nem tároljuk.
 */
export interface EncryptedBackup {
  app: 'koltesfigyelo';
  version: 1;
  encrypted: true;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  nonce: string;
  data: string;
}

export const DEFAULT_ITERATIONS = 150_000;
export const MIN_PASSWORD_LENGTH = 6;

function deriveKey(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, utf8Encode(password.normalize('NFC')), salt, { c: iterations, dkLen: 32 });
}

export function isEncryptedBackup(x: unknown): x is EncryptedBackup {
  const d = x as Partial<EncryptedBackup> | null;
  return !!d && d.app === 'koltesfigyelo' && d.encrypted === true && typeof d.data === 'string';
}

export function encryptBackup(
  json: string,
  password: string,
  randomBytes: (n: number) => Uint8Array,
  iterations = DEFAULT_ITERATIONS,
): EncryptedBackup {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`A jelszó legalább ${MIN_PASSWORD_LENGTH} karakter legyen.`);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = deriveKey(password, salt, iterations);
  const data = gcm(key, nonce).encrypt(utf8Encode(json));
  return {
    app: 'koltesfigyelo',
    version: 1,
    encrypted: true,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
    data: bytesToBase64(data),
  };
}

/** A visszafejtett mentés JSON-szövege; hibás jelszónál vagy sérült fájlnál magyar hibaüzenettel dob. */
export function decryptBackup(enc: EncryptedBackup, password: string): string {
  if (enc.kdf !== 'pbkdf2-sha256' || !(enc.iterations > 0)) throw new Error('Ismeretlen titkosítási formátum.');
  const key = deriveKey(password, base64ToBytes(enc.salt), enc.iterations);
  let plain: Uint8Array;
  try {
    plain = gcm(key, base64ToBytes(enc.nonce)).decrypt(base64ToBytes(enc.data));
  } catch {
    throw new Error('Hibás jelszó, vagy a mentésfájl sérült.');
  }
  const text = decodeUtf8Strict(plain);
  if (text === null) throw new Error('A mentésfájl sérült.');
  return text;
}
