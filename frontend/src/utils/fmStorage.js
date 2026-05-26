/**
 * Safe read/write for fm_* prefs — works when localStorage is blocked (DingTalk / AliDocs iframe).
 */

const memory = {};

function readFromStore(store, key) {
  try {
    return store?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeToStore(store, key, value) {
  try {
    store?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readFmValue(key, { allowed, fallback, urlParam }) {
  if (urlParam && typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get(urlParam);
      if (allowed.includes(q)) return q;
    } catch {
      /* ignore */
    }
  }

  const fromMemory = memory[key];
  if (allowed.includes(fromMemory)) return fromMemory;

  for (const store of [localStorage, sessionStorage]) {
    const v = readFromStore(store, key);
    if (allowed.includes(v)) return v;
  }

  return fallback;
}

export function writeFmValue(key, value, { allowed }) {
  if (!allowed.includes(value)) return;
  memory[key] = value;
  writeToStore(localStorage, key, value);
  writeToStore(sessionStorage, key, value);
}
