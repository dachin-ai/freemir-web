import { readFmValue, writeFmValue } from './fmStorage';

export const FM_CURRENCY_STORAGE_KEY = 'fm_currency';
export const SUPPORTED_CURRENCIES = ['IDR', 'MYR'];
export const DEFAULT_CURRENCY = 'IDR';

export const CURRENCY_META = {
  IDR: {
    code: 'IDR',
    label: 'Indonesia',
    short: 'Rp',
    countryCode: 'ID',
    locale: 'id-ID',
    fractionDigits: 0,
  },
  MYR: {
    code: 'MYR',
    label: 'Malaysia',
    short: 'RM',
    countryCode: 'MY',
    locale: 'ms-MY',
    fractionDigits: 2,
  },
};

export function readCurrency() {
  return readFmValue(FM_CURRENCY_STORAGE_KEY, {
    allowed: SUPPORTED_CURRENCIES,
    fallback: DEFAULT_CURRENCY,
    urlParam: 'currency',
  });
}

export function writeCurrency(code) {
  writeFmValue(FM_CURRENCY_STORAGE_KEY, code, { allowed: SUPPORTED_CURRENCIES });
}

/**
 * Format a numeric price for display. Returns "Invalid" / "–" untouched.
 */
export function formatPrice(value, currency = DEFAULT_CURRENCY) {
  if (value === null || value === undefined || value === '') return '';
  if (value === 'Invalid') return 'Invalid';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const meta = CURRENCY_META[currency] || CURRENCY_META[DEFAULT_CURRENCY];
  return `${meta.short} ${num.toLocaleString(meta.locale, {
    minimumFractionDigits: meta.fractionDigits,
    maximumFractionDigits: meta.fractionDigits,
  })}`;
}
