import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptBackup, encryptBackup, isEncryptedBackup } from '../backup-crypto';
import { base64ToBytes, bytesToBase64, utf8Encode } from '../encoding';

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const json = JSON.stringify({ app: 'koltesfigyelo', version: 1, transactions: [{ counterparty: 'Árvíztűrő tükörfúrógép 🛒' }] });

describe('encoding helpers', () => {
  it('round-trips base64 and matches Node', () => {
    for (const n of [0, 1, 2, 3, 31, 100]) {
      const b = rnd(n);
      expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
      expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    }
  });

  it('encodes UTF-8 like Node', () => {
    expect(Array.from(utf8Encode('Őz 🛒 €'))).toEqual(Array.from(Buffer.from('Őz 🛒 €', 'utf8')));
  });
});

describe('encrypted backup', () => {
  it('encrypts and decrypts with the right password', () => {
    const enc = encryptBackup(json, 'titkos-jelszo', rnd, 1000);
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc.data).not.toContain('Árvíztűrő');
    expect(JSON.stringify(enc)).not.toContain('tükörfúrógép');
    expect(decryptBackup(enc, 'titkos-jelszo')).toBe(json);
  });

  it('rejects a wrong password and a tampered file', () => {
    const enc = encryptBackup(json, 'titkos-jelszo', rnd, 1000);
    expect(() => decryptBackup(enc, 'rossz-jelszo')).toThrow('Hibás jelszó');
    const bytes = base64ToBytes(enc.data);
    bytes[5] ^= 1;
    expect(() => decryptBackup({ ...enc, data: bytesToBase64(bytes) }, 'titkos-jelszo')).toThrow('Hibás jelszó');
  });

  it('requires a password of at least 6 characters', () => {
    expect(() => encryptBackup(json, '123', rnd)).toThrow('legalább 6');
  });
});
