import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Button, Card, Collapse, Empty, Input, Select, Space, Spin, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import {
    ReloadOutlined, DeleteOutlined, FileExcelOutlined, PlusOutlined,
    InstagramOutlined, PlaySquareOutlined, SearchOutlined, LineChartOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import PostThumbnail from './PostThumbnail';
import SmaJobProgress from './SmaJobProgress';
import SmaVideoImport from './SmaVideoImport';
import SmaSavedListToolbar from './SmaSavedListToolbar';
import SmaPlatformFilter from './SmaPlatformFilter';
import SmaNoteCell from './SmaNoteCell';
import VideoPerformanceDetail from './VideoPerformanceDetail';
import { runSequentialRefresh } from '../../utils/smaBulkProgress';
import {
    formatNum, formatFetchedAt, platformLabel, downloadBase64Excel, PLATFORM_META,
} from '../../utils/smaHelpers';

const { Text, Paragraph } = Typography;

const PLATFORM_ICONS = {
    tiktok: <PlaySquareOutlined />,
    instagram: <InstagramOutlined />,
};

export default function SmaVideosTab({ requireToken, logActivity }) {
    const { t } = useTranslation();
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportLoading, setExportLoading] = useState(false);
    const [batchLoading, setBatchLoading] = useState(false);
    const [refreshingId, setRefreshingId] = useState(null);
    const [job, setJob] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [selectedVideoId, setSelectedVideoId] = useState(null);
    const cancelRef = useRef(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [filters, setFilters] = useState({
        platform: undefined,
        username: '',
        search: '',
        fetch_status: undefined,
        note: '',
    });
    const [appliedFilters, setAppliedFilters] = useState({
        platform: undefined,
        username: '',
        search: '',
        fetch_status: undefined,
        note: '',
    });

    const loadVideos = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (appliedFilters.platform) params.platform = appliedFilters.platform;
            if (appliedFilters.username?.trim()) params.username = appliedFilters.username.trim();
            if (appliedFilters.search?.trim()) params.search = appliedFilters.search.trim();
            if (appliedFilters.fetch_status) params.fetch_status = appliedFilters.fetch_status;
            if (appliedFilters.note?.trim()) params.note = appliedFilters.note.trim();
            const res = await api.get('/social-media-analytics/videos', { params });
            const list = res.data?.videos || [];
            setVideos(list);
            setSelectedVideoId((prev) => (
                prev && !list.some((v) => v.id === prev) ? null : prev
            ));
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [appliedFilters]);

    const handleApplyFilters = () => {
        setAppliedFilters({ ...filters });
    };

    const handleResetFilters = () => {
        const empty = {
            platform: undefined,
            username: '',
            search: '',
            fetch_status: undefined,
            note: '',
        };
        setFilters(empty);
        setAppliedFilters(empty);
    };

    useEffect(() => {
        loadVideos();
    }, [loadVideos]);

    const handleToggleHistory = (row) => {
        setSelectedVideoId((prev) => (prev === row.id ? null : row.id));
    };

    const handleRefreshOne = async (id) => {
        const tp = requireToken();
        if (!tp) return;
        setRefreshingId(id);
        try {
            await api.post(`/social-media-analytics/videos/${id}/refresh`, tp, { timeout: 180000 });
            message.success(t('socialMediaAnalytics.refreshSuccess'));
            loadVideos();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.refreshFailed'));
        } finally {
            setRefreshingId(null);
        }
    };

    const resolveBatchTargets = () => {
        if (selectedRowKeys.length > 0) {
            return videos.filter((v) => selectedRowKeys.includes(v.id));
        }
        return videos;
    };

    const handleBatchRefresh = async () => {
        const tp = requireToken();
        if (!tp) return;
        const targets = resolveBatchTargets();
        if (!targets.length) {
            message.warning(t('socialMediaAnalytics.emptyList'));
            return;
        }
        cancelRef.current = false;
        setBatchLoading(true);
        setJob({
            phase: 'refresh',
            current: 0,
            total: targets.length,
            url: targets[0]?.url,
            platform: targets[0]?.platform,
        });
        try {
            const data = await runSequentialRefresh(targets, {
                tokenPayload: tp,
                cancelledRef: cancelRef,
                onProgress: setJob,
            });
            const ok = data.success_count || 0;
            const err = data.error_count || 0;
            if (ok === 0 && err > 0) {
                message.error(t('socialMediaAnalytics.bulkAllFailed'));
            } else if (err > 0) {
                message.warning(t('socialMediaAnalytics.batchRefreshDone', { ok, err }));
            } else {
                message.success(t('socialMediaAnalytics.batchRefreshDone', { ok, err }));
            }
            setSelectedRowKeys([]);
            loadVideos();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.refreshFailed'));
        } finally {
            setBatchLoading(false);
            setJob(null);
        }
    };

    const handleCancelBatch = () => {
        cancelRef.current = true;
        message.info(t('socialMediaAnalytics.progressCancelling'));
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/social-media-analytics/videos/${id}`);
            message.success(t('socialMediaAnalytics.deleteSuccess'));
            if (selectedVideoId === id) setSelectedVideoId(null);
            loadVideos();
        } catch {
            message.error('Delete failed');
        }
    };

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const params = {};
            if (appliedFilters.platform) params.platform = appliedFilters.platform;
            if (appliedFilters.username?.trim()) params.username = appliedFilters.username.trim();
            if (appliedFilters.search?.trim()) params.search = appliedFilters.search.trim();
            if (appliedFilters.fetch_status) params.fetch_status = appliedFilters.fetch_status;
            if (appliedFilters.note?.trim()) params.note = appliedFilters.note.trim();
            const res = await api.get('/social-media-analytics/export/excel', { params });
            downloadBase64Excel(res.data.file_base64, res.data.filename);
            message.success(t('socialMediaAnalytics.downloadSuccess'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.downloadFailed'));
        } finally {
            setExportLoading(false);
        }
    };

    const handleImportDone = () => {
        setImportOpen(false);
        loadVideos();
    };

    const center = 'center';
    const numCell = (v) => <span className="sma-num">{formatNum(v)}</span>;

    const columns = [
        {
            title: t('socialMediaAnalytics.colPlatform'),
            key: 'platform',
            width: 108,
            align: center,
            fixed: 'left',
            render: (_, row) => {
                const meta = PLATFORM_META[row.platform] || {};
                return (
                    <Tag icon={PLATFORM_ICONS[row.platform]} color={meta.color} className="sma-platform-tag">
                        {platformLabel(row)}
                    </Tag>
                );
            },
        },
        {
            title: t('socialMediaAnalytics.colNote'),
            key: 'note',
            width: 140,
            align: 'left',
            render: (_, row) => (
                <SmaNoteCell
                    value={row.note}
                    recordId={row.id}
                    kind="video"
                    onSaved={loadVideos}
                />
            ),
        },
        {
            title: t('socialMediaAnalytics.colPost'),
            key: 'post',
            width: 240,
            align: 'left',
            render: (_, row) => (
                <div className="sma-table-post sma-table-post--center">
                    <PostThumbnail src={row.thumbnail_url} platform={row.platform} />
                    <div className="sma-table-post-text">
                        <Text strong>@{row.author_username || '—'}</Text>
                        <Paragraph ellipsis={{ rows: 1 }} className="sma-caption">
                            {row.caption || '—'}
                        </Paragraph>
                    </div>
                </div>
            ),
        },
        {
            title: t('socialMediaAnalytics.colViews'),
            key: 'views',
            width: 88,
            align: center,
            render: (_, r) => numCell(r.metrics?.views),
        },
        {
            title: t('socialMediaAnalytics.colLikes'),
            key: 'likes',
            width: 80,
            align: center,
            render: (_, r) => numCell(r.metrics?.likes),
        },
        {
            title: t('socialMediaAnalytics.colComments'),
            key: 'comments',
            width: 88,
            align: center,
            render: (_, r) => numCell(r.metrics?.comments),
        },
        {
            title: t('socialMediaAnalytics.colShares'),
            key: 'shares',
            width: 80,
            align: center,
            render: (_, r) => numCell(r.metrics?.shares),
        },
        {
            title: t('socialMediaAnalytics.colSaves'),
            key: 'saves',
            width: 80,
            align: center,
            render: (_, r) => numCell(r.metrics?.saves),
        },
        {
            title: (
                <Tooltip title={t('socialMediaAnalytics.engagementRateHint')}>
                    <span>{t('socialMediaAnalytics.colEngagement')}</span>
                </Tooltip>
            ),
            key: 'er',
            width: 96,
            align: center,
            render: (_, r) => (
                <span className="sma-num sma-er-cell">
                    {r.engagement_rate != null ? `${r.engagement_rate}%` : '—'}
                </span>
            ),
        },
        {
            title: t('socialMediaAnalytics.colUpdated'),
            key: 'updated',
            width: 130,
            align: center,
            render: (_, r) => (
                <Text type="secondary" className="sma-updated">
                    {formatFetchedAt(r.last_fetched_at)}
                </Text>
            ),
        },
        {
            title: t('socialMediaAnalytics.colStatus'),
            key: 'status',
            width: 88,
            align: center,
            render: (_, r) => (
                <Tag color={
                    r.fetch_status === 'ok' ? 'success'
                        : r.fetch_status === 'manual' ? 'gold'
                            : r.fetch_status === 'error' ? 'error' : 'default'
                }
                >
                    {r.fetch_status || '—'}
                </Tag>
            ),
        },
        {
            title: t('socialMediaAnalytics.colActions'),
            key: 'actions',
            width: 108,
            align: center,
            fixed: 'right',
            render: (_, row) => (
                <Space size={4} className="sma-action-group">
                    <Tooltip title={t('socialMediaAnalytics.viewHistory')}>
                        <Button
                            size="small"
                            type={selectedVideoId === row.id ? 'primary' : 'default'}
                            icon={<LineChartOutlined />}
                            className="sma-action-btn sma-action-btn--icon"
                            onClick={(e) => { e.stopPropagation(); handleToggleHistory(row); }}
                        />
                    </Tooltip>
                    <Tooltip title={t('socialMediaAnalytics.refresh')}>
                        <Button
                            size="small"
                            type="primary"
                            ghost
                            icon={<ReloadOutlined />}
                            className="sma-action-btn sma-action-btn--icon"
                            loading={refreshingId === row.id}
                            disabled={batchLoading && refreshingId !== row.id}
                            onClick={(e) => { e.stopPropagation(); handleRefreshOne(row.id); }}
                        />
                    </Tooltip>
                    <Tooltip title={t('socialMediaAnalytics.delete')}>
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            className="sma-action-btn sma-action-btn--icon"
                            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="sma-tab-panel">
            {batchLoading && job && (
                <div className="sma-progress-sticky">
                    <SmaJobProgress job={job} onCancel={handleCancelBatch} cancelling={cancelRef.current} />
                </div>
            )}

            <Collapse
                className="sma-videos-import-collapse"
                activeKey={importOpen ? ['import'] : []}
                onChange={(keys) => setImportOpen(keys.includes('import'))}
                items={[{
                    key: 'import',
                    label: (
                        <span className="sma-import-collapse-label">
                            <PlusOutlined />
                            {t('socialMediaAnalytics.videosAddSection')}
                        </span>
                    ),
                    children: (
                        <SmaVideoImport
                            requireToken={requireToken}
                            onDone={handleImportDone}
                            logActivity={logActivity}
                        />
                    ),
                }]}
            />

            <Card className="sma-card" bordered={false}>
                <SmaSavedListToolbar
                    title={t('socialMediaAnalytics.videosSavedTitle')}
                    hint={t('socialMediaAnalytics.videosSelectHint')}
                    filters={(
                        <Space wrap size="small" className="sma-saved-list-filter-row">
                            <SmaPlatformFilter
                                value={filters.platform}
                                onChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
                            />
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder={t('socialMediaAnalytics.filterUsername')}
                                style={{ width: 160 }}
                                value={filters.username}
                                onChange={(e) => setFilters((f) => ({ ...f, username: e.target.value }))}
                                onPressEnter={handleApplyFilters}
                                autoComplete="off"
                                name="sma_filter_creator"
                                id="sma-filter-creator"
                                data-lpignore="true"
                                data-form-type="other"
                            />
                            <Input
                                allowClear
                                placeholder={t('socialMediaAnalytics.filterSearch')}
                                style={{ width: 180 }}
                                value={filters.search}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                                onPressEnter={handleApplyFilters}
                                autoComplete="off"
                                name="sma_filter_search"
                                id="sma-filter-search"
                                data-lpignore="true"
                                data-form-type="other"
                            />
                            <Select
                                allowClear
                                placeholder={t('socialMediaAnalytics.filterStatus')}
                                style={{ width: 120 }}
                                value={filters.fetch_status}
                                onChange={(v) => setFilters((f) => ({ ...f, fetch_status: v }))}
                                options={[
                                    { value: 'ok', label: 'OK' },
                                    { value: 'error', label: 'Error' },
                                    { value: 'pending', label: 'Pending' },
                                    { value: 'manual', label: t('socialMediaAnalytics.statusManual') },
                                ]}
                            />
                            <Input
                                allowClear
                                placeholder={t('socialMediaAnalytics.filterNote')}
                                style={{ width: 160 }}
                                value={filters.note}
                                onChange={(e) => setFilters((f) => ({ ...f, note: e.target.value }))}
                                onPressEnter={handleApplyFilters}
                                autoComplete="off"
                                name="sma_filter_note"
                                id="sma-filter-note"
                                data-lpignore="true"
                                data-form-type="other"
                            />
                        </Space>
                    )}
                    actions={(
                        <Space wrap size="small" className="sma-saved-list-action-row">
                            <Button type="primary" onClick={handleApplyFilters}>
                                {t('socialMediaAnalytics.applyFilter')}
                            </Button>
                            <Button onClick={handleResetFilters}>
                                {t('socialMediaAnalytics.resetFilter')}
                            </Button>
                            <Button
                                icon={<ReloadOutlined />}
                                loading={batchLoading}
                                onClick={handleBatchRefresh}
                            >
                                {selectedRowKeys.length > 0
                                    ? t('socialMediaAnalytics.batchRefreshSelected', { n: selectedRowKeys.length })
                                    : t('socialMediaAnalytics.batchRefreshFiltered')}
                            </Button>
                            <Button
                                icon={<FileExcelOutlined />}
                                loading={exportLoading}
                                onClick={handleExport}
                            >
                                {t('socialMediaAnalytics.downloadExcel')}
                            </Button>
                        </Space>
                    )}
                />
                <Spin spinning={loading && !batchLoading}>
                    {videos.length === 0 ? (
                        <Empty description={t('socialMediaAnalytics.emptyList')} />
                    ) : (
                        <Table
                            rowKey="id"
                            className="sma-data-table sma-data-table--centered"
                            columns={columns}
                            dataSource={videos}
                            rowSelection={{
                                selectedRowKeys,
                                onChange: setSelectedRowKeys,
                            }}
                            rowClassName={(row) => (
                                row.id === selectedVideoId ? 'sma-row-selected' : ''
                            )}
                            onRow={(row) => ({
                                onClick: () => handleToggleHistory(row),
                                style: { cursor: 'pointer' },
                            })}
                            pagination={{
                                pageSize: 15,
                                showSizeChanger: true,
                                showTotal: (total) => t('socialMediaAnalytics.videosTableCount', { n: total }),
                            }}
                            size="small"
                            bordered
                            scroll={{ x: 1460 }}
                        />
                    )}
                </Spin>
            </Card>

            {selectedVideoId && (
                <VideoPerformanceDetail
                    videoId={selectedVideoId}
                    onClose={() => setSelectedVideoId(null)}
                />
            )}
        </div>
    );
}
