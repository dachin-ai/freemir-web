/** UI language persistence — works in DingTalk / AliDocs iframes where localStorage may be blocked. */

import { readFmValue, writeFmValue } from './fmStorage';

export const FM_LANG_STORAGE_KEY = 'fm_lang';
export const SUPPORTED_LANGS = ['zh', 'en', 'id'];
export const DEFAULT_LANG = 'zh';

export function readLang() {
  return readFmValue(FM_LANG_STORAGE_KEY, {
    allowed: SUPPORTED_LANGS,
    fallback: DEFAULT_LANG,
    urlParam: 'lang',
  });
}

export function writeLang(next) {
  writeFmValue(FM_LANG_STORAGE_KEY, next, { allowed: SUPPORTED_LANGS });
}
