/**
 * Szöveg normalizálása egyeztetéshez: nagybetű, ékezetek nélkül, összevont szóközök.
 * "Wolt  Budapest Kft." -> "WOLT BUDAPEST KFT."
 */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[ \s]+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const boundaryCache = new Map<string, RegExp>();

/**
 * Igaz, ha a (normalizált) mintát a szöveg "szóhatáron" tartalmazza,
 * tehát a "BOLT" nem illeszkedik a "DOHANYBOLT"-ra, a "MOL" pedig a "MOLNAR"-ra.
 */
export function containsToken(normalizedText: string, normalizedPattern: string): boolean {
  if (!normalizedPattern) return false;
  let re = boundaryCache.get(normalizedPattern);
  if (!re) {
    re = new RegExp(`(^|[^A-Z0-9])${escapeRegex(normalizedPattern)}($|[^A-Z0-9])`);
    boundaryCache.set(normalizedPattern, re);
  }
  return re.test(normalizedText);
}

const NOISE_TOKENS = new Set([
  'KFT', 'ZRT', 'NYRT', 'BT', 'KFT.', 'ZRT.', 'BT.', 'HU', 'HUN', 'BUDAPEST', 'BP', 'HUNGARY',
  'VASARLAS', 'KARTYAS', 'KARTYA', 'POS', 'TRANZAKCIO', 'TERHELES', 'CARD', 'TRANSACTION',
  'PAYMENT', 'PURCHASE', 'FIZETES', 'ATUTALAS', 'BANKKARTYAS', 'ONLINE', 'WWW',
]);

/**
 * Kereskedő-kulcs egy tételből: ebből javaslunk szabályt, és ezzel csoportosítjuk
 * az ismétlődő terheléseket. Kiszűri a számokat, dátumokat, kártyaszámokat és a
 * gyakori zajszavakat (KFT, VASARLAS, BUDAPEST, ...).
 */
export function merchantKey(counterparty: string, description: string): string {
  const source = normalize(counterparty) || normalize(description);
  const tokens = source
    .split(/[\s,;:/*#|]+/)
    .map((t) => t.replace(/^[^A-Z0-9]+|[^A-Z0-9.&]+$/g, '').replace(/\.+$/, ''))
    .filter((t) => t.length >= 2 && !/\d/.test(t) && !NOISE_TOKENS.has(t));
  if (tokens.length === 0) return '';
  // Rövid első szó (pl. "DM", "H&M", "MAV") mellé jöhet a második is, ha az is értelmes.
  if (tokens[0].length <= 3 && tokens[1] && tokens[1].length >= 3) return `${tokens[0]} ${tokens[1]}`;
  return tokens[0];
}
