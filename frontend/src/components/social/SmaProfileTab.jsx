import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Avatar, Button, Card, Collapse, Empty, Input, Space, Spin, Table, Tag, Typography, message,
} from 'antd';
import {
    ReloadOutlined, DeleteOutlined, UserOutlined, SearchOutlined, EyeOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import SmaProfileDetail from './SmaProfileDetail';
import SmaProfileProgress from './SmaProfileProgress';
import SmaSavedListToolbar from './SmaSavedListToolbar';
import SmaPlatformFilter from './SmaPlatformFilter';
import SmaNoteCell from './SmaNoteCell';
import {
    startProfileProgressTimer,
    finishProfileProgress,
    clearProfileProgress,
} from '../../utils/smaProfileProgress';
import {
    detectProfilePlatform,
    formatNum,
    normalizeProfileInput,
    downloadBase64Excel,
    PLATFORM_META,
    profileUsernameFromInput,
} from '../../utils/smaHelpers';
import { PROFILE_SCRAPE_POOL, PROFILE_TOP_VIDEOS_LIMIT } from '../../utils/smaConstants';

const { Text, Title } = Typography;

export default function SmaProfileTab({ requireToken }) {
    const { t } = useTranslation();
    const [profiles, setProfiles] = useState([]);
    const [fields, setFields] = useState(null);
    const [profileActors, setProfileActors] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);
    const [input, setInput] = useState('');
    const [preview, setPreview] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [profileJob, setProfileJob] = useState(null);
    const [tableSearch, setTableSearch] = useState('');
    const [platformFilter, setPlatformFilter] = useState(undefined);
    const [appliedPlatform, setAppliedPlatform] = useState(undefined);
    const [noteFilter, setNoteFilter] = useState('');
    const [appliedNote, setAppliedNote] = useState('');
    const [exportLoading, setExportLoading] = useState(false);

    const selectedProfile = profiles.find((p) => p.id === selectedId) || null;

    const filteredProfiles = useMemo(() => {
        const q = tableSearch.trim().toLowerCase();
        if (!q) return profiles;
        return profiles.filter((p) => {
            const hay = [
                p.username,
                p.display_name,
                p.platform_label,
                p.platform,
                p.biography,
                p.note,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [profiles, tableSearch]);

    const loadProfiles = useCallback(async (platform, note) => {
        setLoading(true);
        try {
            const params = {};
            if (platform) params.platform = platform;
            if (note?.trim()) params.note = note.trim();
            const res = await api.get('/social-media-analytics/profiles', { params });
            const list = res.data?.profiles || [];
            setProfiles(list);
            setSelectedId((sid) => (sid && list.some((p) => p.id === sid) ? sid : sid && null));
            return list;
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to load profiles');
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfiles(appliedPlatform, appliedNote);
        api.get('/social-media-analytics/profiles/fields')
            .then((res) => setFields(res.data?.fields || null))
            .catch(() => {});
        api.get('/social-media-analytics/config')
            .then((res) => setProfileActors(res.data?.profile?.actors || null))
            .catch(() => {});
    }, [appliedPlatform, appliedNote]);

    const handleApplyFilters = () => {
        setAppliedPlatform(platformFilter);
        setAppliedNote(noteFilter);
    };

    const handleResetFilters = () => {
        setPlatformFilter(undefined);
        setAppliedPlatform(undefined);
        setNoteFilter('');
        setAppliedNote('');
        setTableSearch('');
    };

    const handleExportList = async () => {
        if (!filteredProfiles.length) {
            message.warning(t('socialMediaAnalytics.profileEmpty'));
            return;
        }
        setExportLoading(true);
        try {
            const res = await api.post('/social-media-analytics/profiles/export/list-excel', {
                profile_ids: filteredProfiles.map((p) => p.id),
            });
            downloadBase64Excel(res.data.file_base64, res.data.filename);
            message.success(t('socialMediaAnalytics.downloadSuccess'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.downloadFailed'));
        } finally {
            setExportLoading(false);
        }
    };

    const runProfileJob = async (requestFn, meta) => {
        const stopTimer = startProfileProgressTimer(setProfileJob, meta);
        try {
            const res = await requestFn();
            const data = res.data;
            finishProfileProgress(setProfileJob, data?.scrape_meta, meta);
            const saved = data?.scrape_meta?.videos_saved
                ?? data?.recent_posts_count
                ?? (data?.recent_posts || []).length;
            const saveTarget = data?.scrape_meta?.videos_save_target
                ?? data?.scrape_meta?.videos_target
                ?? PROFILE_TOP_VIDEOS_LIMIT;
            if (saved < saveTarget) {
                message.warning(t('socialMediaAnalytics.profilePartialVideos', { saved, target: saveTarget }));
            }
            setTimeout(() => clearProfileProgress(setProfileJob), 4000);
            return data;
        } catch (err) {
            clearProfileProgress(setProfileJob);
            throw err;
        } finally {
            stopTimer();
        }
    };

    const handleFetch = async () => {
        const tp = requireToken();
        if (!tp) return;
        const normalizedInput = normalizeProfileInput(input);
        if (!normalizedInput) {
            message.warning(t('socialMediaAnalytics.profileInputRequired'));
            return;
        }
        const detectedPlatform = detectProfilePlatform(normalizedInput);
        const uname = profileUsernameFromInput(normalizedInput);
        setFetching(true);
        setPreview(null);
        try {
            const payload = { input: normalizedInput, ...tp };
            if (detectedPlatform) payload.platform = detectedPlatform;
            const data = await runProfileJob(
                () => api.post('/social-media-analytics/profiles/fetch', payload, { timeout: 300000 }),
                {
                    username: uname,
                    platform: detectedPlatform || 'instagram',
                    fetchTarget: PROFILE_SCRAPE_POOL,
                    saveTarget: PROFILE_TOP_VIDEOS_LIMIT,
                },
            );
            setPreview(data);
            setSelectedId(data?.id ?? null);
            message.success(t('socialMediaAnalytics.profileFetchSuccess', {
                n: data?.recent_posts_count ?? (data?.recent_posts || []).length,
            }));
            await loadProfiles(appliedPlatform, appliedNote);
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.profileFetchFailed'));
        } finally {
            setFetching(false);
        }
    };

    const handleRefreshRow = async (row) => {
        const tp = requireToken();
        if (!tp) return;
        setFetching(true);
        try {
            await runProfileJob(
                () => api.post(`/social-media-analytics/profiles/${row.id}/refresh`, tp, { timeout: 300000 }),
                {
                    username: row.username,
                    platform: row.platform,
                    fetchTarget: PROFILE_SCRAPE_POOL,
                    saveTarget: PROFILE_TOP_VIDEOS_LIMIT,
                },
            );
            message.success(t('socialMediaAnalytics.refreshSuccess'));
            await loadProfiles(appliedPlatform, appliedNote);
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.refreshFailed'));
        } finally {
            setFetching(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/social-media-analytics/profiles/${id}`);
            message.success(t('socialMediaAnalytics.deleteSuccess'));
            if (selectedId === id) setSelectedId(null);
            loadProfiles(appliedPlatform, appliedNote);
        } catch {
            message.error('Delete failed');
        }
    };

    const columns = [
        {
            title: t('socialMediaAnalytics.colPlatform'),
            key: 'platform',
            width: 100,
            align: 'center',
            render: (_, row) => {
                const meta = PLATFORM_META[row.platform] || {};
                return <Tag color={meta.color}>{row.platform_label}</Tag>;
            },
        },
        {
            title: t('socialMediaAnalytics.colNote'),
            key: 'note',
            width: 140,
            render: (_, row) => (
                <SmaNoteCell
                    value={row.note}
                    recordId={row.id}
                    kind="profile"
                    onSaved={() => loadProfiles(appliedPlatform, appliedNote)}
                />
            ),
        },
        {
            title: t('socialMediaAnalytics.profileColCreator'),
            key: 'creator',
            render: (_, row) => (
                <Space>
                    <Avatar src={row.avatar_url} icon={<UserOutlined />} size={36} />
                    <div>
                        <Text strong>@{row.username}</Text>
                        {row.display_name && (
                            <div><Text type="secondary">{row.display_name}</Text></div>
                        )}
                    </div>
                </Space>
            ),
        },
        {
            title: t('socialMediaAnalytics.colFollowers'),
            key: 'followers',
            width: 100,
            align: 'center',
            render: (_, r) => formatNum(r.followers),
        },
        {
            title: t('socialMediaAnalytics.profileColSavedVideos'),
            key: 'saved_videos',
            width: 110,
            align: 'center',
            render: (_, r) => formatNum(r.recent_posts_count ?? (r.recent_posts || []).length),
        },
        {
            title: t('socialMediaAnalytics.profileColAvgViews'),
            key: 'avg_views',
            width: 100,
            align: 'center',
            render: (_, r) => formatNum(r.recent_avg?.views),
        },
        {
            title: t('socialMediaAnalytics.colEngagement'),
            key: 'er',
            width: 90,
            align: 'center',
            render: (_, r) => (
                r.recent_avg?.engagement_rate != null
                    ? `${r.recent_avg.engagement_rate}%`
                    : '—'
            ),
        },
        {
            title: t('socialMediaAnalytics.colActions'),
            key: 'actions',
            width: 130,
            align: 'center',
            render: (_, row) => (
                <Space size={4}>
                    <Button
                        size="small"
                        type={selectedId === row.id ? 'primary' : 'default'}
                        icon={<EyeOutlined />}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(row.id); }}
                        title={t('socialMediaAnalytics.profileViewPerformance')}
                    />
                    <Button size="small" icon={<ReloadOutlined />} onClick={(e) => { e.stopPropagation(); handleRefreshRow(row); }} />
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }} />
                </Space>
            ),
        },
    ];

    return (
        <div className="sma-tab-panel sma-profile-tab">
            <div className={`sma-profile-tab-layout${profileJob ? ' sma-profile-tab-layout--with-progress' : ''}`}>
                <div className="sma-profile-tab-main">
            <Card className="sma-card" bordered={false}>
                <Title level={5} className="sma-section-title">
                    <SearchOutlined /> {t('socialMediaAnalytics.profileFetchTitle')}
                </Title>
                <Text type="secondary" className="sma-block-hint">
                    {t('socialMediaAnalytics.profileFetchHint')}
                </Text>
                <div className="sma-profile-fetch-row">
                    <Input
                        className="sma-profile-input sma-profile-input--full"
                        placeholder={t('socialMediaAnalytics.profileInputPlaceholder')}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onPressEnter={() => handleFetch()}
                        autoComplete="off"
                        name="sma_profile_input"
                        data-lpignore="true"
                    />
                    <Button type="primary" htmlType="button" loading={fetching} onClick={() => handleFetch()}>
                        {t('socialMediaAnalytics.profileFetchBtn')}
                    </Button>
                </div>
            </Card>

            {fields && (
                <Collapse
                    className="sma-profile-fields-collapse"
                    size="small"
                    bordered={false}
                    items={[{
                        key: 'fields',
                        label: (
                            <Text type="secondary" className="sma-profile-fields-collapse-label">
                                {t('socialMediaAnalytics.profileAvailableTitle')}
                            </Text>
                        ),
                        children: (
                            <div className="sma-profile-fields-grid">
                                <div>
                                    <Text className="sma-profile-fields-platform">TikTok</Text>
                                    {profileActors?.tiktok && (
                                        <Text type="secondary" className="sma-profile-fields-actor">
                                            {t('socialMediaAnalytics.profileActorHint', { actor: profileActors.tiktok })}
                                        </Text>
                                    )}
                                    <ul className="sma-profile-field-list">
                                        {(fields.tiktok || []).map((f) => <li key={f}>{f}</li>)}
                                    </ul>
                                </div>
                                <div>
                                    <Text className="sma-profile-fields-platform">Instagram</Text>
                                    {profileActors?.instagram && (
                                        <Text type="secondary" className="sma-profile-fields-actor">
                                            {t('socialMediaAnalytics.profileActorHint', { actor: profileActors.instagram })}
                                        </Text>
                                    )}
                                    <ul className="sma-profile-field-list">
                                        {(fields.instagram || []).map((f) => <li key={f}>{f}</li>)}
                                    </ul>
                                </div>
                            </div>
                        ),
                    }]}
                />
            )}

            {preview && !selectedId && (
                <Card className="sma-card sma-profile-preview sma-profile-preview--compact" bordered={false}>
                    <Text type="secondary">{t('socialMediaAnalytics.profilePreviewHint')}</Text>
                    <Button type="link" onClick={() => setSelectedId(preview.id)}>
                        @{preview.username} — {t('socialMediaAnalytics.profileViewPerformance')}
                    </Button>
                </Card>
            )}

            <Card className="sma-card" bordered={false}>
                <SmaSavedListToolbar
                    title={t('socialMediaAnalytics.profileSavedTitle')}
                    hint={t('socialMediaAnalytics.profileSelectHint')}
                    filters={(
                        <Space wrap size="small" className="sma-saved-list-filter-row">
                            <SmaPlatformFilter
                                value={platformFilter}
                                onChange={setPlatformFilter}
                            />
                            <Input
                                className="sma-profile-table-search"
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder={t('socialMediaAnalytics.profileTableSearchPlaceholder')}
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                                autoComplete="off"
                                name="sma_profile_table_search"
                                data-lpignore="true"
                            />
                            <Input
                                allowClear
                                placeholder={t('socialMediaAnalytics.filterNote')}
                                style={{ width: 160 }}
                                value={noteFilter}
                                onChange={(e) => setNoteFilter(e.target.value)}
                                onPressEnter={handleApplyFilters}
                                autoComplete="off"
                                name="sma_profile_filter_note"
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
                                icon={<FileExcelOutlined />}
                                loading={exportLoading}
                                onClick={handleExportList}
                            >
                                {t('socialMediaAnalytics.downloadExcel')}
                            </Button>
                        </Space>
                    )}
                />
                <Spin spinning={loading}>
                    {profiles.length === 0 ? (
                        <Empty description={t('socialMediaAnalytics.profileEmpty')} />
                    ) : filteredProfiles.length === 0 ? (
                        <Empty description={t('socialMediaAnalytics.profileTableSearchEmpty')} />
                    ) : (
                        <Table
                            rowKey="id"
                            className="sma-data-table sma-data-table--centered sma-profile-table"
                            columns={columns}
                            dataSource={filteredProfiles}
                            pagination={{
                                pageSize: 10,
                                showTotal: (total) => t('socialMediaAnalytics.profileTableCount', { n: total }),
                            }}
                            size="small"
                            bordered
                            scroll={{ x: 960 }}
                            rowClassName={(row) => (
                                row.id === selectedId ? 'sma-profile-row--selected' : ''
                            )}
                            onRow={(row) => ({
                                onClick: () => setSelectedId(row.id),
                                style: { cursor: 'pointer' },
                            })}
                        />
                    )}
                </Spin>
            </Card>

            {selectedProfile && (
                <SmaProfileDetail
                    profile={selectedProfile}
                    onClose={() => setSelectedId(null)}
                    onRefresh={() => loadProfiles(appliedPlatform, appliedNote)}
                    requireToken={requireToken}
                    onProfileJob={runProfileJob}
                />
            )}
                </div>
                {profileJob && (
                    <aside className="sma-profile-tab-aside" aria-live="polite">
                        <SmaProfileProgress job={profileJob} />
                    </aside>
                )}
            </div>
        </div>
    );
}
