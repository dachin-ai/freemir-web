import { readFmValue, writeFmValue } from './fmStorage';

export const FM_THEME_STORAGE_KEY = 'fm_theme';
export const SUPPORTED_THEMES = ['dark', 'light'];
export const DEFAULT_THEME = 'light';

export function readThemeMode() {
  return readFmValue(FM_THEME_STORAGE_KEY, {
    allowed: SUPPORTED_THEMES,
    fallback: DEFAULT_THEME,
    urlParam: 'theme',
  });
}

export function writeThemeMode(mode) {
  writeFmValue(FM_THEME_STORAGE_KEY, mode, { allowed: SUPPORTED_THEMES });
}

export function isDarkTheme(mode = readThemeMode()) {
  return mode !== 'light';
}
