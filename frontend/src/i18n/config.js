import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import zh from '../locales/zh.json';
import id from '../locales/id.json';
import { readLang, FM_LANG_STORAGE_KEY, DEFAULT_LANG, SUPPORTED_LANGS } from '../utils/langStorage';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    id: { translation: id },
  },
  lng: typeof window !== 'undefined' ? readLang() : DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  supportedLngs: SUPPORTED_LANGS,
  interpolation: { escapeValue: false },
});

export { FM_LANG_STORAGE_KEY };
export default i18n;
