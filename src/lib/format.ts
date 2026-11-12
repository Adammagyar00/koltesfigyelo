const MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
];

/** Ezres tagolás szóközzel, Intl nélkül is (a Hermes Intl-támogatása eszközönként eltér). */
function groupThousands(n: number): string {
  const [int, frac] = Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '−' : '') + grouped + (frac ? `,${frac}` : '');
}

export function formatMoney(amount: number, currency = 'HUF'): string {
  if (currency === 'HUF') return `${groupThousands(Math.round(amount))} Ft`;
  return `${groupThousands(Math.round(amount * 100) / 100)} ${currency}`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}. ${MONTHS[m - 1]}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${y}.${m}.${d}.`;
}

export function todayISO(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
