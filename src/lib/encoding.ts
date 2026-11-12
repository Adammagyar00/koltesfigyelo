/**
 * A magyar banki exportok gyakran Windows-1250 kódolásúak, nem UTF-8-ak.
 * Mivel a React Native (Hermes) TextDecoder csak UTF-8-at ismer, a dekódolást kézzel végezzük.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/\-_]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64_LOOKUP[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Szigorú UTF-8 dekódolás; null, ha a bájtsor nem érvényes UTF-8. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // BOM
  const parts: string[] = [];
  let chunk: number[] = [];
  const flush = () => {
    parts.push(String.fromCodePoint(...chunk));
    chunk = [];
  };
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    let extra: number;
    if (b < 0x80) {
      cp = b;
      extra = 0;
    } else if (b >= 0xc2 && b <= 0xdf) {
      cp = b & 0x1f;
      extra = 1;
    } else if (b >= 0xe0 && b <= 0xef) {
      cp = b & 0x0f;
      extra = 2;
    } else if (b >= 0xf0 && b <= 0xf4) {
      cp = b & 0x07;
      extra = 3;
    } else {
      return null;
    }
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if ((extra === 2 && cp < 0x800) || (extra === 3 && (cp < 0x10000 || cp > 0x10ffff))) return null;
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
    chunk.push(cp);
    if (chunk.length >= 4096) flush();
    i += extra + 1;
  }
  flush();
  return parts.join('');
}

// Windows-1250, 0x80-0xFF. A definiálatlan helyeken U+FFFD.
const CP1250_HIGH =
  '€�‚�„…†‡�‰Š‹ŚŤŽŹ' +
  '�‘’“”•–—�™š›śťžź' +
  ' ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż' +
  '°±˛ł´µ¶·¸ąş»Ľ˝ľż' +
  'ŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎ' +
  'ĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢß' +
  'ŕáâăäĺćçčéęëěíîď' +
  'đńňóôőö÷řůúűüýţ˙';

export function decodeCp1250(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += b < 0x80 ? String.fromCharCode(b) : CP1250_HIGH[b - 0x80];
  }
  return s;
}

/** Fájltartalom szöveggé: UTF-8, ha érvényes, különben Windows-1250. */
export function decodeBankFile(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1250' } {
  const utf8 = decodeUtf8Strict(bytes);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  return { text: decodeCp1250(bytes), encoding: 'windows-1250' };
}
