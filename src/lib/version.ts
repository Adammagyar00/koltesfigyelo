/** "v1.2.3" / "1.2.3" -> [1, 2, 3]; érvénytelen részek 0-nak számítanak. */
function parts(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.-]/)
    .slice(0, 3)
    .map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
}

/** Pozitív, ha `a` újabb, mint `b`; negatív, ha régebbi; 0, ha azonos. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
