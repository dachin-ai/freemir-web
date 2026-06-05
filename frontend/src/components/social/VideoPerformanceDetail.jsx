import React, { useEffect, useMemo, useState } from 'react';
import {
    Button, Card, Col, Empty, Row, Spin, Tag, Typography, message,
} from 'antd';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import PostThumbnail from './PostThumbnail';
import VideoPerformanceHistoryTable from './VideoPerformanceHistoryTable';
import { formatNum, formatFetchedAtChart, platformLabel } from '../../utils/smaHelpers';

const { Text, Title } = Typography;

function chartDataFromSnapshots(snapshots) {
    return (snapshots || []).map((s, i) => ({
        key: i,
        label: s.fetched_at ? formatFetchedAtChart(s.fetched_at) : `#${i + 1}`,
        views: s.views ?? 0,
        likes: s.likes ?? 0,
        comments: s.comments ?? 0,
        engagement_rate: s.engagement_rate ?? 0,
    }));
}

export default function VideoPerformanceDetail({ videoId, onClose }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState(null);

    useEffect(() => {
        if (!videoId) {
            setHistory(null);
            return undefined;
        }
        setLoading(true);
        setHistory(null);
        let cancelled = false;
        api.get(`/social-media-analytics/videos/${videoId}/history`)
            .then((res) => {
                if (!cancelled) setHistory(res.data);
            })
            .catch((err) => {
                if (!cancelled) {
                    message.error(err.response?.data?.detail || 'Failed');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [videoId]);

    const chartData = useMemo(
        () => chartDataFromSnapshots(history?.snapshots),
        [history?.snapshots],
    );
    const videoMeta = history?.video;
    const showShares = videoMeta?.platform === 'tiktok';

    return (
        <Card className="sma-card sma-video-detail" bordered={false}>
            <div className="sma-video-detail-head">
                <Title level={5} style={{ margin: 0 }}>
                    {t('socialMediaAnalytics.videoHistoryTitle')}
                </Title>
                {onClose && (
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={onClose}
                    >
                        {t('socialMediaAnalytics.videoHistoryClose')}
                    </Button>
                )}
            </div>

            <Spin spinning={loading}>
                {!history && !loading && (
                    <Empty description={t('socialMediaAnalytics.perfEmpty')} />
                )}
                {history && (
                    <>
                        {videoMeta && (
                            <Row gutter={16} align="middle" className="sma-perf-meta">
                                <Col>
                                    <PostThumbnail
                                        src={videoMeta.thumbnail_url}
                                        platform={videoMeta.platform}
                                        size="lg"
                                        className="sma-preview-thumb"
                                    />
                                </Col>
                                <Col flex={1}>
                                    <Tag>{platformLabel(videoMeta)}</Tag>
                                    <Title level={5} style={{ margin: '8px 0 4px' }}>
                                        @{videoMeta.author_username}
                                    </Title>
                                    <Text type="secondary">{videoMeta.caption}</Text>
                                    <div className="sma-perf-latest">
                                        <Text>{t('socialMediaAnalytics.latestMetrics')}: </Text>
                                        <Text strong>{formatNum(videoMeta.metrics?.views)} views</Text>
                                        {' · '}
                                        <Text strong>{formatNum(videoMeta.metrics?.likes)} likes</Text>
                                    </div>
                                </Col>
                            </Row>
                        )}

                        {chartData.length === 0 ? (
                            <Empty description={t('socialMediaAnalytics.noHistoryYet')} />
                        ) : (
                            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                                <Col xs={24} lg={12}>
                                    <Card className="sma-card sma-chart-card" title={t('socialMediaAnalytics.chartViews')} bordered={false} size="small">
                                        <ResponsiveContainer width="100%" height={220}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <Tooltip />
                                                <Line type="monotone" dataKey="views" stroke="#0ea5e9" strokeWidth={2} dot />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </Card>
                                </Col>
                                <Col xs={24} lg={12}>
                                    <Card className="sma-card sma-chart-card" title={t('socialMediaAnalytics.chartEngagement')} bordered={false} size="small">
                                        <ResponsiveContainer width="100%" height={220}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                                <YAxis tick={{ fontSize: 11 }} />
                                                <Tooltip />
                                                <Legend />
                                                <Line type="monotone" dataKey="likes" stroke="#f472b6" strokeWidth={2} dot={false} />
                                                <Line type="monotone" dataKey="comments" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </Card>
                                </Col>
                            </Row>
                        )}

                        {history.snapshots?.length > 0 && (
                            <VideoPerformanceHistoryTable
                                snapshots={history.snapshots}
                                showShares={showShares}
                            />
                        )}
                    </>
                )}
            </Spin>
        </Card>
    );
}
