import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  RATES_TTL_MS,
  detectCurrencyFromLocale,
  fetchLiveRates,
  formatPrice,
  isCurrencyCode,
  readCachedRates,
  writeCachedRates,
  type CurrencyCode,
  type Rates,
} from "./currency";

const CURRENCY_STORAGE_KEY = "rekordly-currency";

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  format: (usd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function loadInitialCurrency(): CurrencyCode {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (isCurrencyCode(stored)) return stored;
  } catch {
    // Storage unavailable — fall through to detection.
  }
  return detectCurrencyFromLocale() ?? DEFAULT_CURRENCY;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(loadInitialCurrency);
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);

  useEffect(() => {
    let cancelled = false;

    const cached = readCachedRates();
    if (cached) {
      setRates(cached.rates);
      if (Date.now() - cached.fetchedAt < RATES_TTL_MS) return;
    }

    fetchLiveRates().then((live) => {
      if (cancelled || !live) return;
      setRates(live);
      writeCachedRates(live);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = (code: CurrencyCode) => {
    setCurrencyState(code);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    } catch {
      // Storage unavailable — selection applies for this session only.
    }
  };

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      format: (usd: number) => formatPrice(usd, currency, rates),
    }),
    [currency, rates],
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
