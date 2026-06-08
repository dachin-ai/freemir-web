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

/** Series with fewer products are combined into one showcase block at the bottom. */
export const SMALL_SERIES_THRESHOLD = 6;

export function partitionSeriesGroups(groups = []) {
    const majorSeries = [];
    const minorSeries = [];

    groups.forEach((group) => {
        const count = group.products?.length ?? group.count ?? 0;
        if (count >= SMALL_SERIES_THRESHOLD) {
            majorSeries.push(group);
        } else if (count > 0) {
            minorSeries.push(group);
        }
    });

    return { majorSeries, minorSeries };
}

export function mergeMinorSeriesGroups(minorSeries = []) {
    if (minorSeries.length === 0) return null;

    const products = minorSeries.flatMap((group) => group.products || []);
    return {
        key: '__minor_series_merged__',
        count: products.length,
        products,
        names: minorSeries.map((g) => g.name).filter(Boolean),
    };
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
