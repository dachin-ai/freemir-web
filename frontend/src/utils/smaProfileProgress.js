import { PROFILE_SCRAPE_POOL, PROFILE_TOP_VIDEOS_LIMIT } from './smaConstants';

const PROFILE_PHASES = [
    { phase: 'connect', percent: 10 },
    { phase: 'profile_meta', percent: 28 },
    { phase: 'videos', percent: 58 },
    { phase: 'rank_save', percent: 82 },
];

/**
 * Animated progress while waiting for single profile fetch request.
 * @returns {() => void} cleanup
 */
export function startProfileProgressTimer(setJob, {
    username,
    platform,
    fetchTarget = PROFILE_SCRAPE_POOL,
    saveTarget = PROFILE_TOP_VIDEOS_LIMIT,
}) {
    let idx = 0;
    const apply = (i) => {
        const p = PROFILE_PHASES[Math.min(i, PROFILE_PHASES.length - 1)];
        setJob({
            phase: p.phase,
            percent: p.percent,
            username,
            platform,
            videosFetchTarget: fetchTarget,
            videosSaveTarget: saveTarget,
            videosTarget: saveTarget,
            videosFetched: 0,
            videosSaved: 0,
        });
    };
    apply(0);
    const id = setInterval(() => {
        idx += 1;
        if (idx < PROFILE_PHASES.length) {
            apply(idx);
        }
    }, 2400);
    return () => clearInterval(id);
}

export function finishProfileProgress(setJob, scrapeMeta, { username, platform }) {
    const fetchTarget = scrapeMeta?.videos_fetch_target ?? PROFILE_SCRAPE_POOL;
    const saveTarget = scrapeMeta?.videos_save_target ?? scrapeMeta?.videos_target ?? PROFILE_TOP_VIDEOS_LIMIT;
    const saved = scrapeMeta?.videos_saved ?? 0;
    const raw = scrapeMeta?.videos_fetched_raw ?? saved;
    setJob({
        phase: 'done',
        percent: 100,
        username,
        platform,
        videosFetchTarget: fetchTarget,
        videosSaveTarget: saveTarget,
        videosTarget: saveTarget,
        videosFetched: raw,
        videosSaved: saved,
        videosWithViews: scrapeMeta?.videos_with_views,
    });
}

export function clearProfileProgress(setJob) {
    setJob(null);
}
