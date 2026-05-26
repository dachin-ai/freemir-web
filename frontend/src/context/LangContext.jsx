import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from '../i18n/config';
import { readLang, writeLang, SUPPORTED_LANGS, DEFAULT_LANG } from '../utils/langStorage';

const LangContext = createContext(null);

export const LangProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => readLang());

  const setLanguage = useCallback((next) => {
    if (!SUPPORTED_LANGS.includes(next)) return;
    setLangState(next);
    writeLang(next);
    void i18n.changeLanguage(next);
    try {
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (i18n.language !== lang) {
      void i18n.changeLanguage(lang);
    }
    try {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    } catch {
      /* ignore */
    }
  }, [lang]);

  const value = useMemo(
    () => ({ lang, setLanguage, supportedLangs: SUPPORTED_LANGS, defaultLang: DEFAULT_LANG }),
    [lang, setLanguage],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
};
