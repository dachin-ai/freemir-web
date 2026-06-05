import api from '../api';

/** Extract @username from TikTok/Instagram URL. */
export function extractUsernameFromUrl(url) {
    const m = (url || '').match(/@([^/?#]+)/);
    return m ? m[1].trim() : '';
}

/** Strip TikTok tracking params before API call (improves Apify success on Shop videos). */
export function normalizeTikTokUrl(url) {
    const s = (url || '').trim();
    if (!/tiktok\.com/i.test(s)) return s;
    try {
        const u = new URL(s.split('#')[0]);
        const vid = u.pathname.match(/\/video\/(\d+)/i);
        if (!vid) return s.split('?')[0].split('#')[0];
        const user = u.pathname.match(/@([^/]+)\/video/i);
        if (user) {
            return `https://www.tiktok.com/@${user[1]}/video/${vid[1]}`;
        }
        return `https://www.tiktok.com/video/${vid[1]}`;
    } catch {
        return s.split('?')[0].split('#')[0];
    }
}

export function detectPlatform(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('tiktok.com') || u.includes('vt.tiktok.com') || u.includes('vm.tiktok.com')) {
        return 'tiktok';
    }
    if (u.includes('instagram.com') || u.includes('instagr.am')) {
        return 'instagram';
    }
    return 'unknown';
}

export function shortUrl(url, max = 56) {
    const s = (url || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
}

/** Parse bulk paste text (one URL per line, same rules as backend). */
export function parseUrlsFromText(text) {
    const seen = new Set();
    const out = [];
    const lines = (text || '').split(/\r?\n/);
    for (const line of lines) {
        const chunks = line.trim().split(/\s+/).filter(Boolean);
        for (const chunk of chunks) {
            const s = chunk.trim();
            if (!s.toLowerCase().startsWith('http')) continue;
            const key = s.split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
            if (key && !seen.has(key)) {
                seen.add(key);
                out.push(s);
            }
        }
    }
    return out;
}

/**
 * Add/fetch videos one-by-one so the UI can show live progress.
 */
function applyTokenPayload(body, tokenPayload) {
    if (!tokenPayload) return body;
    if (tokenPayload.apify_token_id) {
        body.apify_token_id = tokenPayload.apify_token_id;
    } else if (tokenPayload.apify_token) {
        body.apify_token = tokenPayload.apify_token;
    }
    return body;
}

export async function runSequentialAdd(urls, { tokenPayload, onProgress, cancelledRef }) {
    const results = { success: [], errors: [], total: urls.length };
    for (let i = 0; i < urls.length; i += 1) {
        if (cancelledRef?.current) break;
        const url = urls[i];
        const platform = detectPlatform(url);
        onProgress?.({
            phase: 'apify',
            current: i + 1,
            total: urls.length,
            url,
            platform,
        });
        try {
            const body = applyTokenPayload(
                { url: detectPlatform(url) === 'tiktok' ? normalizeTikTokUrl(url) : url },
                tokenPayload,
            );
            const res = await api.post('/social-media-analytics/videos', body, { timeout: 180000 });
            results.success.push({ url, video: res.data });
            onProgress?.({
                phase: 'done_item',
                current: i + 1,
                total: urls.length,
                url,
                platform,
                ok: true,
            });
        } catch (err) {
            const error = typeof err.response?.data?.detail === 'string'
                ? err.response.data.detail
                : (err.message || 'Failed');
            results.errors.push({ url, error });
            onProgress?.({
                phase: 'done_item',
                current: i + 1,
                total: urls.length,
                url,
                platform,
                ok: false,
                error,
            });
        }
    }
    results.success_count = results.success.length;
    results.error_count = results.errors.length;
    return results;
}

/**
 * Refresh tracked videos one-by-one with live progress.
 */
export async function runSequentialRefresh(videos, { tokenPayload, onProgress, cancelledRef }) {
    const list = videos || [];
    const results = { success: [], errors: [], total: list.length };
    for (let i = 0; i < list.length; i += 1) {
        if (cancelledRef?.current) break;
        const row = list[i];
        const platform = row.platform || detectPlatform(row.url);
        onProgress?.({
            phase: 'refresh',
            current: i + 1,
            total: list.length,
            url: row.url,
            platform,
            videoId: row.id,
        });
        try {
            const body = applyTokenPayload({}, tokenPayload);
            const res = await api.post(
                `/social-media-analytics/videos/${row.id}/refresh`,
                body,
                { timeout: 180000 },
            );
            results.success.push({ id: row.id, url: row.url, video: res.data });
            onProgress?.({
                phase: 'done_item',
                current: i + 1,
                total: list.length,
                url: row.url,
                platform,
                ok: true,
            });
        } catch (err) {
            const error = typeof err.response?.data?.detail === 'string'
                ? err.response.data.detail
                : (err.message || 'Failed');
            results.errors.push({ id: row.id, url: row.url, error });
            onProgress?.({
                phase: 'done_item',
                current: i + 1,
                total: list.length,
                url: row.url,
                platform,
                ok: false,
                error,
            });
        }
    }
    results.success_count = results.success.length;
    results.error_count = results.errors.length;
    return results;
}
