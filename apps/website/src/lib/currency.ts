export const CURRENCY_OPTIONS = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "INR", label: "Indian Rupee" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "KRW", label: "South Korean Won" },
  { code: "IDR", label: "Indonesian Rupiah" },
  { code: "TRY", label: "Turkish Lira" },
  { code: "PLN", label: "Polish Zloty" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "PHP", label: "Philippine Peso" },
  { code: "ZAR", label: "South African Rand" },
  { code: "AED", label: "UAE Dirham" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "THB", label: "Thai Baht" },
  { code: "VND", label: "Vietnamese Dong" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];

export type Rates = Record<CurrencyCode, number> & Record<string, number>;

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

// Static snapshot (approximate, September 2026). Used when the live rate
// fetch fails, is blocked, or has not completed yet — the page never blocks
// or shifts layout on rates.
export const FALLBACK_RATES: Rates = {
  USD: 1,
  EUR: 0.85,
  GBP: 0.74,
  INR: 88.5,
  JPY: 147,
  CNY: 7.1,
  CAD: 1.37,
  AUD: 1.5,
  CHF: 0.8,
  BRL: 5.35,
  MXN: 18.2,
  KRW: 1350,
  IDR: 16200,
  TRY: 42,
  PLN: 3.6,
  SEK: 9.4,
  NGN: 1450,
  PHP: 57,
  ZAR: 17.5,
  AED: 3.67,
  SGD: 1.28,
  HKD: 7.78,
  THB: 32.5,
  VND: 26000,
};

const ZERO_DECIMAL_CURRENCIES = new Set<CurrencyCode>([
  "INR",
  "JPY",
  "KRW",
  "VND",
  "IDR",
]);

const RATES_CACHE_KEY = "rekordly-currency-rates";
export const RATES_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedRates {
  rates: Rates;
  fetchedAt: number;
}

export function readCachedRates(): CachedRates | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== "number" ||
      typeof parsed.rates?.USD !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedRates(rates: Rates): void {
  try {
    localStorage.setItem(
      RATES_CACHE_KEY,
      JSON.stringify({ rates, fetchedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable (private mode etc.) — non-fatal.
  }
}

// Anonymous GET to a free, key-less rate API. No user data is sent.
export async function fetchLiveRates(): Promise<Rates | null> {
  try {
    const response = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    if (data.result !== "success" || !data.rates?.USD) return null;

    const rates: Rates = { ...FALLBACK_RATES };
    for (const option of CURRENCY_OPTIONS) {
      const rate = data.rates[option.code];
      if (typeof rate === "number" && rate > 0) {
        rates[option.code] = rate;
      }
    }
    return rates;
  } catch {
    return null;
  }
}

export function formatPrice(usd: number, code: CurrencyCode, rates: Rates): string {
  const rate = rates[code] ?? FALLBACK_RATES[code] ?? 1;
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(usd * rate);
  return code === "USD" ? formatted : `≈ ${formatted}`;
}

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  US: "USD",
  IN: "INR",
  GB: "GBP",
  JP: "JPY",
  CN: "CNY",
  CA: "CAD",
  AU: "AUD",
  CH: "CHF",
  BR: "BRL",
  MX: "MXN",
  KR: "KRW",
  ID: "IDR",
  TR: "TRY",
  PL: "PLN",
  SE: "SEK",
  NG: "NGN",
  PH: "PHP",
  ZA: "ZAR",
  AE: "AED",
  SG: "SGD",
  HK: "HKD",
  TH: "THB",
  VN: "VND",
};

const EURO_REGIONS = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "MC", "NL", "PT", "SK", "SI", "SM", "VA",
  "AD", "ME", "XK",
]);

export function detectCurrencyFromLocale(): CurrencyCode | null {
  try {
    const region = new Intl.Locale(navigator.language).region;
    if (!region) return null;
    if (EURO_REGIONS.has(region)) return "EUR";
    return REGION_CURRENCY[region] ?? null;
  } catch {
    return null;
  }
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    CURRENCY_OPTIONS.some((option) => option.code === value)
  );
}
