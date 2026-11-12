import { normalize } from './text';
import type { Category, Rule } from './types';

export const CATEGORIES: Category[] = [
  { id: 'elelmiszer', name: 'Élelmiszer', icon: '🛒', color: '#2E9E5B', kind: 'expense' },
  { id: 'etterem', name: 'Étterem és kávé', icon: '🍽️', color: '#E07A2E', kind: 'expense' },
  { id: 'kozlekedes', name: 'Közlekedés', icon: '🚗', color: '#3C7DD9', kind: 'expense' },
  { id: 'rezsi', name: 'Rezsi és telefon', icon: '💡', color: '#C9A227', kind: 'expense' },
  { id: 'lakhatas', name: 'Lakhatás', icon: '🏠', color: '#7A5AC8', kind: 'expense' },
  { id: 'elofizetes', name: 'Előfizetések', icon: '🔁', color: '#D9488B', kind: 'expense' },
  { id: 'haztartas', name: 'Háztartás és drogéria', icon: '🧴', color: '#3AA9A0', kind: 'expense' },
  { id: 'vasarlas', name: 'Vásárlás', icon: '🛍️', color: '#B85CD6', kind: 'expense' },
  { id: 'egeszseg', name: 'Egészség', icon: '💊', color: '#D64545', kind: 'expense' },
  { id: 'szorakozas', name: 'Szórakozás', icon: '🎬', color: '#5B6CE0', kind: 'expense' },
  { id: 'utazas', name: 'Utazás', icon: '✈️', color: '#1E9BD7', kind: 'expense' },
  { id: 'keszpenz', name: 'Készpénzfelvétel', icon: '🏧', color: '#8A8F98', kind: 'expense' },
  { id: 'dijak', name: 'Bankköltség és díjak', icon: '🏦', color: '#9C6B3C', kind: 'expense' },
  { id: 'egyeb', name: 'Egyéb', icon: '📦', color: '#6E7681', kind: 'expense' },
  { id: 'bevetel', name: 'Bevétel', icon: '💰', color: '#1F8F4E', kind: 'income' },
  { id: 'atvezetes', name: 'Átvezetés (saját)', icon: '🔄', color: '#9AA0A6', kind: 'transfer' },
];

export const FALLBACK_EXPENSE = 'egyeb';
export const FALLBACK_INCOME = 'bevetel';

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return byId.get(id) ?? byId.get(FALLBACK_EXPENSE)!;
}

/**
 * Alapértelmezett kulcsszavak kategóriánként, magyar kereskedőkre hangolva.
 * Szóhatáron illesztünk, így pl. a "MOL" nem találja el a "MOLNAR"-t.
 * Szándékosan NINCS benne a sima "BOLT" (magyarul "üzlet"), csak "BOLT.EU".
 */
const DEFAULT_KEYWORDS: Record<string, string[]> = {
  elelmiszer: [
    'LIDL', 'ALDI', 'SPAR', 'INTERSPAR', 'TESCO', 'PENNY', 'PENNY MARKET', 'AUCHAN', 'CBA', 'COOP',
    'PRIMA', 'METRO', 'REAL', 'MATCH', 'HUSBOLT', 'PEKSEG', 'ZOLDSEGES', 'PIAC', 'SPAR EXPRESSZ',
  ],
  etterem: [
    'WOLT', 'FOODORA', 'NETPINCER', 'MCDONALDS', "MCDONALD'S", 'BURGER KING', 'KFC', 'SUBWAY',
    'STARBUCKS', 'COSTA', 'PIZZA', 'ETTEREM', 'BISTRO', 'BISZTRO', 'KAVEZO', 'CAFE', 'COFFEE',
    'CUKRASZDA', 'BURGER', 'KEBAB', 'GYROS', 'SUSHI', 'LIPOTI', 'FORNETTI', 'BAR', 'PUB', 'SORO',
  ],
  kozlekedes: [
    'BKK', 'MAV', 'MAV-START', 'VOLAN', 'VOLANBUSZ', 'BOLT.EU', 'UBER', 'FOTAXI', 'TAXI', 'CITY TAXI',
    'MOL', 'OMV', 'SHELL', 'ORLEN', 'LUKOIL', 'PARKOLAS', 'NEMZETI MOBILFIZETESI', 'EMATRICA',
    'E-MATRICA', 'AUTOPALYA', 'MOL BUBI', 'LIME', 'TIER', 'GREENGO', 'MOL LIMO',
  ],
  rezsi: [
    'MVM', 'MVM NEXT', 'ELMU', 'EON', 'E.ON', 'FOGAZ', 'FOTAV', 'VIZMU', 'FOVAROSI VIZMUVEK', 'NKM',
    'DIGI', 'TELEKOM', 'MAGYAR TELEKOM', 'YETTEL', 'VODAFONE', 'ONE HUNGARY', 'INVITEL', 'UPC',
    'KOZOS KOLTSEG', 'KOZOSKOLTSEG', 'TARSASHAZ', 'HULLADEKGAZDALKODAS', 'FKF',
  ],
  lakhatas: ['ALBERLET', 'LAKBER', 'BERLETI DIJ', 'LAKASHITEL', 'JELZALOG'],
  elofizetes: [
    'NETFLIX', 'SPOTIFY', 'HBO', 'HBO MAX', 'MAX.COM', 'DISNEY', 'DISNEYPLUS', 'YOUTUBE', 'YOUTUBE PREMIUM',
    'APPLE.COM/BILL', 'ICLOUD', 'GOOGLE ONE', 'GOOGLE STORAGE', 'AMAZON PRIME', 'PRIME VIDEO',
    'CHATGPT', 'OPENAI', 'ANTHROPIC', 'CLAUDE.AI', 'ADOBE', 'MICROSOFT 365', 'XBOX GAME PASS',
    'PLAYSTATION PLUS', 'SKYSHOWTIME', 'RTL+', 'DAZN', 'DEEZER', 'TIDAL', 'AUDIBLE', 'DUOLINGO',
  ],
  haztartas: [
    'DM', 'DM-DROGERIE', 'ROSSMANN', 'MULLER', 'TEDI', 'PEPCO', 'IKEA', 'OBI', 'PRAKTIKER', 'JYSK',
    'BAUMAX', 'KIKA', 'HOMEPOINT',
  ],
  vasarlas: [
    'EMAG', 'ALZA', 'MEDIA MARKT', 'MEDIAMARKT', 'EXTREME DIGITAL', 'EURONICS', 'AMAZON', 'ALIEXPRESS',
    'TEMU', 'SHEIN', 'ZARA', 'H&M', 'RESERVED', 'DECATHLON', 'DEICHMANN', 'CCC', 'ABOUT YOU',
    'ZALANDO', 'LIBRI', 'BOOKLINE', 'VATERA', 'JOFOGAS', 'ARUKERESO', 'NOTINO', 'DOUGLAS',
  ],
  egeszseg: ['PATIKA', 'GYOGYSZERTAR', 'BENU', 'MEDICOVER', 'DOC.HU', 'FOGORVOS', 'OPTIKA', 'SZEMUVEG', 'LABOR'],
  szorakozas: [
    'CINEMA CITY', 'MOZI', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'JEGY.HU', 'EVENTIM', 'TIXA',
    'TICKETSWAP', 'INTERTICKET', 'SZINHAZ', 'MUZEUM', 'KONCERT', 'FITNESS', 'EDZOTEREM', 'SPORT',
  ],
  utazas: ['BOOKING', 'BOOKING.COM', 'AIRBNB', 'WIZZ', 'WIZZ AIR', 'RYANAIR', 'SZALLAS.HU', 'HOTEL', 'FLIXBUS', 'EASYJET'],
  keszpenz: ['ATM', 'KESZPENZFELVET', 'KESZPENZFELVETEL', 'KESZPENZ FELVETEL', 'CASH WITHDRAWAL'],
  dijak: [
    'SZAMLAVEZETESI DIJ', 'SZAMLAVEZETESI', 'KARTYADIJ', 'KARTYA EVES DIJ', 'TRANZAKCIOS ILLETEK',
    'JUTALEK', 'KEZELESI DIJ', 'ZARLATI DIJ', 'SMS DIJ', 'NETBANK DIJ', 'KAMAT', 'HITELKAMAT',
  ],
  bevetel: ['MUNKABER', 'BER', 'FIZETES JOVAIRAS', 'NYUGDIJ', 'CSALADI POTLEK', 'CSOK', 'SALARY'],
  atvezetes: [
    'SAJAT SZAMLA', 'SAJAT SZAMLAK KOZOTT', 'ATVEZETES', 'CONVERTED', 'TOPPED UP', 'TOP UP',
    'WISE', 'TRANSFERWISE', 'REVOLUT', 'MEGTAKARITAS', 'BETETLEKOTES', 'LEKOTES',
  ],
};

export function defaultRules(): Rule[] {
  const rules: Rule[] = [];
  for (const [categoryId, words] of Object.entries(DEFAULT_KEYWORDS)) {
    for (const w of words) {
      const pattern = normalize(w);
      if (!pattern) continue;
      rules.push({ id: `default:${categoryId}:${pattern}`, pattern, categoryId, source: 'default', createdAt: 0 });
    }
  }
  return rules;
}
