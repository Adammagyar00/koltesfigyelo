import { describe, expect, it } from 'vitest';

import { defaultRules } from '../categories';
import { categorize, sortRules } from '../categorize';
import { parsePdfStatement } from '../pdf/statement-pdf';

/**
 * Az Erste PDF-kivonatának szerkezete (a natív kinyerő kimenete, tabulátor = oszlophatár),
 * KITALÁLT nevekkel, számlaszámokkal és összegekkel. Lefedi: illeték zárójelben, nyitó egyenleg
 * dátumsora, részletmezők, oldal alji jogi szöveg és lábléc, következő oldali fejléc, oldalakon
 * átnyúló tétel, záró egyenleg és az utána következő zárolások.
 */
const T = '\t';
const page1 = [
  'Bankszámlakivonat ',
  `Bank neve, címe${T}ERSTE BANK HUNGARY ZRT.${T}1/2 oldal`,
  `Ügyfél neve, címe${T}TESZT ELEK${T}Kivonat száma${T}E 2026/10`,
  `Időszak ${T}2026.10.01. - 2026.10.31.`,
  `Bankszámlaszám${T}11600006-00000001-11111111${T}Devizanem ${T}HUF`,
  'BANKSZÁMLA FORGALMAK ',
  `Könyvelés ${T}Értéknap${T}Tranzakció megnevezése${T}Referencia${T}Összeg(+/-)${T}Egyenleg${T}Illeték (HUF)`,
  `dátuma${T}(PTI+KPTI)`,
  'Nyitó egyenleg ',
  `2026.10.01.${T}10.000`,
  `2026.10.01.${T}2026.10.01.${T}ONLINE AZONNALI DEVIZAKONVERZIÓ,${T}202608400001${T}25.000${T}35.000${T}(0,00)`,
  `LAKOSSÁG, ELEKTRONIKUS, HUF ELLENI${T}( - )`,
  `Devizanem, összeg:${T}67,91 EUR`,
  `Megbízó :${T}TESZT ELEK`,
  'TESZT ELEK                ',
  `Bankszámlaszám:${T}11600006-00000002-22222222`,
  `2026.10.02.${T}2026.10.02.${T}KÁRTYA HASZNÁLAT${T}-2.500${T}32.500${T}(0,00)`,
  '( - )',
  `Kártyaszám - Tr.időpont${T}111111xxxxxx9999 - 2026.09.30 12:53`,
  `Elfogadó${T}Google Pay LIDL HU 167 Bu`,
  `Kártyabirtokos neve:${T}TESZT ELEK`,
  `2026.10.05.${T}2026.10.04.${T}AZONNALI ÁTUTALÁS SAJÁT SZÁMLÁRA${T}-6.000${T}26.500${T}( - )`,
  `MOBILBANKON${T}( - )`,
  `IBAN szám:${T}HU35116000060000000233333333`,
  `Partner számlatulajdonos:${T}Erste CélBetét Megtakarítási Számla`,
  `2026.10.06.${T}2026.10.06.${T}KÁRTYA HASZNÁLAT - ATM${T}-10.000${T}16.500${T}(90,00)`,
  '( - )',
  `Elfogadó${T}PELDA ATM BUDAPEST`,
  `2026.10.06.${T}2026.10.06.${T}KÁRTYA HASZNÁLAT${T}-6.428${T}10.072${T}(0,00)`,
  '( - )',
  ['Ez', 'a', 'bankszámlakivonat', 'egyúttal', 'számviteli', 'bizonylatként', 'is', 'szolgál,', 'az', 'ebben', 'feltüntetett'].join(T),
  'dokumentum számítógépes úton, zárt rendszerben, emberi beavatkozás nélkül készült.',
  '63625   179918  5333_20261031_3_N_-_-_M_7_1_H.afp',
].join('\n');
const page2 = [
  'Bankszámlakivonat ',
  '2/2 oldal',
  `Ügyfél neve, címe${T}TESZT ELEK${T}Kivonat száma${T}E 2026/10`,
  `Bankszámlaszám${T}11600006-00000001-11111111${T}Devizanem ${T}HUF`,
  `Könyvelés ${T}Értéknap${T}Tranzakció megnevezése${T}Referencia${T}Összeg(+/-)${T}Egyenleg${T}Illeték (HUF)`,
  `dátuma${T}(PTI+KPTI)`,
  // az előző oldal utolsó tételének folytatása
  `Kártyaszám - Tr.időpont${T}111111xxxxxx9999 - 2026.10.05 18:00`,
  `Elfogadó${T}Google Pay HM Hennes Mau`,
  `Kártyabirtokos neve:${T}TESZT ELEK`,
  `2026.10.07.${T}2026.10.06.${T}KÁRTYA HASZNÁLAT - JÓV${T}876${T}10.948${T}( - )`,
  '( - )',
  `Elfogadó${T}Google Pay HM Hennes Mau`,
  `2026.10.07.${T}2026.10.07.${T}BANKON KÍVÜLI AZONNALI ÁTUTALÁS${T}200${T}11.148${T}( - )`,
  `JÓVÁÍRÁSA${T}( - )`,
  `Partner számlatulajdonos:${T}ELEK TESZT`,
  `Közlemény:${T}A Revolutról küldve`,
  `2026.10.27.${T}2026.10.27.${T}CSOPORTOS ÁTUTALÁS JÓVÁÍRÁSA${T}84.000${T}95.148${T}( - )`,
  '( - )',
  `Partner számlatulajdonos:${T}Minta Intézet`,
  `Tényleges kedvezményezett:${T}Teszt Elek`,
  `2026.10.29.${T}2026.10.29.${T}KÁRTYA HASZNÁLAT${T}-75.450${T}19.698${T}(0,00)`,
  '( - )',
  `Elfogadó${T}Google Pay Lightyear Tall`,
  `Záró egyenleg ${T}19.698`,
  'Zárolások és Végrehajtott, de még le nem könyvelt tranzakciók ',
  `Dátum${T}Zárolás típusa${T}Részletező információk${T}Zárolt összeg`,
  `2026.10.29.${T}ZÁROLVA - KÁRTYA FORGALOM${T}111111xxxxxx9999 Purchase 2026.10.29 15:13:04${T}398`,
].join('\n');

describe('parsePdfStatement – Erste layout', () => {
  const r = parsePdfStatement([page1, page2], 'erste');

  it('reads every booked transaction and the amounts add up to closing - opening balance', () => {
    expect(r.transactions).toHaveLength(9);
    const sum = r.transactions.reduce((s, t) => s + t.amount, 0);
    expect(sum).toBe(19698 - 10000);
    expect(r.warnings).toEqual([]);
  });

  it('ignores the fee in parentheses, the opening balance row and pending holds', () => {
    expect(r.transactions.map((t) => t.amount)).toEqual([25000, -2500, -6000, -10000, -6428, 876, 200, 84000, -75450]);
    expect(r.transactions.some((t) => t.amount === 10000 || t.amount === 398)).toBe(false);
  });

  it('takes the merchant / partner from the detail fields, also across a page break', () => {
    const byAmount = Object.fromEntries(r.transactions.map((t) => [t.amount, t]));
    expect(byAmount[-2500].counterparty).toBe('Google Pay LIDL HU 167 Bu');
    expect(byAmount[-6428].counterparty).toBe('Google Pay HM Hennes Mau');
    expect(byAmount[-6428].description).toBe('KÁRTYA HASZNÁLAT');
    expect(byAmount[-6000].counterparty).toBe('Erste CélBetét Megtakarítási Számla');
    expect(byAmount[25000].counterparty).toBe('TESZT ELEK');
    expect(byAmount[200].description).toContain('A Revolutról küldve');
  });

  it('categorizes Erste transaction types', () => {
    const rules = sortRules(defaultRules());
    const profile = { names: ['Teszt Elek'], accounts: [] };
    const cat = (amount: number) => categorize(r.transactions.find((t) => t.amount === amount)!, rules, profile).categoryId;
    expect(cat(25000)).toBe('atvezetes'); // devizakonverzió saját számláról
    expect(cat(-6000)).toBe('atvezetes'); // saját számlára (CélBetét)
    expect(cat(200)).toBe('atvezetes'); // saját név fordított sorrendben (Revolutról)
    expect(cat(-2500)).toBe('elelmiszer');
    expect(cat(-10000)).toBe('keszpenz');
    expect(cat(-6428)).toBe('vasarlas'); // H&M
    expect(cat(876)).toBe('vasarlas'); // kártyás visszatérítés: a kategória költését csökkenti
    expect(cat(84000)).toBe('bevetel'); // a "tényleges kedvezményezett" saját név nem átvezetés
    expect(cat(-75450)).toBe('befektetes');
  });
});
