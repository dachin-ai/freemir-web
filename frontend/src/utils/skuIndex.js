/** Freemir-style SKU e.g. FR0208A00001 (12 characters). */
export const SKU_LENGTH = 12;
export const SKU_PATTERN = /^[A-Z]{2}\d{4}[A-Z]\d{5}$/;

export function normalizeSkuInput(raw) {
    return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidFreemirSku(sku) {
    return SKU_PATTERN.test(normalizeSkuInput(sku));
}

const SKU_TOKEN_RE = /[A-Z]{2}\d{4}[A-Z]\d{5}/g;

/**
 * Parse one or many SKUs from filter paste (spaces, newlines, tabs) or concatenated text.
 */
export function parseSkuFilterInput(raw) {
    const text = (raw || '').trim();
    if (!text) return [];

    const found = new Set();
    const upper = text.toUpperCase();
    const chunks = upper.split(/[\s,;\n\r\t]+/).filter(Boolean);

    const collectFromChunk = (chunk) => {
        if (SKU_PATTERN.test(chunk)) {
            found.add(chunk);
            return;
        }
        SKU_TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = SKU_TOKEN_RE.exec(chunk)) !== null) {
            if (SKU_PATTERN.test(m[0])) found.add(m[0]);
        }
    };

    for (const chunk of chunks) collectFromChunk(chunk);

    if (found.size === 0 || (chunks.length === 1 && chunks[0].length > SKU_LENGTH)) {
        const compact = upper.replace(/\s+/g, '');
        SKU_TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = SKU_TOKEN_RE.exec(compact)) !== null) {
            if (SKU_PATTERN.test(m[0])) found.add(m[0]);
        }
    }

    return [...found].sort((a, b) => a.localeCompare(b));
}

/** Delimiters aligned with Price Checker bundle input (+ , - | / \\ and whitespace). */
const BUNDLE_SKU_SPLIT_RE = /\s*[+\-,|/\\]+\s*|\s+/;

/**
 * Parse one or many SKUs from paste/type (bundle compare, price checker style).
 * Preserves order; dedupes while keeping first occurrence.
 */
export function parseSkuBundleInput(raw) {
    const text = (raw || '').trim();
    if (!text) return [];

    const ordered = [];
    const seen = new Set();

    const pushSku = (sku) => {
        const n = normalizeSkuInput(sku);
        if (!n || seen.has(n)) return;
        seen.add(n);
        ordered.push(n);
    };

    const upper = text.toUpperCase();
    const segments = upper.split(BUNDLE_SKU_SPLIT_RE).map((s) => s.trim()).filter(Boolean);

    if (segments.length === 0) {
        parseSkuFilterInput(text).forEach(pushSku);
        return ordered;
    }

    for (const segment of segments) {
        const extracted = parseSkuFilterInput(segment);
        if (extracted.length > 0) {
            extracted.forEach(pushSku);
        } else if (segment.length >= SKU_LENGTH) {
            pushSku(segment);
        }
    }

    if (ordered.length === 0) {
        parseSkuFilterInput(text).forEach(pushSku);
    }

    return ordered;
}

/** Build searchable SKU index from catalog + optional extras. */
export function buildSkuIndex(catalogItems = [], extraSkus = []) {
    const map = new Map();
    const add = (sku) => {
        const n = normalizeSkuInput(sku);
        if (!n) return;
        if (!map.has(n)) map.set(n, n);
    };
    for (const item of catalogItems) add(item.sku);
    for (const s of extraSkus) add(s);
    return [...map.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Prefix / substring match for autocomplete (case-insensitive).
 */
export function searchSkuIndex(index, query, limit = 20) {
    const q = normalizeSkuInput(query);
    if (!q) return index.slice(0, limit);
    const starts = [];
    const contains = [];
    for (const sku of index) {
        if (sku.startsWith(q)) starts.push(sku);
        else if (sku.includes(q)) contains.push(sku);
    }
    return [...starts, ...contains].slice(0, limit);
}

/**
 * Parse Freemir SKU (+ optional Main) from upload filename.
 * Examples: FR0208A45101_1_.png → SKU FR0208A45101, Sub
 *           FR0208A45101_Main.jpg → Main
 *           FR0208A45101.png → SKU only (Sub default)
 */
export function parseBrandMaterialFileName(fileName) {
    const base = (fileName || '')
        .replace(/^.*[/\\]/, '')
        .replace(/\.[^.]+$/i, '');
    const upper = base.toUpperCase().replace(/\s+/g, '');

    const atStart = upper.match(/^([A-Z]{2}\d{4}[A-Z]\d{5})(.*)$/);
    if (atStart && SKU_PATTERN.test(atStart[1])) {
        const sku = atStart[1];
        const rest = atStart[2] || '';
        const category = /(^|[_\-.])MAIN([_\-.]|$)/i.test(rest) ? 'main' : 'sub';
        return { sku, category, fromFileName: true };
    }

    const anywhere = upper.match(/([A-Z]{2}\d{4}[A-Z]\d{5})/);
    if (anywhere) {
        const sku = anywhere[1];
        const category = /MAIN/i.test(upper) ? 'main' : 'sub';
        return { sku, category, fromFileName: true };
    }

    return { sku: '', category: 'sub', fromFileName: false };
}
