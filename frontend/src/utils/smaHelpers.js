export const PLATFORM_META = {
    tiktok: { label: 'TikTok', color: '#ec4899' },
    instagram: { label: 'Instagram', color: '#a855f7' },
};

export function platformLabel(row) {
    return row?.platform_label || PLATFORM_META[row?.platform]?.label || row?.platform || '—';
}

export function formatNum(n) {
    if (n == null || n === '') return '—';
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
}

export function downloadBase64Excel(b64, filename) {
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) buf[i] = bytes.charCodeAt(i);
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

/** Normalize pasted profile link (add https:// when missing). */
export function normalizeProfileInput(input) {
    let s = (input || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s) && /(?:instagram\.com|instagr\.am|tiktok\.com)/i.test(s)) {
        s = `https://${s.replace(/^\/\//, '')}`;
    }
    return s;
}

/** Detect TikTok vs Instagram from profile URL (or pasted link text). */
export function detectProfilePlatform(input) {
    const s = normalizeProfileInput(input).toLowerCase();
    if (!s) return null;
    if (s.includes('instagram.com') || s.includes('instagr.am')) return 'instagram';
    if (
        s.includes('tiktok.com')
        || s.includes('vm.tiktok.com')
        || s.includes('vt.tiktok.com')
    ) {
        return 'tiktok';
    }
    return null;
}

export function profileUsernameFromInput(input) {
    const s = normalizeProfileInput(input);
    if (!s) return '';
    const ig = s.match(/instagram\.com\/([^/?#]+)/i);
    if (ig && !['p', 'reel', 'reels', 'stories', 'explore'].includes(ig[1].toLowerCase())) {
        return ig[1].replace(/^@/, '');
    }
    const tt = s.match(/tiktok\.com\/@?([^/?#]+)/i);
    if (tt && !['video', 'music', 'tag', 'discover'].includes(tt[1].toLowerCase())) {
        return tt[1].replace(/^@/, '');
    }
    return s.replace(/^@/, '').split('/').pop()?.split('?')[0] || s;
}

export const SMA_TIMEZONE = 'Asia/Jakarta';
export const SMA_LOCALE = 'id-ID';

export function formatFetchedAt(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(SMA_LOCALE, {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: SMA_TIMEZONE,
        });
    } catch {
        return iso;
    }
}

export function formatFetchedAtChart(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(SMA_LOCALE, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: SMA_TIMEZONE,
        });
    } catch {
        return iso;
    }
}

export function formatDelta(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return null;
    const v = Number(n);
    if (v === 0) return '0';
    const abs = Math.abs(v);
    let body;
    if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(1)}M`;
    else if (abs >= 1_000) body = `${(abs / 1_000).toFixed(1)}K`;
    else body = abs.toLocaleString(SMA_LOCALE);
    return v > 0 ? `+${body}` : `-${body}`;
}

const HISTORY_METRICS = ['views', 'likes', 'comments', 'shares', 'saves', 'engagement_rate'];

export function buildSnapshotHistoryRows(snapshots) {
    const sorted = [...(snapshots || [])].sort(
        (a, b) => new Date(a.fetched_at || 0) - new Date(b.fetched_at || 0),
    );
    return sorted.map((snap, i) => {
        const prev = i > 0 ? sorted[i - 1] : null;
        const row = { key: snap.fetched_at || String(i), ...snap, _index: i + 1 };
        for (const m of HISTORY_METRICS) {
            const cur = snap[m];
            const p = prev?.[m];
            if (!prev || cur == null || p == null) {
                row[`${m}_delta`] = null;
            } else if (m === 'engagement_rate') {
                row[`${m}_delta`] = Number((Number(cur) - Number(p)).toFixed(2));
            } else {
                row[`${m}_delta`] = (Number(cur) || 0) - (Number(p) || 0);
            }
        }
        return row;
    });
}
