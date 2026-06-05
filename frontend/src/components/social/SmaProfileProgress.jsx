import React from 'react';
import { Card, Progress, Typography, Tag } from 'antd';
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PROFILE_SCRAPE_POOL, PROFILE_TOP_VIDEOS_LIMIT } from '../../utils/smaConstants';

const { Text } = Typography;

const PLATFORM_LABEL = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
};

export default function SmaProfileProgress({ job }) {
    const { t } = useTranslation();
    if (!job) return null;

    const platformName = PLATFORM_LABEL[job.platform] || job.platform || '—';
    const done = job.phase === 'done';
    const pct = job.percent ?? (done ? 100 : 0);

    let statusText = t('socialMediaAnalytics.profileProgressIdle');
    if (job.phase === 'connect') {
        statusText = t('socialMediaAnalytics.profileProgressConnect', { platform: platformName });
    } else if (job.phase === 'profile_meta') {
        statusText = t('socialMediaAnalytics.profileProgressMeta', { user: job.username ? `@${job.username}` : '' });
    } else if (job.phase === 'videos') {
        statusText = t('socialMediaAnalytics.profileProgressVideos', {
            fetch: job.videosFetchTarget ?? PROFILE_SCRAPE_POOL,
        });
    } else if (job.phase === 'rank_save') {
        statusText = t('socialMediaAnalytics.profileProgressSave', {
            save: job.videosSaveTarget ?? job.videosTarget ?? PROFILE_TOP_VIDEOS_LIMIT,
        });
    } else if (done) {
        statusText = t('socialMediaAnalytics.profileProgressDone', {
            saved: job.videosSaved ?? 0,
            save: job.videosSaveTarget ?? job.videosTarget ?? PROFILE_TOP_VIDEOS_LIMIT,
            fetched: job.videosFetched ?? job.videosSaved ?? 0,
            fetch: job.videosFetchTarget ?? PROFILE_SCRAPE_POOL,
            withViews: job.videosWithViews ?? '—',
        });
    }

    return (
        <Card className="sma-card sma-progress-card sma-profile-progress-card" bordered={false} size="small">
            <div className="sma-progress-head sma-profile-progress-head">
                {done ? (
                    <CheckCircleOutlined className="sma-progress-icon sma-progress-icon--done" />
                ) : (
                    <LoadingOutlined spin className="sma-progress-icon" />
                )}
                <div className="sma-profile-progress-head-text">
                    <Text strong className="sma-profile-progress-title">
                        {t('socialMediaAnalytics.profileProgressTitle')}
                    </Text>
                    {job.username && (
                        <Text type="secondary" className="sma-profile-progress-user">
                            @{job.username}
                        </Text>
                    )}
                </div>
                {job.platform && (
                    <Tag className="sma-profile-progress-platform" color={job.platform === 'tiktok' ? 'cyan' : 'magenta'}>
                        {platformName}
                    </Tag>
                )}
            </div>
            <Progress
                percent={pct}
                status={done ? 'success' : 'active'}
                strokeColor={done ? '#22c55e' : { from: '#0ea5e9', to: '#f472b6' }}
            />
            <Text className="sma-progress-status">{statusText}</Text>
            {(job.phase === 'videos' || job.phase === 'rank_save' || done) && (
                <Text type="secondary" className="sma-profile-progress-counts">
                    {t('socialMediaAnalytics.profileProgressCounts', {
                        fetched: job.videosFetched ?? 0,
                        saved: job.videosSaved ?? 0,
                        fetch: job.videosFetchTarget ?? PROFILE_SCRAPE_POOL,
                        save: job.videosSaveTarget ?? job.videosTarget ?? PROFILE_TOP_VIDEOS_LIMIT,
                    })}
                </Text>
            )}
        </Card>
    );
}
