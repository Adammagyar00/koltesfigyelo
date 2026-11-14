import type { BankId, Category } from './types';

/** Zárolt, még le nem könyvelt tétel (pl. az Erste kivonatának "Zárolások" részéből). */
export interface PendingItem {
  bank: BankId;
  date: string;
  /** Negatív = várható kiadás. */
  amount: number;
  currency: string;
  description: string;
}

export interface AppSettings {
  /** Átváltási árfolyamok forintra: 1 egység = ennyi Ft. */
  rates: Record<string, number>;
  /** Havi emlékeztető a kivonat importálására. */
  reminder: boolean;
  customCategories: Category[];
  /** Bankonként a legutóbb importált kivonat zárolt tételei. */
  pending: PendingItem[];
  /** A felhasználó BKK-havibérletének ára (Ft) a közlekedési tipphez. */
  passPrice: number;
  /** Értesítés az előfizetések megújulása előtt. */
  subscriptionAlerts: boolean;
  /** Hány nappal a megújulás előtt szóljon (0 = aznap). */
  alertDaysBefore: number;
  /** Elrejtett ("nem előfizetés") tételek kulcsai. */
  ignoredSubscriptions: string[];
}

/** Becsült alapértékek – a Beállításokban átírhatók a pontos árfolyamra. */
export const DEFAULT_RATES: Record<string, number> = { EUR: 390, USD: 360, GBP: 460, CHF: 420 };

export const DEFAULT_SETTINGS: AppSettings = {
  rates: DEFAULT_RATES,
  reminder: false,
  customCategories: [],
  pending: [],
  passPrice: 950,
  subscriptionAlerts: false,
  alertDaysBefore: 1,
  ignoredSubscriptions: [],
};

export function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    rates: { ...DEFAULT_RATES, ...(raw?.rates ?? {}) },
    customCategories: Array.isArray(raw?.customCategories) ? raw.customCategories : [],
    pending: Array.isArray(raw?.pending) ? raw.pending : [],
    passPrice: typeof raw?.passPrice === 'number' && raw.passPrice > 0 ? raw.passPrice : DEFAULT_SETTINGS.passPrice,
    subscriptionAlerts: raw?.subscriptionAlerts === true,
    alertDaysBefore:
      typeof raw?.alertDaysBefore === 'number' && raw.alertDaysBefore >= 0 && raw.alertDaysBefore <= 7
        ? raw.alertDaysBefore
        : DEFAULT_SETTINGS.alertDaysBefore,
    ignoredSubscriptions: Array.isArray(raw?.ignoredSubscriptions) ? raw.ignoredSubscriptions : [],
  };
}
