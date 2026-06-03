/** Maps SKU_Detail "Series" values to i18n keys (landing.seriesNames.*). */
export const SERIES_I18N_KEY_BY_SLUG = {
    api: 'landing.seriesNames.api',
    air: 'landing.seriesNames.air',
    nusantara: 'landing.seriesNames.nusantara',
};

export function seriesNameToSlug(raw) {
    const normalized = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^seri\s+/i, '')
        .replace(/[^a-z0-9]+/g, '');
    return normalized;
}

export function getSeriesDisplayTitle(raw, t) {
    const slug = seriesNameToSlug(raw);
    const key = SERIES_I18N_KEY_BY_SLUG[slug];
    if (key) return t(key);
    const dynamicKey = `landing.seriesNames.${slug}`;
    const translated = t(dynamicKey);
    if (translated !== dynamicKey) return translated;
    const name = String(raw || '').trim();
    if (!name) return '';
    return t('landing.seriesNameFallback', { name });
}
