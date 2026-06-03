import { useCallback, useState } from 'react';
import { readCurrency, writeCurrency } from '../utils/currencyStorage';

export function useLandingCurrency() {
    const [currency, setCurrencyState] = useState(() => readCurrency());

    const setCurrency = useCallback((code) => {
        writeCurrency(code);
        setCurrencyState(code);
    }, []);

    return [currency, setCurrency];
}
