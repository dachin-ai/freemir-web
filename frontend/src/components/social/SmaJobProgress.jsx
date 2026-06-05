import React from 'react';
import { Card, Progress, Typography, Tag } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { shortUrl } from '../../utils/smaBulkProgress';

const { Text } = Typography;

const PLATFORM_LABEL = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    unknown: '—',
};

export default function SmaJobProgress({ job, onCancel, cancelling }) {
    const { t } = useTranslation();
    if (!job) return null;

    const pct = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
    const platformName = PLATFORM_LABEL[job.platform] || job.platform;

    let statusText = t('socialMediaAnalytics.progressIdle');
    if (job.phase === 'apify') {
        statusText = t('socialMediaAnalytics.progressApify', { platform: platformName });
    } else if (job.phase === 'refresh') {
        statusText = t('socialMediaAnalytics.progressRefresh', { platform: platformName });
    } else if (job.phase === 'parsing') {
        statusText = t('socialMediaAnalytics.progressParsing');
    } else if (job.phase === 'done_item' && job.ok === false) {
        statusText = t('socialMediaAnalytics.progressItemFailed');
    } else if (job.phase === 'done_item') {
        statusText = t('socialMediaAnalytics.progressItemOk');
    }

    return (
        <Card className="sma-card sma-progress-card" bordered={false}>
            <div className="sma-progress-head">
                <LoadingOutlined spin className="sma-progress-icon" />
                <div>
                    <Text strong>{t('socialMediaAnalytics.progressTitle')}</Text>
                    <div>
                        <Text type="secondary">
                            {t('socialMediaAnalytics.progressStep', {
                                current: job.current,
                                total: job.total,
                            })}
                        </Text>
                    </div>
                </div>
                {job.platform && (
                    <Tag color={job.platform === 'tiktok' ? 'cyan' : 'magenta'}>
                        {platformName}
                    </Tag>
                )}
            </div>
            <Progress percent={pct} status="active" strokeColor={{ from: '#0ea5e9', to: '#f472b6' }} />
            <Text className="sma-progress-status">{statusText}</Text>
            {job.url && (
                <Text type="secondary" className="sma-progress-url" ellipsis>
                    {shortUrl(job.url, 72)}
                </Text>
            )}
            {job.error && (
                <Text type="danger" className="sma-progress-error">
                    {job.error}
                </Text>
            )}
            {onCancel && (
                <button
                    type="button"
                    className="sma-progress-cancel"
                    onClick={onCancel}
                    disabled={cancelling}
                >
                    {t('socialMediaAnalytics.progressCancel')}
                </button>
            )}
        </Card>
    );
}
