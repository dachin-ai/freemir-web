import React, { useState } from 'react';
import { Button, Collapse, Input, InputNumber, Space, message } from 'antd';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { extractUsernameFromUrl, normalizeTikTokUrl } from '../../utils/smaBulkProgress';

export default function SmaManualMetrics({ onDone }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState('');
    const [views, setViews] = useState(null);
    const [likes, setLikes] = useState(null);
    const [comments, setComments] = useState(null);
    const [shares, setShares] = useState(null);
    const [saves, setSaves] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        const u = url.trim();
        if (!u) {
            message.warning(t('socialMediaAnalytics.urlRequired'));
            return;
        }
        setLoading(true);
        try {
            const normalized = /tiktok\.com/i.test(u) ? normalizeTikTokUrl(u) : u;
            await api.post('/social-media-analytics/videos/manual', {
                url: normalized,
                author_username: extractUsernameFromUrl(normalized) || extractUsernameFromUrl(u),
                views: views ?? undefined,
                likes: likes ?? undefined,
                comments: comments ?? undefined,
                shares: shares ?? undefined,
                saves: saves ?? undefined,
            });
            message.success(t('socialMediaAnalytics.manualSaveSuccess'));
            setUrl('');
            setViews(null);
            setLikes(null);
            setComments(null);
            setShares(null);
            setSaves(null);
            onDone?.();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.manualSaveFailed'));
        } finally {
            setLoading(false);
        }
    };

    const panel = (
        <div className="sma-manual-form">
            <Input
                placeholder={t('socialMediaAnalytics.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoComplete="off"
                name="sma_manual_url"
                data-lpignore="true"
                className="sma-manual-url"
            />
            <div className="sma-manual-metrics-row">
                <InputNumber
                    min={0}
                    className="sma-manual-metric"
                    placeholder={t('socialMediaAnalytics.colViews')}
                    value={views}
                    onChange={setViews}
                />
                <InputNumber
                    min={0}
                    className="sma-manual-metric"
                    placeholder={t('socialMediaAnalytics.colLikes')}
                    value={likes}
                    onChange={setLikes}
                />
                <InputNumber
                    min={0}
                    className="sma-manual-metric"
                    placeholder={t('socialMediaAnalytics.colComments')}
                    value={comments}
                    onChange={setComments}
                />
                <InputNumber
                    min={0}
                    className="sma-manual-metric"
                    placeholder={t('socialMediaAnalytics.colShares')}
                    value={shares}
                    onChange={setShares}
                />
                <InputNumber
                    min={0}
                    className="sma-manual-metric"
                    placeholder={t('socialMediaAnalytics.colSaves')}
                    value={saves}
                    onChange={setSaves}
                />
                <Button type="primary" loading={loading} onClick={handleSave}>
                    {t('socialMediaAnalytics.manualSave')}
                </Button>
            </div>
        </div>
    );

    return (
        <Collapse
            className="sma-manual-collapse"
            bordered={false}
            items={[{
                key: 'manual',
                label: t('socialMediaAnalytics.manualTitle'),
                children: panel,
            }]}
        />
    );
}
