import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isDarkTheme, readThemeMode, writeThemeMode } from '../utils/themeStorage';

const ThemeContext = createContext(null);

function applyThemeToDocument(isDark) {
  try {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => isDarkTheme(readThemeMode()));

  const setThemeMode = useCallback((dark) => {
    setIsDark(dark);
    writeThemeMode(dark ? 'dark' : 'light');
    applyThemeToDocument(dark);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      writeThemeMode(next ? 'dark' : 'light');
      applyThemeToDocument(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyThemeToDocument(isDark);
    writeThemeMode(isDark ? 'dark' : 'light');
  }, [isDark]);

  const value = useMemo(() => ({ isDark, toggleTheme, setThemeMode }), [isDark, toggleTheme, setThemeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
