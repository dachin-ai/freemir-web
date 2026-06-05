import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar, Button, Card, Col, Empty, Row, Spin, Table, Tag, Typography, message,
} from 'antd';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    UserOutlined, FileExcelOutlined, ReloadOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import ProfileVideosTable from './ProfileVideosTable';
import { formatNum, formatFetchedAt, formatFetchedAtChart, downloadBase64Excel, PLATFORM_META } from '../../utils/smaHelpers';
import { PROFILE_SCRAPE_POOL, PROFILE_TOP_VIDEOS_LIMIT } from '../../utils/smaConstants';

const { Text, Title } = Typography;

function minMaxNormalize(series) {
    const nums = series.map((v) => (v == null || Number.isNaN(v) ? null : Number(v)));
    const valid = nums.filter((v) => v != null);
    if (valid.length === 0) return nums.map(() => null);
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const span = max - min;
    if (span === 0) return nums.map((v) => (v == null ? null : 50));
    return nums.map((v) => (v == null ? null : ((v - min) / span) * 100));
}

function profileChartData(snapshots) {
    const rows = (snapshots || []).map((s, i) => ({
        key: i,
        label: s.fetched_at ? formatFetchedAtChart(s.fetched_at) : `#${i + 1}`,
        followers: s.followers ?? 0,
        avg_views: s.recent_avg_views ?? null,
        avg_likes: s.recent_avg_likes ?? null,
        engagement_rate: parseFloat(s.engagement_rate) || 0,
    }));
    const viewsNorm = minMaxNormalize(rows.map((r) => r.avg_views));
    const likesNorm = minMaxNormalize(rows.map((r) => r.avg_likes));
    return rows.map((row, i) => ({
        ...row,
        avg_views_norm: viewsNorm[i],
        avg_likes_norm: likesNorm[i],
    }));
}

function PerformanceChartTooltip({ active, payload, label, viewsLabel, likesLabel }) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};
    return (
        <div className="sma-profile-chart-tooltip">
            <div className="sma-profile-chart-tooltip-label">{label}</div>
            <div>{viewsLabel}: {formatNum(row.avg_views)}</div>
            <div>{likesLabel}: {formatNum(row.avg_likes)}</div>
        </div>
    );
}

function ProfileStatCard({ label, value }) {
    return (
        <div className="sma-profile-stat-card">
            <div className="sma-profile-stat-value">{formatNum(value)}</div>
            <div className="sma-profile-stat-label">{label}</div>
        </div>
    );
}

export default function SmaProfileDetail({
    profile,
    onClose,
    onRefresh,
    requireToken,
    onProfileJob,
}) {
    const { t } = useTranslation();
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const profileId = profile?.id;

    const loadHistory = () => {
        if (!profileId) return;
        setLoading(true);
        api.get(`/social-media-analytics/profiles/${profileId}/history`)
            .then((res) => setHistory(res.data))
            .catch((err) => message.error(err.response?.data?.detail || 'Failed'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        setHistory(null);
        loadHistory();
    }, [profileId]);

    const display = history?.profile || profile;
    const chartData = useMemo(
        () => profileChartData(history?.snapshots),
        [history?.snapshots],
    );

    const handleDownload = async () => {
        if (!profileId) return;
        setDownloading(true);
        try {
            const res = await api.get(`/social-media-analytics/profiles/${profileId}/export/excel`);
            downloadBase64Excel(res.data.file_base64, res.data.filename);
            message.success(t('socialMediaAnalytics.downloadSuccess'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.downloadFailed'));
        } finally {
            setDownloading(false);
        }
    };

    const handleRefresh = async () => {
        const tp = requireToken?.();
        if (requireToken && !tp) return;
        setRefreshing(true);
        try {
            const request = () => api.post(
                `/social-media-analytics/profiles/${profileId}/refresh`,
                tp || {},
                { timeout: 300000 },
            );
            if (onProfileJob) {
                await onProfileJob(request, {
                    username: profile.username,
                    platform: profile.platform,
                    fetchTarget: PROFILE_SCRAPE_POOL,
                    saveTarget: PROFILE_TOP_VIDEOS_LIMIT,
                });
            } else {
                await request();
            }
            message.success(t('socialMediaAnalytics.refreshSuccess'));
            await onRefresh?.();
            loadHistory();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.refreshFailed'));
        } finally {
            setRefreshing(false);
        }
    };

    if (!display) return null;

    const meta = PLATFORM_META[display.platform] || {};
    const posts = display.recent_posts || [];
    const videoCount = display.recent_posts_count ?? posts.length;

    const statCards = [
        { key: 'followers', label: t('socialMediaAnalytics.colFollowers'), value: display.followers },
        { key: 'following', label: t('socialMediaAnalytics.colFollowing'), value: display.following },
        { key: 'posts', label: t('socialMediaAnalytics.profileColPosts'), value: display.posts_count },
        { key: 'saved', label: t('socialMediaAnalytics.profileColSavedVideos'), value: videoCount },
    ];
    if (display.total_likes != null) {
        statCards.push({
            key: 'total_likes',
            label: t('socialMediaAnalytics.profileColTotalLikes'),
            value: display.total_likes,
        });
    }

    return (
        <Card className="sma-card sma-profile-detail" bordered={false}>
            <div className="sma-profile-detail-toolbar">
                <Title level={5} className="sma-section-title" style={{ margin: 0 }}>
                    {t('socialMediaAnalytics.profileDetailTitle')}
                </Title>
                <div className="sma-profile-detail-actions">
                    <Button
                        icon={<FileExcelOutlined />}
                        loading={downloading}
                        onClick={handleDownload}
                    >
                        {t('socialMediaAnalytics.profileDownloadExcel')}
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={refreshing}
                        onClick={handleRefresh}
                    >
                        {t('socialMediaAnalytics.profileRefreshData')}
                    </Button>
                    <Button icon={<CloseOutlined />} onClick={onClose}>
                        {t('socialMediaAnalytics.profileCloseDetail')}
                    </Button>
                </div>
            </div>

            <Spin spinning={loading} wrapperClassName="sma-profile-detail-spin">
                <div className="sma-profile-detail-head">
                    <div className="sma-profile-identity">
                        <Avatar
                            className="sma-profile-identity-avatar"
                            src={display.avatar_url}
                            size={80}
                            icon={<UserOutlined />}
                        />
                        <div className="sma-profile-identity-text">
                            <div className="sma-profile-identity-title">
                                <Tag color={meta.color}>{display.platform_label}</Tag>
                                <Title level={4} className="sma-profile-username">
                                    @{display.username}
                                </Title>
                                {display.is_verified && <Tag color="blue">✓</Tag>}
                            </div>
                            {display.display_name && (
                                <Text className="sma-profile-display-name">{display.display_name}</Text>
                            )}
                            {display.biography && (
                                <p className="sma-profile-bio">{display.biography}</p>
                            )}
                        </div>
                    </div>

                    <div className="sma-profile-stat-grid">
                        {statCards.map((s) => (
                            <ProfileStatCard key={s.key} label={s.label} value={s.value} />
                        ))}
                    </div>

                    <div className="sma-profile-meta-panel">
                        <div className="sma-profile-meta-item">
                            <span className="sma-profile-meta-label">
                                {t('socialMediaAnalytics.profileLastFetchedLabel')}
                            </span>
                            <span className="sma-profile-meta-value">
                                {formatFetchedAt(display.last_fetched_at)}
                            </span>
                        </div>
                        {display.recent_avg?.views != null && (
                            <div className="sma-profile-meta-item sma-profile-meta-item--wide">
                                <span className="sma-profile-meta-label">
                                    {t('socialMediaAnalytics.profileAvgPerformanceLabel', { n: videoCount })}
                                </span>
                                <span className="sma-profile-meta-value">
                                    {formatNum(display.recent_avg.views)}
                                    {' '}{t('socialMediaAnalytics.colViews').toLowerCase()}
                                    {' · '}
                                    {formatNum(display.recent_avg.likes)}
                                    {' '}{t('socialMediaAnalytics.colLikes').toLowerCase()}
                                    {' · ER '}
                                    {display.recent_avg.engagement_rate ?? '—'}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {chartData.length > 0 ? (
                    <Row gutter={[16, 16]} className="sma-profile-detail-charts">
                        <Col xs={24} lg={12}>
                            <Card className="sma-card sma-card--nested" title={t('socialMediaAnalytics.profileChartFollowers')} bordered={false}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="followers" stroke="#0ea5e9" strokeWidth={2} dot />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card>
                        </Col>
                        <Col xs={24} lg={12}>
                            <Card
                                className="sma-card sma-card--nested"
                                title={t('socialMediaAnalytics.profileChartAvgViews')}
                                bordered={false}
                            >
                                <Text type="secondary" className="sma-profile-chart-norm-hint">
                                    {t('socialMediaAnalytics.profileChartNormalizedHint')}
                                </Text>
                                <ResponsiveContainer width="100%" height={220}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                        <YAxis
                                            tick={{ fontSize: 11 }}
                                            domain={[0, 100]}
                                            tickFormatter={(v) => `${Math.round(v)}%`}
                                        />
                                        <Tooltip
                                            content={(
                                                <PerformanceChartTooltip
                                                    viewsLabel={t('socialMediaAnalytics.colViews')}
                                                    likesLabel={t('socialMediaAnalytics.colLikes')}
                                                />
                                            )}
                                        />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="avg_views_norm"
                                            name={t('socialMediaAnalytics.colViews')}
                                            stroke="#0ea5e9"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="avg_likes_norm"
                                            name={t('socialMediaAnalytics.colLikes')}
                                            stroke="#f472b6"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card>
                        </Col>
                    </Row>
                ) : (
                    <Empty
                        className="sma-profile-detail-empty-history"
                        description={t('socialMediaAnalytics.profileNoHistoryYet')}
                    />
                )}

                <div className="sma-profile-videos-block">
                    <Title level={5} className="sma-section-title sma-profile-videos-title">
                        {t('socialMediaAnalytics.profileTopVideosTitle', { n: videoCount })}
                    </Title>
                    <ProfileVideosTable posts={posts} platform={display.platform} />
                </div>
            </Spin>
        </Card>
    );
}
