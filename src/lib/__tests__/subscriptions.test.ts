import { describe, expect, it } from 'vitest';

import { alertText, alertTime, detectSubscriptions, nextRenewal, upcomingRenewals } from '../subscriptions';
import type { Transaction } from '../types';

let n = 0;
const t = (date: string, amount: number, counterparty: string, categoryId = 'egyeb', currency = 'HUF'): Transaction => ({
  id: String(n++),
  date,
  amount,
  currency,
  counterparty,
  description: 'KÁRTYA HASZNÁLAT',
  bank: 'erste',
  categoryId,
  categorySource: 'rule',
  importedAt: 0,
});

describe('nextRenewal', () => {
  it('is later this month if the day is still ahead', () => {
    expect(nextRenewal(29, '2026-10-29', '2026-11-14')).toBe('2026-11-29');
  });

  it('moves to next month if the day has passed', () => {
    expect(nextRenewal(9, '2026-10-09', '2026-11-14')).toBe('2026-12-09');
  });

  it('moves to next month if this month was already charged early', () => {
    expect(nextRenewal(15, '2026-11-13', '2026-11-14')).toBe('2026-12-15');
  });

  it('today counts as due today', () => {
    expect(nextRenewal(14, '2026-10-14', '2026-11-14')).toBe('2026-11-14');
  });

  it('clamps to the end of short months', () => {
    expect(nextRenewal(31, '2027-01-31', '2027-02-10')).toBe('2027-02-28');
  });
});

describe('detectSubscriptions', () => {
  const today = '2026-11-14';

  it('treats a single charge in the subscriptions category as an assumed monthly subscription', () => {
    const [s] = detectSubscriptions([t('2026-10-09', -2190, 'Spotify P47BDA6 Stockholm', 'elofizetes')], today);
    expect(s).toMatchObject({ name: 'Spotify', amount: 2190, dayOfMonth: 9, nextDate: '2026-12-09', confirmed: false, stale: false, yearlyCost: 26280 });
  });

  it('confirms monthly charges from other categories and computes days until renewal', () => {
    const subs = detectSubscriptions(
      [t('2026-08-05', -4490, 'NETFLIX.COM'), t('2026-09-05', -4490, 'NETFLIX.COM'), t('2026-10-06', -4490, 'NETFLIX.COM')],
      today,
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: 'Netflix.com', months: 3, dayOfMonth: 5, nextDate: '2026-12-05', daysUntil: 21, confirmed: true });
  });

  it('detects price changes', () => {
    const [s] = detectSubscriptions(
      [t('2026-09-27', -1800, 'PAYPAL *DAZN 35314369001', 'elofizetes'), t('2026-10-27', -2200, 'PAYPAL *DAZN 35314369001', 'elofizetes')],
      today,
    );
    expect(s.name).toBe('Dazn');
    expect(s.priceChange).toEqual({ from: 1800, to: 2200 });
  });

  it('ignores frequent purchases, one-off charges and hidden subscriptions', () => {
    const coffee = [3, 8, 12, 20, 25].flatMap((d) => [t(`2026-10-${String(d).padStart(2, '0')}`, -1500, 'STARBUCKS'), t(`2026-09-${String(d).padStart(2, '0')}`, -1500, 'STARBUCKS')]);
    const oneOff = [t('2026-10-13', -13290, 'Google Pay HM Hennes Mau', 'vasarlas')];
    const hidden = [t('2026-10-29', -8642, 'ANTHROPIC* CLAU DUBLIN 4', 'elofizetes')];
    expect(detectSubscriptions([...coffee, ...oneOff, ...hidden], today, ['ANTHROPIC|HUF'])).toEqual([]);
  });

  it('marks long-silent subscriptions as stale and keeps them out of upcoming alerts', () => {
    const subs = detectSubscriptions(
      [t('2026-07-05', -3990, 'HBO MAX', 'elofizetes'), t('2026-11-01', -2390, 'SPOTIFY', 'elofizetes'), t('2026-10-20', -8642, 'ANTHROPIC*', 'elofizetes')],
      today,
    );
    expect(subs.map((s) => [s.name, s.stale])).toEqual([
      ['Anthropic', false], // nov. 20.
      ['Spotify', false], // dec. 1.
      ['HBO MAX', true],
    ]);
    expect(upcomingRenewals(subs, 7).map((s) => s.name)).toEqual(['Anthropic']);
  });
});

describe('alert timing', () => {
  const now = new Date(2026, 10, 14, 12, 0); // nov. 14. 12:00 helyi idő

  it('fires the given days before at 9:00', () => {
    expect(alertTime('2026-12-05', 1, now)).toEqual(new Date(2026, 11, 4, 9, 0));
    expect(alertTime('2026-12-05', 3, now)).toEqual(new Date(2026, 11, 2, 9, 0));
    expect(alertTime('2026-12-05', 0, now)).toEqual(new Date(2026, 11, 5, 9, 0));
  });

  it('falls back to the renewal day if the reminder time has passed, or skips it', () => {
    // holnapi megújulás, 3 nappal előtte már elmúlt -> holnap 9-kor
    expect(alertTime('2026-11-15', 3, now)).toEqual(new Date(2026, 10, 15, 9, 0));
    // mai megújulás, de 9 óra már elmúlt -> nincs értesítés
    expect(alertTime('2026-11-14', 1, now)).toBeNull();
  });

  it('writes a friendly title', () => {
    expect(alertText({ name: 'Netflix', nextDate: '2026-12-05' }, new Date(2026, 11, 4, 9))).toBe('Holnap megújul: Netflix');
    expect(alertText({ name: 'Netflix', nextDate: '2026-12-05' }, new Date(2026, 11, 5, 9))).toBe('Ma megújul: Netflix');
    expect(alertText({ name: 'Netflix', nextDate: '2026-12-05' }, new Date(2026, 11, 2, 9))).toBe('3 nap múlva megújul: Netflix');
  });
});

describe('names and types', () => {
  it('keeps the original accented spelling and separates subscriptions from other recurring charges', () => {
    const rent = ['2026-09-03', '2026-10-03', '2026-11-03'].map((d) => ({ ...t(d, -180000, 'Albérlet – Kovács Anna', 'lakhatas') }));
    const fee = ['2026-09-02', '2026-10-02'].map((d) => ({ ...t(d, -1500, '', 'dijak'), description: 'Számlavezetési díj' }));
    const spotify = [t('2026-10-09', -2190, 'Spotify P47BDA6 Stockholm', 'elofizetes')];
    const subs = detectSubscriptions([...rent, ...fee, ...spotify], '2026-11-14');
    expect(subs.map((s) => [s.name, s.type])).toEqual([
      ['Számlavezetési', 'recurring'],
      ['Albérlet', 'recurring'],
      ['Spotify', 'subscription'],
    ]);
  });
});
