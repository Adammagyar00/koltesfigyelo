// Kitalált Erste-szerű mintakivonat generálása teszteléshez (Windows-1250 kódolással).
// Futtatás: node scripts/generate-sample.mjs
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const months = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const rows = [];
const add = (date, partner, amount, note = '') => rows.push({ date, partner, amount, note });
const fmt = (n) => (n < 0 ? '-' : '') + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',00';

for (const [mi, m] of months.entries()) {
  const last = m === '2026-11' ? 11 : 28;
  const d = (day) => `${m.replace('-', '.')}.${String(day).padStart(2, '0')}.`;
  add(d(1), 'Minta Munkáltató Kft.', 520000, 'Munkabér');
  add(d(3), 'Albérlet – Kovács Anna', -180000, 'Lakbér');
  add(d(5), 'NETFLIX.COM', -4490);
  add(d(7), 'SPOTIFY', -2390);
  add(d(9), 'MVM Next Energiakereskedelmi Zrt.', -14200 - mi * 300);
  if (d(10) <= d(last)) add(d(10), 'Yettel Magyarország', -8990);
  add(d(2), '', -1500, 'Számlavezetési díj');
  for (let day = 1; day <= last; day++) {
    if (rnd() < 0.35) add(d(day), pick(['LIDL MAGYARORSZAG BT', 'SPAR MAGYARORSZAG KFT', 'TESCO-GLOBAL ZRT', 'ALDI MAGYARORSZAG']), -Math.round(3000 + rnd() * 14000));
    // A szeptembertől megugró ételrendelés – erre kell tippet adnia az appnak.
    const woltChance = mi >= 3 ? 0.45 : 0.12;
    if (rnd() < woltChance) add(d(day), pick(['WOLT', 'FOODORA', 'STARBUCKS COFFEE']), -Math.round(1800 + rnd() * 4200));
    if (rnd() < 0.08) add(d(day), 'MOL TOLTOALLOMAS 1234', -Math.round(15000 + rnd() * 9000));
    if (rnd() < 0.05) add(d(day), 'Kisbolt Bt.', -Math.round(800 + rnd() * 2000));
  }
  if (15 <= last) add(d(15), 'BKK Budapesti Közlekedési', -8950, 'Havibérlet');
}
rows.sort((a, b) => a.date.localeCompare(b.date));

const header = 'Könyvelés dátuma;Tranzakció dátuma;Partner neve;Partner számlaszáma;Összeg;Pénznem;Közlemény;Tranzakció azonosító';
const lines = rows.map((r, i) => [r.date, r.date, r.partner, '', fmt(r.amount), 'HUF', r.note, `MINTA${String(i).padStart(5, '0')}`].join(';'));
const text = ['Számlaszám;11600006-00000000-00000000', 'Időszak;2026.07.01.-2026.11.11.', '', header, ...lines, 'Záró egyenleg;;;;;;;'].join('\r\n');

const cp = '€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙';
const bytes = Buffer.from([...text].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x80 + cp.indexOf(ch))));
writeFileSync(new URL('../sample-data/erste-minta.csv', import.meta.url), bytes);
console.log(`${rows.length} sor -> sample-data/erste-minta.csv`);
