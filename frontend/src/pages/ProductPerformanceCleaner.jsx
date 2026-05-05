import React, { useState, useEffect } from 'react';
import {
    Tabs, Select, Button, Upload, Table, Tag, message,
    Card, Space, Typography, Statistic, Row, Col, Popconfirm, Tooltip, Image,
} from 'antd';
import {
    UploadOutlined, ReloadOutlined, DeleteOutlined, InboxOutlined, CheckOutlined, DownloadOutlined,
    BarChartOutlined, ThunderboltOutlined, SwapOutlined, AppstoreOutlined, UnorderedListOutlined,
    EyeOutlined, CloudUploadOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import api from '../api';
import * as XLSX from 'xlsx-js-style';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;
const { Dragger } = Upload;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
/** Excel worksheet names: max 31 chars; cannot contain \\ / ? * [ ] : */
function sanitizeExcelSheetName(raw) {
    const s = String(raw ?? '').replace(/[/\\?*[\]:]/g, '_').trim();
    const base = s || 'Sheet';
    return base.slice(0, 31);
}

/** Ensures unique sheet names within one workbook (SheetJS rejects duplicates). */
function uniqueExcelSheetName(raw, usedNames) {
    let base = sanitizeExcelSheetName(raw);
    let name = base;
    let i = 2;
    while (usedNames.has(name)) {
        const suf = `_${i}`;
        name = (base.slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
        i += 1;
    }
    usedNames.add(name);
    return name;
}

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString());
const fmtPct    = (v) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
const fmtGrowth = (v) => {
    if (v == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    if (v === -100) return <span style={{ color: '#92400e', fontWeight: 600, background: '#fef9c3', padding: '0 3px', borderRadius: 2 }}>-100.00%</span>;
    const isPos = v >= 0;
    return <span style={{ color: isPos ? '#22c55e' : '#ef4444', fontWeight: 500 }}>{isPos ? '+' : ''}{v.toFixed(2)}%</span>;
};
const fmtGap = (v) => {
    if (v == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const isPos = v >= 0;
    return <span style={{ color: isPos ? '#22c55e' : '#ef4444', fontWeight: 500 }}>{isPos ? '+' : ''}{Number(v).toLocaleString()}</span>;
};

// ─────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────
const Label = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
        {children}
    </div>
);
const SectionHeading = ({ icon, children, color = '#10b981' }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 14, flexShrink: 0 }}>{icon}</span>
        {children}
    </div>
);
const sectionCard = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
};
const statCard = (accent) => ({
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderTop: `3px solid ${accent}`,
    borderRadius: 12,
    padding: '16px 20px',
    textAlign: 'center',
    minWidth: 160,
});
const MARK_STYLE = {
    New:       { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    Old:       { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
    Clearance: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
};
const MarkTag = ({ mark }) => {
    if (!mark) return null;
    const s = MARK_STYLE[mark] || { background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' };
    return <span style={{ ...s, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, letterSpacing: '0.3px', flexShrink: 0 }}>{mark}</span>;
};

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Upload
// ─────────────────────────────────────────────────────────────────
function UploadTab({ weeks }) {
    const { t } = useTranslation();
    const [platform, setPlatform] = useState('Shopee');
    const [weekNum, setWeekNum]       = useState(null);
    const [fileList, setFileList]     = useState([]);
    const [uploading, setUploading]   = useState(false);
    const [preview, setPreview]       = useState(null);

    const handleUpload = async () => {
        if (!weekNum && weekNum !== 0) { message.error(t('productPerf.msgSelectWeek')); return; }
        if (!fileList.length)          { message.error(t('productPerf.msgSelectFile')); return; }

        const name = fileList[0]?.name || '';
        if (platform === 'Shopee' && /tiktok|^tt/i.test(name)) {
            message.error(t('productPerf.msgTikTokHint'));
            return;
        }

        const formData = new FormData();
        formData.append('file', fileList[0].originFileObj);
        formData.append('week_num', weekNum);

        setUploading(true);
        try {
            const endpoint = platform === 'TikTok'
                ? '/product-performance/upload/tiktok'
                : '/product-performance/upload/shopee';
            const res = await api.post(endpoint, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPreview(res.data);
            message.success(t('productPerf.msgSavedRecords', { n: res.data.saved, week: res.data.week }));
            setFileList([]);
        } catch (err) {
            message.error(err.response?.data?.detail || t('productPerf.msgUploadFailed'));
        } finally {
            setUploading(false);
        }
    };

    const previewCols = [
        { title: t('productPerf.colStore'),        dataIndex: 'store',        width: 110 },
        { title: t('productPerf.colPid'),          dataIndex: 'pid',          width: 140 },
        {
            title: t('productPerf.colPicture'),
            dataIndex: 'product_picture',
            width: 70,
            render: v => v ? <Image src={v} width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} /> : '—',
        },
        { title: t('productPerf.colUnit'),         dataIndex: 'unit',         width: 80,  render: fmt },
        { title: t('productPerf.colGmv'),          dataIndex: 'gmv',          width: 120, render: fmt },
        { title: t('productPerf.colImpression'),   dataIndex: 'impression',   width: 100, render: fmt },
        { title: t('productPerf.colVisitor'),      dataIndex: 'visitor',      width: 100, render: fmt },
        { title: t('productPerf.colClick'),        dataIndex: 'click',        width: 80,  render: fmt },
        { title: t('productPerf.colCtr'),          dataIndex: 'ctr',          width: 80,  render: fmtPct },
        { title: t('productPerf.colCo'),           dataIndex: 'co',           width: 80,  render: fmtPct },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
            <div style={sectionCard}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                    <SectionHeading icon={<CloudUploadOutlined />} color="#10b981">{t('productPerf.uploadSectionTitle')}</SectionHeading>
                </div>
                <div style={{ padding: '20px' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                        <Row gutter={24}>
                            <Col xs={24} md={10}>
                                <Label>{t('productPerf.labelPlatform')}</Label>
                                <Select
                                    style={{ width: '100%' }}
                                    value={platform}
                                    onChange={setPlatform}
                                    size="large"
                                    options={[
                                        { value: 'Shopee', label: 'Shopee' },
                                        { value: 'TikTok', label: 'TikTok' },
                                    ]}
                                />
                            </Col>
                            <Col xs={24} md={14}>
                                <Label>{t('productPerf.labelWeek')}</Label>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder={t('productPerf.phWeek')}
                                    value={weekNum}
                                    onChange={setWeekNum}
                                    size="large"
                                    options={weeks.map(w => ({ value: w.value, label: w.label }))}
                                />
                            </Col>
                        </Row>
                        <div>
                            <Label>{t('productPerf.uploadExcelFile', { platform })}</Label>
                            <Dragger
                                accept=".xlsx,.xls"
                                fileList={fileList}
                                beforeUpload={() => false}
                                onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
                                style={{ borderRadius: 10 }}
                            >
                                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                <p className="ant-upload-text">{t('productPerf.draggerMain', { platform })}</p>
                                <p className="ant-upload-hint">
                                    {platform === 'TikTok'
                                        ? t('productPerf.draggerHintTikTok')
                                        : t('productPerf.draggerHintShopee')}
                                </p>
                            </Dragger>
                        </div>
                        <Button
                            block
                            icon={<UploadOutlined />}
                            onClick={handleUpload}
                            loading={uploading}
                            disabled={!fileList.length || (!weekNum && weekNum !== 0)}
                            style={{
                                height: 44, borderRadius: 8, fontWeight: 700, fontSize: 14,
                                background: '#10b981', color: '#fff', border: 'none',
                                boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                            }}
                        >
                            {t('productPerf.btnProcessSave')}
                        </Button>
                    </Space>
                </div>
            </div>

            {preview && (
                <div style={sectionCard}>
                    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <SectionHeading icon={<CheckOutlined />} color="#22c55e">{t('productPerf.previewTitle', { week: preview.week, platform })}</SectionHeading>
                        <Space>
                            <Tag color="green">{t('productPerf.tagSaved', { n: preview.saved })}</Tag>
                            <Tag color="orange">{t('productPerf.tagSkipped', { n: preview.skipped })}</Tag>
                        </Space>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
                            {[
                                { label: t('productPerf.statPeriod'), val: `${preview.week_start} – ${preview.week_end}`, accent: '#6366f1' },
                                { label: t('productPerf.statRecordsSaved'), val: preview.saved, accent: '#10b981' },
                                { label: t('productPerf.statShowing'), val: `${preview.preview.length} / ${preview.saved}`, accent: '#3b82f6' },
                            ].map(({ label, val, accent }) => (
                                <Col key={label}>
                                    <div style={statCard(accent)}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontFamily: "'Outfit', sans-serif" }}>{val}</div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                        <Table
                            dataSource={preview.preview}
                            columns={previewCols}
                            rowKey="pid"
                            size="small"
                            pagination={{ pageSize: 10 }}
                            scroll={{ x: 'max-content' }}
                        />
                    </div>
                </div>
            )}
        </Space>
    );
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Data Viewer
// ─────────────────────────────────────────────────────────────────
function DataViewerTab() {
    const { t } = useTranslation();
    const [data, setData]         = useState([]);
    const [summary, setSummary]   = useState({ weeks: [], platforms: [], stores: [] });
    const [filters, setFilters]   = useState({ week: null, platform: null, store: null });
    const [loading, setLoading]   = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deletingWeek, setDeletingWeek] = useState(false);

    const fetchSummary = async () => {
        try {
            const res = await api.get('/product-performance/summary');
            setSummary(res.data);
        } catch { /* ignore */ }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.week)     params.week     = filters.week;
            if (filters.platform) params.platform = filters.platform;
            if (filters.store)    params.store    = filters.store;
            const res = await api.get('/product-performance/data', { params });
            setData(res.data);
        } catch {
            message.error(t('productPerf.msgLoadDataFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSummary(); }, []);
    useEffect(() => {
        if (!filters.week && summary.weeks.length === 1) {
            setFilters(f => ({ ...f, week: summary.weeks[0] }));
        }
    }, [summary.weeks, filters.week]);
    useEffect(() => { fetchData(); }, [filters]);

    const handleRefresh = () => {
        fetchSummary();
        fetchData();
    };

    const handleDelete = async () => {
        if (!filters.week || !filters.platform) {
            message.warning(t('productPerf.msgSelectWeekPlatformDelete'));
            return;
        }
        setDeleting(true);
        try {
            const res = await api.delete('/product-performance/data', {
                params: { week: filters.week, platform: filters.platform },
            });
            message.success(t('productPerf.msgDeletedRecords', { n: res.data.deleted }));
            fetchData();
            fetchSummary();
        } catch {
            message.error(t('productPerf.msgDeleteFailed'));
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteWeek = async () => {
        if (!filters.week) {
            message.warning(t('productPerf.msgSelectWeekDelete'));
            return;
        }
        setDeletingWeek(true);
        try {
            const res = await api.delete('/product-performance/data/week', {
                params: { week: filters.week },
            });
            message.success(t('productPerf.msgDeletedRecords', { n: res.data.deleted }));
            fetchData();
            fetchSummary();
        } catch {
            message.error(t('productPerf.msgDeleteFailed'));
        } finally {
            setDeletingWeek(false);
        }
    };

    const columns = [
        { title: t('productPerf.colWeek'),    dataIndex: 'week',    width: 90,  fixed: 'left' },
        { title: t('productPerf.colPlatform'),dataIndex: 'platform', width: 90 },
        { title: t('productPerf.colStore'),   dataIndex: 'store',   width: 110 },
        { title: t('productPerf.colPid'),     dataIndex: 'pid',     width: 140, ellipsis: true },
        {
            title: t('productPerf.colPicture'),
            dataIndex: 'product_picture',
            width: 70,
            render: v => v ? <Image src={v} width={32} height={32} style={{ borderRadius: 4, objectFit: 'cover' }} preview={false} /> : '—',
        },
        { title: t('productPerf.colImpression'), dataIndex: 'impression', width: 110, align: 'right', render: fmt },
        { title: t('productPerf.colVisitor'),    dataIndex: 'visitor',    width: 110, align: 'right', render: fmt },
        { title: t('productPerf.colClick'),      dataIndex: 'click',      width: 80,  align: 'right', render: fmt },
        { title: t('productPerf.colUnit'),       dataIndex: 'unit',       width: 80,  align: 'right', render: fmt },
        { title: t('productPerf.colGmv'),        dataIndex: 'gmv',        width: 120, align: 'right', render: fmt },
        { title: t('productPerf.colCtr'),        dataIndex: 'ctr',        width: 80,  align: 'right', render: fmtPct },
        { title: t('productPerf.colCo'),         dataIndex: 'co',         width: 80,  align: 'right', render: fmtPct },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div style={sectionCard}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                    <SectionHeading icon={<UnorderedListOutlined />} color="#3b82f6">{t('productPerf.viewerTitle')}</SectionHeading>
                </div>
                <div style={{ padding: '14px 20px' }}>
                    <Space wrap align="end">
                        <div>
                            <Label>{t('productPerf.labelWeek')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phAllWeeks')} style={{ width: 200 }}
                                value={filters.week}
                                onChange={v => setFilters(f => ({ ...f, week: v }))}
                                options={summary.weeks.map(w => ({ value: w, label: w }))}
                            />
                        </div>
                        <div>
                            <Label>{t('productPerf.labelPlatform')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phAllPlatforms')} style={{ width: 140 }}
                                value={filters.platform}
                                onChange={v => setFilters(f => ({ ...f, platform: v }))}
                                options={summary.platforms.map(p => ({ value: p, label: p }))}
                            />
                        </div>
                        <div>
                            <Label>{t('productPerf.labelStore')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phAllStores')} style={{ width: 160 }}
                                value={filters.store}
                                onChange={v => setFilters(f => ({ ...f, store: v }))}
                                options={summary.stores.map(s => ({ value: s, label: s }))}
                            />
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={handleRefresh} style={{ height: 32, borderRadius: 6 }}>{t('productPerf.btnRefresh')}</Button>
                            <Popconfirm
                                title={t('productPerf.confirmDeleteSel', { week: filters.week || '?', platform: filters.platform || '?' })}
                                onConfirm={handleDelete}
                                disabled={!filters.week || !filters.platform}
                            >
                                <Button
                                    danger icon={<DeleteOutlined />}
                                    loading={deleting}
                                    disabled={!filters.week || !filters.platform}
                                    style={{ height: 32, borderRadius: 6 }}
                                >
                                    {t('productPerf.btnDeleteSelection')}
                                </Button>
                            </Popconfirm>
                            <Popconfirm
                                title={t('productPerf.confirmDeleteWeek', { week: filters.week || '?' })}
                                onConfirm={handleDeleteWeek}
                                disabled={!filters.week}
                            >
                                <Button
                                    danger
                                    loading={deletingWeek}
                                    disabled={!filters.week}
                                    style={{ height: 32, borderRadius: 6 }}
                                >
                                    {t('productPerf.btnDeleteWeek')}
                                </Button>
                            </Popconfirm>
                        </Space>
                    </Space>
                </div>
            </div>

            <Table
                dataSource={data}
                columns={columns}
                rowKey="id"
                loading={loading}
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 50, showTotal: (tot) => t('productPerf.paginationRecords', { total: tot }) }}
            />
        </Space>
    );
}

// ─────────────────────────────────────────────────────────────────
// Converter Data (Upload + View)
// ─────────────────────────────────────────────────────────────────
function ConverterTab() {
    const { t } = useTranslation();
    const [store, setStore]               = useState('');
    const [fileList, setFileList]         = useState([]);
    const [uploading, setUploading]       = useState(false);
    const [result, setResult]             = useState(null);
    const [stats, setStats]               = useState([]);
    const [loadingStats, setLoadingStats] = useState(false);
    const [storeOptions, setStoreOptions] = useState([]);
    const [summary, setSummary]           = useState({ shopee: 0, tiktok: 0 });
    const [deletingStore, setDeletingStore] = useState('');
    const [converterRows, setConverterRows] = useState([]);
    const [loadingRows, setLoadingRows] = useState(false);
    const [filterStore, setFilterStore] = useState('');

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const res = await api.get('/product-performance/converter/stats');
            setStats(res.data.rows || res.data || []);
            if (res.data.summary) {
                setSummary(res.data.summary);
            }
        } catch { /* ignore */ }
        finally { setLoadingStats(false); }
    };

    const fetchStoreOptions = async () => {
        try {
            const res = await api.get('/product-performance/converter/stores');
            setStoreOptions(res.data.stores || []);
        } catch { /* ignore */ }
    };

    useEffect(() => { fetchStats(); fetchStoreOptions(); }, []);

    const fetchConverterRows = async () => {
        setLoadingRows(true);
        try {
            const res = await api.get('/product-performance/converter/data', {
                params: filterStore ? { store: filterStore } : {},
            });
            setConverterRows(res.data || []);
        } catch {
            message.error(t('productPerf.msgLoadConverterFailed'));
        } finally {
            setLoadingRows(false);
        }
    };

    const handleUpload = async () => {
        if (!store) { message.error(t('productPerf.msgSelectStore')); return; }
        if (!fileList.length) { message.error(t('productPerf.msgSelectFile')); return; }
        setUploading(true);
        const formData = new FormData();
        formData.append('file', fileList[0].originFileObj);
        formData.append('store', store.trim());
        try {
            const res = await api.post('/product-performance/converter/upload-shopee', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(res.data);
            message.success(t('productPerf.msgSavedStore', { n: res.data.saved, store: res.data.store }));
            setFileList([]);
            fetchStats();
        } catch (err) {
            message.error(err.response?.data?.detail || t('productPerf.msgUploadFailed'));
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteStore = async (storeCode) => {
        setDeletingStore(storeCode);
        try {
            const res = await api.delete('/product-performance/converter/store', {
                params: { store: storeCode },
            });
            message.success(t('productPerf.msgDeletedRowsStore', { n: res.data.deleted, store: storeCode }));
            setResult(null);
            fetchStats();
        } catch {
            message.error(t('productPerf.msgDeleteFailed'));
        } finally {
            setDeletingStore('');
        }
    };

    const statsColumns = [
        { title: t('productPerf.colStore'),        dataIndex: 'store_name',  width: 220 },
        { title: t('productPerf.colUniquePids'),  dataIndex: 'pid_count',   width: 120, align: 'center', render: v => <Tag color="blue">{v}</Tag> },
        { title: t('productPerf.colUniqueMids'),  dataIndex: 'mid_count',   width: 120, align: 'center', render: v => <Tag color="cyan">{v}</Tag> },
        {
            title: t('productPerf.colLastUpdated'), dataIndex: 'last_updated', width: 180, align: 'center',
            render: v => v ? new Date(v).toLocaleString() : '—',
        },
        {
            title: t('productPerf.colAction'),
            dataIndex: 'store_code',
            width: 120,
            render: (code) => (
                <Popconfirm
                    title={t('productPerf.confirmDeleteConverter', { store: code })}
                    onConfirm={() => handleDeleteStore(code)}
                >
                    <Button danger size="small" loading={deletingStore === code}>
                        {t('productPerf.btnDelete')}
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    const converterColumns = [
        { title: t('productPerf.colStore'), dataIndex: 'store_name', width: 220 },
        { title: t('productPerf.colPid'), dataIndex: 'pid', width: 150 },
        { title: t('productPerf.colMid'), dataIndex: 'mid', width: 150 },
        { title: t('productPerf.colSku'), dataIndex: 'sku', width: 180 },
        {
            title: t('productPerf.colUpdated'), dataIndex: 'updated_at', width: 180,
            render: v => v ? new Date(v).toLocaleString() : '—',
        },
    ];

    const previewCols = [
        { title: t('productPerf.colPid'), dataIndex: 'pid', width: 160 },
        { title: t('productPerf.colMid'), dataIndex: 'mid', width: 160 },
        { title: t('productPerf.colSku'), dataIndex: 'sku' },
    ];

    return (
        <Tabs
            defaultActiveKey="upload"
            type="card"
            items={[
                {
                    key: 'upload',
                    label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><CloudUploadOutlined />{t('productPerf.subTabUpload')}</span>,
                    children: (
                        <Space direction="vertical" style={{ width: '100%' }} size={20}>
                            <div style={sectionCard}>
                                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                    <SectionHeading icon={<CloudUploadOutlined />} color="#10b981">{t('productPerf.convUploadTitle')}</SectionHeading>
                                </div>
                                <div style={{ padding: '20px' }}>
                                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                        <div style={{ maxWidth: 280 }}>
                                            <Label>{t('productPerf.labelStoreCode')}</Label>
                                            <Select
                                                style={{ width: '100%' }}
                                                placeholder={t('productPerf.phPickStore')}
                                                value={store || undefined}
                                                onChange={setStore}
                                                showSearch
                                                allowClear
                                                size="large"
                                                options={storeOptions.map(s => ({ value: s, label: s }))}
                                                filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
                                                notFoundContent={t('productPerf.noStoresFound')}
                                            />
                                        </div>
                                        <div>
                                            <Label>{t('productPerf.convFileLabel')}</Label>
                                            <Dragger
                                                accept=".xlsx,.xls,.zip"
                                                fileList={fileList}
                                                beforeUpload={() => false}
                                                onChange={({ fileList: fl }) => setFileList(fl.slice(-1))}
                                                style={{ borderRadius: 10, maxWidth: 500 }}
                                            >
                                                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                                <p className="ant-upload-text">{t('productPerf.convDragger')}</p>
                                                <p className="ant-upload-hint">{t('productPerf.convDraggerHint')}</p>
                                            </Dragger>
                                        </div>
                                        <Button
                                            block
                                            icon={<UploadOutlined />}
                                            onClick={handleUpload}
                                            loading={uploading}
                                            disabled={!fileList.length || !store}
                                            style={{ height: 44, borderRadius: 8, fontWeight: 700, fontSize: 14, background: '#10b981', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(16,185,129,0.3)', maxWidth: 500 }}
                                        >
                                            {t('productPerf.btnUpdateConverter')}
                                        </Button>
                                    </Space>
                                </div>
                            </div>

                            {result && (
                            <div style={sectionCard}>
                                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <SectionHeading icon={<CheckOutlined />} color="#22c55e">{t('productPerf.convResultTitle', { store: result.store })}</SectionHeading>
                                    <Space>
                                        <Tag color="green">{t('productPerf.tagSaved', { n: result.saved })}</Tag>
                                        <Tag color="red">{t('productPerf.tagDeleted', { n: result.deleted })}</Tag>
                                        <Tag color="blue">{t('productPerf.tagUniquePids', { n: result.unique_pids })}</Tag>
                                        <Tag color="cyan">{t('productPerf.tagUniqueMids', { n: result.unique_mids })}</Tag>
                                    </Space>
                                </div>
                                <div style={{ padding: '16px' }}>
                                    <Table dataSource={result.preview} columns={previewCols} rowKey="pid" size="small" pagination={{ pageSize: 10 }} />
                                </div>
                            </div>
                            )}
                        </Space>
                    ),
                },
                {
                    key: 'monitor',
                    label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><EyeOutlined />{t('productPerf.subTabMonitor')}</span>,
                    children: (
                        <div style={sectionCard}>
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <SectionHeading icon={<EyeOutlined />} color="#3b82f6">{t('productPerf.convMonitorTitle')}</SectionHeading>
                                <Space>
                                    <Tag color="green">{t('productPerf.tagShopee', { n: summary.shopee })}</Tag>
                                    <Tag color="magenta">{t('productPerf.tagTikTok', { n: summary.tiktok })}</Tag>
                                    <Button icon={<ReloadOutlined />} size="small" onClick={fetchStats} style={{ borderRadius: 6 }}>{t('productPerf.btnRefresh')}</Button>
                                </Space>
                            </div>
                            <div style={{ padding: '16px' }}>
                                <Table
                                    dataSource={stats}
                                    columns={statsColumns}
                                    rowKey="store_code"
                                    loading={loadingStats}
                                    size="middle"
                                    pagination={false}
                                />
                            </div>
                        </div>
                    ),
                },
                {
                    key: 'data',
                    label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><DatabaseOutlined />{t('productPerf.subTabDataView')}</span>,
                    children: (
                        <div style={sectionCard}>
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                <SectionHeading icon={<DatabaseOutlined />} color="#8b5cf6">{t('productPerf.convDataViewTitle')}</SectionHeading>
                                <Space style={{ marginLeft: 'auto' }}>
                                    <Select
                                        allowClear
                                        placeholder={t('productPerf.phFilterStore')}
                                        style={{ width: 220 }}
                                        value={filterStore || undefined}
                                        onChange={setFilterStore}
                                        options={storeOptions.map(s => ({ value: s, label: s }))}
                                    />
                                    <Button icon={<ReloadOutlined />} size="small" onClick={fetchConverterRows} style={{ borderRadius: 6 }}>{t('productPerf.btnLoad')}</Button>
                                </Space>
                            </div>
                            <div style={{ padding: '16px' }}>
                                <Table
                                    dataSource={converterRows}
                                    columns={converterColumns}
                                    rowKey={(row) => `${row.store_code}-${row.mid}`}
                                    loading={loadingRows}
                                    size="small"
                                    pagination={{ pageSize: 50 }}
                                    scroll={{ x: 'max-content' }}
                                />
                            </div>
                        </div>
                    ),
                },
            ]}
        />
    );
}

// ─────────────────────────────────────────────────────────────────
// Platform Tab (Upload + View)
// ─────────────────────────────────────────────────────────────────
function PlatformTab({ weeks }) {
    const { t } = useTranslation();
    return (
        <Tabs defaultActiveKey="upload" type="card" items={[
            { key: 'upload', label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><CloudUploadOutlined />{t('productPerf.subTabUpload')}</span>, children: <UploadTab weeks={weeks} /> },
            { key: 'view',   label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><UnorderedListOutlined />{t('productPerf.subTabView')}</span>, children: <DataViewerTab /> },
        ]} />
    );
}

// ─────────────────────────────────────────────────────────────────
// Brand Tab (Compute + View + Comparison)
// ─────────────────────────────────────────────────────────────────
function BrandTab({ weeks }) {
    const { t } = useTranslation();
    const [availability, setAvailability]   = useState({ weeks: [], stores: [], store_week: {} });
    const [skuAvail, setSkuAvail]           = useState({ weeks: [], stores: [], store_week: {} });
    const [loadingAvail, setLoadingAvail]   = useState(false);
    const [storeNameMap, setStoreNameMap]   = useState({});
    const [computeWeek, setComputeWeek]     = useState(null);
    const [computePlat, setComputePlat]     = useState('All');
    const [computing, setComputing]         = useState(false);
    const [deleting, setDeleting]           = useState(false);

    const fetchAvailability = async () => {
        setLoadingAvail(true);
        try {
            const [availRes, skuAvailRes, statsRes] = await Promise.all([
                api.get('/product-performance/availability'),
                api.get('/product-performance/sku/availability'),
                api.get('/product-performance/converter/stats').catch(() => ({ data: { rows: [] } })),
            ]);
            setAvailability(availRes.data);
            setSkuAvail(skuAvailRes.data);
            const nameMap = {};
            (statsRes.data.rows || []).forEach(r => { if (r.store_code) nameMap[r.store_code] = r.store_name || r.store_code; });
            setStoreNameMap(nameMap);
        } catch {
            message.error(t('productPerf.msgLoadAvailabilityFailed'));
        } finally {
            setLoadingAvail(false);
        }
    };

    useEffect(() => { fetchAvailability(); }, []);

    const handleCompute = async () => {
        if (!computeWeek) { message.warning(t('productPerf.msgSelectWeekCompute')); return; }
        setComputing(true);
        try {
            const res = await api.post('/product-performance/sku/compute', null, {
                params: { week: computeWeek, platform: computePlat },
            });
            const lbl = computePlat === 'All' ? t('productPerf.platformAll') : computePlat;
            message.success(t('productPerf.msgComputedRows', { n: res.data.computed, week: computeWeek, label: lbl }));
            fetchAvailability();
        } catch (err) {
            message.error(err.response?.data?.detail || t('productPerf.msgComputeFailed'));
        } finally {
            setComputing(false);
        }
    };

    const handleDelete = async () => {
        if (!computeWeek) { message.warning(t('productPerf.msgSelectWeekDelete')); return; }
        setDeleting(true);
        try {
            const res = await api.delete('/product-performance/sku/data', {
                params: { week: computeWeek, platform: computePlat },
            });
            message.success(t('productPerf.msgDeletedSkuRows', { n: res.data.deleted, week: computeWeek, platform: computePlat }));
            fetchAvailability();
        } catch (err) {
            message.error(err.response?.data?.detail || t('productPerf.msgDeleteFailed'));
        } finally {
            setDeleting(false);
        }
    };

    // Merge weeks from both upload + computed
    const allWeeks = [...new Set([...availability.weeks, ...skuAvail.weeks])].sort();
    const allStores = [...new Set([...availability.stores, ...skuAvail.stores])].sort((a, b) => {
        const aD = a === '-' || a === '—'; const bD = b === '-' || b === '—';
        if (aD && !bD) return 1; if (!aD && bD) return -1;
        return a.localeCompare(b);
    });

    const availabilityColumns = [
        { title: t('productPerf.colHash'), dataIndex: '_no', fixed: 'left', width: 46, align: 'center' },
        { title: t('productPerf.colStore'), dataIndex: '_storeName', fixed: 'left', width: 230,
            render: name => <Text style={{ color: 'var(--text-main)' }}>{name}</Text> },
        ...allWeeks.map(week => ({
            title: week, width: 120, align: 'center',
            render: (_, r) => {
                const uploaded = r._uploadWeeks?.has(week);
                const computed = r._skuWeeks?.has(week);
                if (!uploaded && !computed) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                if (computed) return <CheckOutlined title={t('productPerf.titleComputed')} style={{ color: '#22c55e', fontSize: 13 }} />;
                return <span style={{ color: '#f59e0b', fontSize: 12 }} title={t('productPerf.titleNotComputed')}>○</span>;
            },
        })),
    ];

    const availabilityData = allStores.map((store, idx) => ({
        key: store, store, _no: idx + 1,
        _storeName: storeNameMap[store] || store,
        _uploadWeeks: new Set(availability.store_week?.[store] || []),
        _skuWeeks:    new Set(skuAvail.store_week?.[store]    || []),
    }));

    const weekOpts = weeks.map(w => ({ value: `Week ${w.value}`, label: `Week ${w.value}  (${w.start} \u2013 ${w.end})` }));

    const storeCount = availabilityData.filter(r => r.store !== '-' && r.store !== '\u2014').length;

    return (
        <Tabs defaultActiveKey="compute" type="card" items={[
            {
                key: 'compute',
                label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><ThunderboltOutlined />{t('productPerf.subTabCompute')}</span>,
                children: (
                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                        <div style={sectionCard}>
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                <SectionHeading icon={<ThunderboltOutlined />} color="#6366f1">{t('productPerf.computeSectionTitle')}</SectionHeading>
                            </div>
                            <div style={{ padding: '16px 20px' }}>
                                <Space wrap align="end">
                                    <div>
                                        <Label>{t('productPerf.labelWeek')}</Label>
                                        <Select allowClear showSearch placeholder={t('productPerf.phSelectWeek')} style={{ width: 280 }}
                                            value={computeWeek} onChange={setComputeWeek} options={weekOpts} />
                                    </div>
                                    <div>
                                        <Label>{t('productPerf.labelPlatform')}</Label>
                                        <Select style={{ width: 160 }} value={computePlat} onChange={setComputePlat}
                                            options={[
                                                { value: 'All',    label: t('productPerf.platformAll') },
                                                { value: 'Shopee', label: 'Shopee' },
                                                { value: 'TikTok', label: 'TikTok' },
                                            ]}
                                        />
                                    </div>
                                    <Button loading={computing} onClick={handleCompute}
                                        disabled={!computeWeek}
                                        icon={<ThunderboltOutlined />}
                                        style={{ height: 36, borderRadius: 8, fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}>
                                        {t('productPerf.btnComputeSku')}
                                    </Button>
                                    <Popconfirm
                                        title={t('productPerf.confirmDeleteSkuCompute', { week: computeWeek || '...', platform: computePlat })}
                                        description={t('productPerf.confirmDeleteSkuData')}
                                        onConfirm={handleDelete}
                                        okText={t('productPerf.popOkDelete')} cancelText={t('productPerf.popCancel')}
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button danger loading={deleting} disabled={!computeWeek}
                                            icon={<DeleteOutlined />} style={{ height: 36, borderRadius: 8, fontWeight: 600 }}>
                                            {t('productPerf.btnDelete')}
                                        </Button>
                                    </Popconfirm>
                                    <Button icon={<ReloadOutlined />} onClick={fetchAvailability} loading={loadingAvail}
                                        style={{ height: 36, borderRadius: 8 }}>
                                        {t('productPerf.btnRefresh')}
                                    </Button>
                                </Space>
                            </div>
                        </div>
                        <div style={sectionCard}>
                            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <SectionHeading icon={<CheckOutlined />} color="#22c55e">{t('productPerf.availabilityTitle', { count: storeCount })}</SectionHeading>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    <CheckOutlined style={{ color: '#22c55e' }} /> {t('productPerf.legendComputed')} &nbsp;
                                    <span style={{ color: '#f59e0b' }}>○</span> {t('productPerf.legendNotComputed')}
                                </span>
                            </div>
                            <div style={{ padding: '0 4px 4px' }}>
                                <Table
                                    dataSource={availabilityData}
                                    columns={availabilityColumns}
                                    loading={loadingAvail}
                                    size="small"
                                    pagination={{ pageSize: 30 }}
                                    scroll={{ x: 'max-content' }}
                                />
                            </div>
                        </div>
                    </Space>
                ),
            },
            { key: 'view',       label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><BarChartOutlined />{t('productPerf.subTabView')}</span>,       children: <SkuBrandTab weeks={weeks} /> },
            { key: 'comparison', label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><SwapOutlined />{t('productPerf.subTabComparison')}</span>, children: <ComparisonTab weeks={weeks} /> },
        ]} />
    );
}

// ─────────────────────────────────────────────────────────────────
// SKU Brand Tab
// ─────────────────────────────────────────────────────────────────
function SkuBrandTab({ weeks }) {
    const { t } = useTranslation();
    const [skuSummary, setSkuSummary]   = useState({ weeks: [], platforms: [], stores: [] });
    const [filters, setFilters]         = useState({ week: null, platform: null, store: null, sku: '' });
    const [data, setData]               = useState([]);
    const [loading, setLoading]         = useState(false);
    const [deleting, setDeleting]       = useState(false);

    const handleDownload = () => {
        if (!data.length) { message.warning(t('productPerf.msgNoDataDownload')); return; }
        try {
        const headers = [
            t('productPerf.excelHdrWeek'), t('productPerf.excelHdrPlatform'), t('productPerf.excelHdrStore'), t('productPerf.excelHdrSku'),
            t('productPerf.excelHdrProductName'), t('productPerf.excelHdrPids'), t('productPerf.excelHdrImpression'), t('productPerf.excelHdrVisitor'),
            t('productPerf.excelHdrClick'), t('productPerf.excelHdrUnit'), t('productPerf.excelHdrGmv'), t('productPerf.excelHdrCtr'), t('productPerf.excelHdrCo'),
        ];
        const rows = data.map(r => [
            r.week, r.platform, r.store, r.sku, r.product_name || '', r.pid_count,
            r.impression ?? 0, r.visitor ?? 0, r.click ?? 0, r.unit ?? 0, r.gmv ?? 0,
            r.ctr != null ? parseFloat((r.ctr * 100).toFixed(4)) : 0,
            r.co  != null ? parseFloat((r.co  * 100).toFixed(4)) : 0,
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [12,10,14,40,40,8,14,12,10,10,14,10,10].map(w => ({ wch: w }));
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        const wb = XLSX.utils.book_new();
        const tag = `${filters.week || 'All'} ${filters.platform || 'All'}`;
        const sheetUsed = new Set();
        XLSX.utils.book_append_sheet(wb, ws, uniqueExcelSheetName(tag, sheetUsed));
        XLSX.writeFile(wb, `SKU_Brand_${(filters.week || 'all').replace(/\s/g,'_')}_${filters.platform || 'all'}.xlsx`);
        } catch (err) {
            console.error('SKU Brand Excel export failed:', err);
            message.error(err?.message || String(err) || t('productPerf.msgDownloadExcelFailed'));
        }
    };

    const fetchSkuSummary = async () => {
        try {
            const res = await api.get('/product-performance/sku/summary');
            setSkuSummary(res.data);
        } catch { /* ignore */ }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.week)     params.week     = filters.week;
            if (filters.platform) params.platform = filters.platform;
            if (filters.store)    params.store    = filters.store;
            if (filters.sku)      params.sku      = filters.sku;
            const res = await api.get('/product-performance/sku/data', { params });
            setData(res.data);
        } catch {
            message.error(t('productPerf.msgLoadBrandFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSkuSummary(); }, []);
    useEffect(() => { fetchData(); }, [filters]);

    const handleDelete = async () => {
        if (!filters.week || !filters.platform) {
            message.warning(t('productPerf.msgSelectWeekPlatformDelete'));
            return;
        }
        setDeleting(true);
        try {
            const res = await api.delete('/product-performance/sku/data', {
                params: { week: filters.week, platform: filters.platform },
            });
            message.success(t('productPerf.msgDeletedSkuRowsShort', { n: res.data.deleted }));
            fetchSkuSummary();
            fetchData();
        } catch {
            message.error(t('productPerf.msgDeleteFailed'));
        } finally {
            setDeleting(false);
        }
    };

    const columns = [
        { title: t('productPerf.colPhoto'), dataIndex: 'photo', width: 64, fixed: 'left',
            render: (url) => url
                ? <img src={url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                : <div style={{ width: 44, height: 44, background: 'var(--border)', borderRadius: 4 }} /> },
        { title: t('productPerf.colSkuName'),  dataIndex: 'sku', width: 210, fixed: 'left', ellipsis: true,
            render: (v, r) => (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <Tooltip title={v}>
                            <Text style={{ color: 'var(--text-main)', fontSize: 12, fontWeight: 600 }} ellipsis>{v || '—'}</Text>
                        </Tooltip>
                        <MarkTag mark={r.mark} />
                        {r.product_link && (
                            <a href={r.product_link} target="_blank" rel="noopener noreferrer"
                                style={{ color: '#3b82f6', lineHeight: 1 }} title={t('productPerf.titleOpenProduct')}>
                                ↗
                            </a>
                        )}
                    </div>
                    {r.product_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 1 }}>{r.product_name}</div>}
                </div>
            ) },
        { title: t('productPerf.colWeek'),       dataIndex: 'week',      width: 90 },
        { title: t('productPerf.colPlatform'),   dataIndex: 'platform',  width: 90 },
        { title: t('productPerf.colStore'),      dataIndex: 'store',     width: 110 },
        { title: t('productPerf.colPids'),       dataIndex: 'pid_count', width: 70,  align: 'right' },
        { title: t('productPerf.colImpression'), dataIndex: 'impression', width: 110, align: 'right', render: fmt },
        { title: t('productPerf.colVisitor'),    dataIndex: 'visitor',   width: 100, align: 'right', render: fmt },
        { title: t('productPerf.colClick'),      dataIndex: 'click',     width: 80,  align: 'right', render: fmt },
        { title: t('productPerf.colUnit'),       dataIndex: 'unit',      width: 80,  align: 'right', render: fmt },
        { title: t('productPerf.colGmv'),        dataIndex: 'gmv',       width: 120, align: 'right', render: fmt },
        { title: t('productPerf.colCtr'),        dataIndex: 'ctr',       width: 80,  align: 'right', render: fmtPct },
        { title: t('productPerf.colCo'),         dataIndex: 'co',        width: 80,  align: 'right', render: fmtPct },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div style={sectionCard}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                    <SectionHeading icon={<BarChartOutlined />} color="#10b981">{t('productPerf.skuPerfTitle')}</SectionHeading>
                </div>
                <div style={{ padding: '14px 20px' }}>
                    <Space wrap align="end">
                        <div>
                            <Label>{t('productPerf.labelWeek')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phSelectWeek')} style={{ width: 240 }}
                                value={filters.week}
                                onChange={v => setFilters(f => ({ ...f, week: v }))}
                                options={weeks.map(w => {
                                    const label = `Week ${w.value}  (${w.start} – ${w.end})`;
                                    const value = `Week ${w.value}`;
                                    return { value, label };
                                })}
                                showSearch
                            />
                        </div>
                        <div>
                            <Label>{t('productPerf.labelPlatform')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phPlatform')} style={{ width: 150 }}
                                value={filters.platform}
                                onChange={v => setFilters(f => ({ ...f, platform: v }))}
                                options={[
                                    { value: 'All', label: t('productPerf.platformAll') },
                                    { value: 'Shopee', label: 'Shopee' },
                                    { value: 'TikTok', label: 'TikTok' },
                                ]}
                            />
                        </div>
                        <div>
                            <Label>{t('productPerf.labelStore')}</Label>
                            <Select
                                allowClear placeholder={t('productPerf.phAllStores')} style={{ width: 160 }}
                                value={filters.store}
                                onChange={v => setFilters(f => ({ ...f, store: v }))}
                                options={skuSummary.stores.map(s => ({ value: s, label: s }))}
                            />
                        </div>
                        <div>
                            <Label>{t('productPerf.labelSearchSku')}</Label>
                            <input
                                placeholder={t('productPerf.phSearchSku')}
                                value={filters.sku}
                                onChange={e => setFilters(f => ({ ...f, sku: e.target.value }))}
                                style={{
                                    height: 32, padding: '0 10px', borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-panel)', color: 'var(--text-main)',
                                    fontSize: 13, width: 160,
                                }}
                            />
                        </div>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} style={{ height: 32, borderRadius: 6 }}>{t('productPerf.btnLoad')}</Button>
                            <Popconfirm
                                title={t('productPerf.confirmDeleteSkuFilters', { week: filters.week || '?', platform: filters.platform || '?' })}
                                onConfirm={handleDelete}
                                disabled={!filters.week || !filters.platform}
                            >
                                <Button
                                    danger icon={<DeleteOutlined />}
                                    loading={deleting}
                                    disabled={!filters.week || !filters.platform}
                                    style={{ height: 32, borderRadius: 6 }}
                                >
                                    {t('productPerf.btnDelete')}
                                </Button>
                            </Popconfirm>
                            <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!data.length} style={{ height: 32, borderRadius: 6 }}>
                                {t('productPerf.btnDownloadExcel')}
                            </Button>
                        </Space>
                    </Space>
                </div>
            </div>

            <Table
                dataSource={data}
                columns={columns}
                rowKey="id"
                loading={loading}
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 50, showTotal: (tot) => t('productPerf.paginationRows', { total: tot }) }}
            />
        </Space>
    );
}

// ─────────────────────────────────────────────────────────────────
// Comparison Tab
// ─────────────────────────────────────────────────────────────────
function ComparisonTab({ weeks }) {
    const { t } = useTranslation();
    const [weekA, setWeekA]           = useState(null);
    const [weekB, setWeekB]           = useState(null);
    const [platform, setPlatform]     = useState('All');
    const [data, setData]             = useState(null);
    const [loading, setLoading]       = useState(false);
    const [sectionIdx, setSectionIdx] = useState(0);

    const weekOpts = weeks.map(w => ({ value: `Week ${w.value}`, label: `Week ${w.value}  (${w.start} \u2013 ${w.end})` }));

    const handleLoad = async () => {
        if (!weekA || !weekB) { message.warning(t('productPerf.msgSelectBothPeriods')); return; }
        setLoading(true);
        try {
            const res = await api.get('/product-performance/sku/comparison', {
                params: { week_a: weekA, week_b: weekB, platform },
            });
            setData(res.data);
            setSectionIdx(0);
        } catch (err) {
            message.error(err.response?.data?.detail || t('productPerf.msgLoadComparisonFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!data?.sections?.length) { message.warning(t('productPerf.msgNoDataDownload')); return; }
        try {
        const wb = XLSX.utils.book_new();
        const usedSheetNames = new Set();
        const allSecs = data.sections || [];

        // Sheet 1: UI View (all stores expanded to the right)
        if (allSecs.length) {
            const baseSec = allSecs.find(s => String(s.section || '').toLowerCase() === 'all brand') || allSecs[0];
            const baseRows = enrichAndOrderRows(baseSec.rows);
            const baseMap = new Map(baseRows.map(r => [r.sku, r]));
            const skuOrder = [...baseRows.map(r => r.sku)];
            const seenSku = new Set(skuOrder);
            allSecs.forEach(sec => {
                enrichAndOrderRows(sec.rows).forEach(r => {
                    if (r.sku && !seenSku.has(r.sku)) { seenSku.add(r.sku); skuOrder.push(r.sku); }
                });
            });

            const secMaps = allSecs.map(sec => ({
                sec,
                label: (() => {
                    const full = sec.store_name || sec.section || '';
                    const code = sec.store_code ? String(sec.store_code).trim() : '';
                    if (code && full && !full.toLowerCase().includes(code.toLowerCase())) return `${code} - ${full}`;
                    return full || code || 'Section';
                })(),
                map: new Map(sec.rows.map(r => [r.sku, r])),
            }));
            const pp = (v) => (v != null ? parseFloat((v * 100).toFixed(4)) : null);

            const uiHdrGroupTop = [
                'Product Information', '', '', '', '', '', '',
            ];
            const uiHdrGroupMid = ['', '', '', '', '', '', ''];
            const uiHdrSub = [
                t('productPerf.colMark'),
                t('productPerf.colSku'),
                t('productPerf.colProduct'),
                t('productPerf.colLink'),
                t('productPerf.colHighestGmvStore'),
                t('productPerf.colHighestImpressionStore'),
                t('productPerf.colTopSignal'),
            ];
            const subCols = [
                'PIDs', t('productPerf.colImp'), t('productPerf.colClick'), t('productPerf.colVisitor'),
                t('productPerf.colUnit'), t('productPerf.colGmv'), t('productPerf.colCtrPct'), t('productPerf.colCoPct'),
            ];
            secMaps.forEach(({ label }) => {
                uiHdrGroupTop.push(label, ...Array(23).fill(''));
                uiHdrGroupMid.push(
                    weekA || t('productPerf.periodAFallback'), ...Array(7).fill(''),
                    weekB || t('productPerf.periodBFallback'), ...Array(7).fill(''),
                    t('productPerf.colGrowth'), ...Array(7).fill(''),
                );
                uiHdrSub.push(
                    ...subCols, ...subCols,
                    t('productPerf.colImpPct'), t('productPerf.colClickPct'), t('productPerf.colVisitorPct'), t('productPerf.colUnitPct'),
                    t('productPerf.colGmvGap'), t('productPerf.colGmvPct'), t('productPerf.colCtrPct'), t('productPerf.colCoPct'),
                );
            });

            const totalRow = ['-', t('productPerf.colTotalRow'), '', '', '—', '—', '—'];
            secMaps.forEach(({ sec }) => {
                totalRow.push(
                    sec.total_pid_a ?? 0,
                    sec.total_a.impression, sec.total_a.click, sec.total_a.visitor, sec.total_a.unit, sec.total_a.gmv, pp(sec.total_a.ctr), pp(sec.total_a.co),
                    sec.total_pid_b ?? 0,
                    sec.total_b.impression, sec.total_b.click, sec.total_b.visitor, sec.total_b.unit, sec.total_b.gmv, pp(sec.total_b.ctr), pp(sec.total_b.co),
                    sec.growth.impression, sec.growth.click, sec.growth.visitor, sec.growth.unit, sec.growth.gmv_gap, sec.growth.gmv, sec.growth.ctr, sec.growth.co,
                );
            });

            const bodyRows = skuOrder.map((sku) => {
                const base = baseMap.get(sku) || secMaps.map(s => s.map.get(sku)).find(Boolean) || {};
                const row = [
                    base.mark || '-',
                    sku || '',
                    base.product_name || '',
                    base.product_link || '',
                    base.highest_gmv_store || '',
                    base.highest_impression_store || '',
                    base.top5_signal || '-',
                ];
                secMaps.forEach(({ map }) => {
                    const r = map.get(sku);
                    if (!r) {
                        for (let i = 0; i < 24; i += 1) row.push(null);
                        return;
                    }
                    row.push(
                        r.pid_a ?? 0,
                        r.a?.impression, r.a?.click, r.a?.visitor, r.a?.unit, r.a?.gmv, pp(r.a?.ctr), pp(r.a?.co),
                        r.pid_b ?? 0,
                        r.b?.impression, r.b?.click, r.b?.visitor, r.b?.unit, r.b?.gmv, pp(r.b?.ctr), pp(r.b?.co),
                        r.growth?.impression, r.growth?.click, r.growth?.visitor, r.growth?.unit, r.growth?.gmv_gap, r.growth?.gmv, r.growth?.ctr, r.growth?.co,
                    );
                });
                return row;
            });

            const uiWs = XLSX.utils.aoa_to_sheet([uiHdrGroupTop, uiHdrGroupMid, uiHdrSub, totalRow, ...bodyRows]);
            const fixedCols = [12, 20, 28, 28, 24, 24, 16];
            const blockCols = [8, 10, 10, 10, 10, 12, 10, 10, 8, 10, 10, 10, 10, 12, 10, 10, 10, 10, 10, 10, 12, 10, 10, 10];
            const widths = [...fixedCols];
            secMaps.forEach(() => widths.push(...blockCols));
            uiWs['!cols'] = widths.map(w => ({ wch: w }));
            uiWs['!freeze'] = { xSplit: 0, ySplit: 3 };
            const uiMerges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
            secMaps.forEach((_, i) => {
                const base = 7 + (i * 24);
                uiMerges.push({ s: { r: 0, c: base }, e: { r: 0, c: base + 23 } });
                uiMerges.push({ s: { r: 1, c: base }, e: { r: 1, c: base + 7 } });
                uiMerges.push({ s: { r: 1, c: base + 8 }, e: { r: 1, c: base + 15 } });
                uiMerges.push({ s: { r: 1, c: base + 16 }, e: { r: 1, c: base + 23 } });
            });
            uiWs['!merges'] = uiMerges;

            const uiBorder = {
                top: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
                bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
                left: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
                right: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
            };
            const uiStyle = (fill, font = {}, numFmt = null, align = 'left') => ({
                fill: { patternType: 'solid', fgColor: { rgb: fill } },
                font: { name: 'Calibri', sz: 10, bold: !!font.bold, color: { rgb: font.color || 'FF111827' } },
                alignment: { horizontal: align, vertical: 'center', wrapText: true },
                border: uiBorder,
                ...(numFmt ? { numFmt } : {}),
            });
            const ref = XLSX.utils.decode_range(uiWs['!ref'] || 'A1');
            for (let r = 0; r <= ref.e.r; r++) {
                for (let c = 0; c <= ref.e.c; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (!uiWs[addr]) continue;
                    let fill = 'FFFFFFFF';
                    let font = {};
                    let numFmt = null;
                    let align = c >= 7 ? 'right' : 'left';

                    if (r <= 2) {
                        if (c <= 6) fill = 'FF374151';
                        else {
                            const rel = (c - 7) % 24;
                            if (rel <= 7) fill = 'FF1E3A5F';
                            else if (rel <= 15) fill = 'FF1A4731';
                            else fill = 'FF3B1F1F';
                        }
                        font = { bold: true, color: 'FFFFFFFF' };
                        align = 'center';
                    } else if (r === 3) {
                        fill = 'FFFFF2CC';
                        font = { bold: true, color: 'FF111827' };
                    } else {
                        if (c <= 6) fill = 'FFFFFFFF';
                        else {
                            const rel = (c - 7) % 24;
                            if (rel <= 7) fill = 'FFE8F1FB';
                            else if (rel <= 15) fill = 'FFE7F8EF';
                            else {
                                const v = uiWs[addr].v;
                                if (v == null || v === '') fill = 'FFFFFFFF';
                                else fill = Number(v) >= 0 ? 'FFE0EDFF' : 'FFFCE7F3';
                            }
                        }
                    }

                    if (r >= 3 && c >= 7) {
                        const rel = (c - 7) % 24;
                        if ([6, 7, 14, 15].includes(rel)) numFmt = '#,##0.00"%"';
                        if ([16, 17, 18, 19, 21, 22, 23].includes(rel)) numFmt = '+0.00"%";-0.00"%";"—"';
                        if (rel === 20) numFmt = '+#,##0;-#,##0;"—"';
                        if ([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13].includes(rel)) numFmt = '#,##0';
                    }

                    if (c === 6 && r >= 4) {
                        const sig = String(uiWs[addr].v || '').toLowerCase();
                        if (sig.includes('drop')) {
                            fill = 'FFFCE7F3';
                            font = { bold: true, color: 'FFBE185D' };
                            align = 'center';
                        } else if (sig.includes('growth')) {
                            fill = 'FFE0EDFF';
                            font = { bold: true, color: 'FF1D4ED8' };
                            align = 'center';
                        } else {
                            align = 'center';
                        }
                    }

                    if (c === 3 && r >= 4) {
                        const v = String(uiWs[addr].v || '');
                        if (/^https?:\/\//i.test(v)) uiWs[addr].l = { Target: v };
                    }

                    uiWs[addr].s = uiStyle(fill, font, numFmt, align);
                }
            }
            XLSX.utils.book_append_sheet(wb, uiWs, uniqueExcelSheetName('UI View', usedSheetNames));
        }

        // ── colour palettes (ARGB hex) ──────────────────────────────
        const CLR_A_HDR  = 'FF1E3A5F'; // dark navy  — Period A header
        const CLR_A_ROW  = 'FFD6E4F0'; // light blue — Period A data
        const CLR_B_HDR  = 'FF1A4731'; // dark green — Period B header
        const CLR_B_ROW  = 'FFD1FAE5'; // light green — Period B data
        const CLR_G_HDR  = 'FF3B1F1F'; // dark maroon — Growth header
        const CLR_G_POS  = 'FFC6EFCE'; const CLR_G_POS_FNT = 'FF276221';
        const CLR_G_NEG  = 'FFFFC7CE'; const CLR_G_NEG_FNT = 'FF9C0006';
        const CLR_TOTAL  = 'FFFFF2CC'; // yellow — total row
        const CLR_WHITE  = 'FFFFFFFF';
        const CLR_SKU_H  = 'FF374151'; // dark grey — SKU header

        const BORDER = {
            top:    { style: 'thin', color: { rgb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
            left:   { style: 'thin', color: { rgb: 'FFD1D5DB' } },
            right:  { style: 'thin', color: { rgb: 'FFD1D5DB' } },
        };

        const cellStyle = (fill, font = {}, numFmt = null, bold = false, align = 'right') => ({
            fill: { patternType: 'solid', fgColor: { rgb: fill } },
            font: { name: 'Calibri', sz: 10, ...font, bold: bold || font.bold,
                    color: { rgb: font.color || 'FF000000' } },
            alignment: { horizontal: align, vertical: 'center', wrapText: false },
            border: BORDER,
            ...(numFmt ? { numFmt } : {}),
        });

        const metHdr = ['Imp', 'Click', 'Visitor', 'Unit', 'GMV', 'CTR', 'CO'];
        const gHdr   = ['Imp%', 'Click%', 'Visitor%', 'Unit%', 'GMV Gap', 'GMV%', 'CTR%', 'CO%'];

        // number format strings
        // CTR/CO values are pre-multiplied ×100 (e.g. 49.71), so show as "49.71%"
        const FMT_NUM   = '#,##0';
        const FMT_PCT   = '#,##0.00"%"';           // e.g. 49.71%
        const FMT_GPCT  = '+0.00"%";-0.00"%";"—"'; // growth % with +/-
        const FMT_GNUM  = '+#,##0;-#,##0;"—"';      // GMV Gap with +/-

        // col format: 0=SKU 1-5=nums 6-7=pct | same for B | growth 8cols
        const colFmt = (c) => {
            if (c === 0) return null;
            const rel = (c - 1) % 7; // within period block
            if (rel >= 5) return FMT_PCT;  // CTR, CO
            return FMT_NUM;
        };

        const applyCell = (ws, r, c, value, style) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = {};
            ws[addr].v = value ?? null;
            ws[addr].t = typeof value === 'number' ? 'n' : 's';
            ws[addr].s = style;
        };

        const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
        const dateALabel = data.week_a_start ? ` (${fmtDate(data.week_a_start)} – ${fmtDate(data.week_a_end)})` : '';
        const dateBLabel = data.week_b_start ? ` (${fmtDate(data.week_b_start)} – ${fmtDate(data.week_b_end)})` : '';

        // ── Helper: write one section sheet ─────────────────────────
        // Column layout (27 cols total):
        //   c0=SKU  c1=Name  c2=Link
        //   c3-c10  : Period A  (PID, Imp, Click, Visitor, Unit, GMV, CTR, CO)
        //   c11-c18 : Period B  (PID, Imp, Click, Visitor, Unit, GMV, CTR, CO)
        //   c19-c26 : Growth    (Imp%, Click%, Visitor%, Unit%, GMV Gap, GMV%, CTR%, CO%)
        const writeSection = (sec) => {
            const sheetName = uniqueExcelSheetName(sec.store_name || sec.section, usedSheetNames);
            const ta = sec.total_a; const tb = sec.total_b; const tg = sec.growth;

            const labelA = `← ${weekA}${dateALabel} →`;
            const labelB = `← ${weekB}${dateBLabel} →`;
            const grpRow  = ['SKU', 'Name', 'Link', labelA, ...Array(7).fill(''), labelB, ...Array(7).fill(''), '← Growth →', ...Array(7).fill('')];
            const subHdr  = ['SKU', 'Name', 'Link', 'PIDs', ...metHdr, 'PIDs', ...metHdr, ...gHdr];

            const pv = (v) => v != null ? v : null;
            const pPct = (v) => v != null ? parseFloat((v * 100).toFixed(4)) : null;

            const mkDataRow = (label, a, b, g, pidA, pidB, name, link) => [
                label, name || '', link || '',
                pidA ?? 0,
                a.impression, a.click, a.visitor, a.unit, a.gmv, pPct(a.ctr), pPct(a.co),
                pidB ?? 0,
                b.impression, b.click, b.visitor, b.unit, b.gmv, pPct(b.ctr), pPct(b.co),
                pv(g.impression), pv(g.click), pv(g.visitor), pv(g.unit),
                pv(g.gmv_gap), pv(g.gmv), pv(g.ctr), pv(g.co),
            ];

            const totalRowData = mkDataRow('TOTAL', ta, tb, tg, sec.total_pid_a, sec.total_pid_b, '', '');
            const orderedRows = enrichAndOrderRows(sec.rows);
            const skuRows = orderedRows.map(r => mkDataRow(r.sku, r.a, r.b, r.growth, r.pid_a, r.pid_b, r.product_name, r.product_link));

            const aoa = [grpRow, subHdr, totalRowData, ...skuRows];
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Merges: A=c3-c10, B=c11-c18, G=c19-c26
            ws['!merges'] = [
                { s: { r: 0, c: 3  }, e: { r: 0, c: 10 } },
                { s: { r: 0, c: 11 }, e: { r: 0, c: 18 } },
                { s: { r: 0, c: 19 }, e: { r: 0, c: 26 } },
            ];
            ws['!cols'] = [
                { wch: 38 }, { wch: 32 }, { wch: 32 },
                { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
                { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
                { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 },
            ];
            ws['!freeze'] = { xSplit: 1, ySplit: 2 };

            // Style row 0 (group headers) — 27 items
            const grpStyles = [
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'left'),
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                cellStyle(CLR_A_HDR, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                ...Array(7).fill(cellStyle(CLR_A_HDR, { color: 'FFFFFFFF' })),
                cellStyle(CLR_B_HDR, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                ...Array(7).fill(cellStyle(CLR_B_HDR, { color: 'FFFFFFFF' })),
                cellStyle(CLR_G_HDR, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                ...Array(7).fill(cellStyle(CLR_G_HDR, { color: 'FFFFFFFF' })),
            ];
            grpStyles.forEach((s, c) => applyCell(ws, 0, c, grpRow[c], s));

            // Style row 1 (sub headers) — 27 items
            const subStyles = [
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                cellStyle(CLR_SKU_H, { color: 'FFFFFFFF', bold: true }, null, true, 'center'),
                cellStyle(CLR_A_HDR, { color: 'FFFFFFFF', bold: true }, FMT_NUM,  true, 'center'),
                ...Array(5).fill(cellStyle(CLR_A_HDR, { color: 'FFFFFFFF', bold: true }, FMT_NUM,  true, 'center')),
                ...Array(2).fill(cellStyle(CLR_A_HDR, { color: 'FFFFFFFF', bold: true }, FMT_PCT,  true, 'center')),
                cellStyle(CLR_B_HDR, { color: 'FFFFFFFF', bold: true }, FMT_NUM,  true, 'center'),
                ...Array(5).fill(cellStyle(CLR_B_HDR, { color: 'FFFFFFFF', bold: true }, FMT_NUM,  true, 'center')),
                ...Array(2).fill(cellStyle(CLR_B_HDR, { color: 'FFFFFFFF', bold: true }, FMT_PCT,  true, 'center')),
                ...Array(4).fill(cellStyle(CLR_G_HDR, { color: 'FFFFFFFF', bold: true }, FMT_GPCT, true, 'center')),
                cellStyle(CLR_G_HDR, { color: 'FFFFFFFF', bold: true }, FMT_GNUM,  true, 'center'),
                ...Array(3).fill(cellStyle(CLR_G_HDR, { color: 'FFFFFFFF', bold: true }, FMT_GPCT, true, 'center')),
            ];
            subStyles.forEach((s, c) => applyCell(ws, 1, c, subHdr[c], s));

            // Style data rows (total + sku rows)
            [[totalRowData, true], ...skuRows.map(r => [r, false])].forEach(([row, isTotal], ri) => {
                const dataRowIdx = ri + 2;
                row.forEach((val, c) => {
                    let bg, fnt = {}, numFmt = null;
                    if (c === 0) {
                        bg = isTotal ? CLR_TOTAL : CLR_WHITE;
                        fnt = isTotal ? { bold: true } : {};
                        applyCell(ws, dataRowIdx, c, val, cellStyle(bg, fnt, null, isTotal, 'left'));
                        return;
                    }
                    if (c === 1) {
                        bg = isTotal ? CLR_TOTAL : CLR_WHITE;
                        applyCell(ws, dataRowIdx, c, val, cellStyle(bg, {}, null, false, 'left'));
                        return;
                    }
                    if (c === 2) {
                        bg = isTotal ? CLR_TOTAL : CLR_WHITE;
                        const lStyle = val ? cellStyle(bg, { color: 'FF2563EB', underline: true }, null, false, 'left') : cellStyle(bg, {}, null, false, 'left');
                        applyCell(ws, dataRowIdx, c, val || '', lStyle);
                        if (val && /^https?:\/\//i.test(String(val))) {
                            const addr = XLSX.utils.encode_cell({ r: dataRowIdx, c: 2 });
                            if (ws[addr]) ws[addr].l = { Target: String(val) };
                        }
                        return;
                    }
                    if (c >= 3 && c <= 10) {
                        // Period A: c3=PID, c4-c8=metrics, c9-c10=CTR/CO
                        bg = isTotal ? CLR_TOTAL : CLR_A_ROW;
                        numFmt = (c === 9 || c === 10) ? FMT_PCT : FMT_NUM;
                        fnt = { bold: isTotal };
                    } else if (c >= 11 && c <= 18) {
                        // Period B: c11=PID, c12-c16=metrics, c17-c18=CTR/CO
                        bg = isTotal ? CLR_TOTAL : CLR_B_ROW;
                        numFmt = (c === 17 || c === 18) ? FMT_PCT : FMT_NUM;
                        fnt = { bold: isTotal };
                    } else {
                        // Growth cols c19-c26; c23=GMV Gap
                        const gIdx = c - 19;
                        const isGMVGap = gIdx === 4;
                        const isFullDrop = val === -100;
                        const isPos = val != null && val >= 0;
                        if (val == null) { bg = CLR_WHITE; fnt = { color: 'FF888888' }; }
                        else if (isTotal) { bg = CLR_TOTAL; fnt = { bold: true, color: isPos ? CLR_G_POS_FNT : CLR_G_NEG_FNT }; }
                        else if (isFullDrop) { bg = 'FFFFF2CC'; fnt = { color: 'FF92400E' }; }
                        else { bg = isPos ? CLR_G_POS : CLR_G_NEG; fnt = { color: isPos ? CLR_G_POS_FNT : CLR_G_NEG_FNT }; }
                        numFmt = isGMVGap ? FMT_GNUM : FMT_GPCT;
                    }
                    applyCell(ws, dataRowIdx, c, val, cellStyle(bg, fnt, numFmt, isTotal));
                });
            });

            return { ws, sheetName };
        };

        // ── Summary sheet: SKUs as rows, sections expand to right ───
        // Fixed cols: SKU(0), Name(1), Link(2); BLK=24 per section (PID+7+PID+7+8)
        const writeSummary = () => {
            const metLabels = ['Imp', 'Click', 'Visitor', 'Unit', 'GMV', 'CTR', 'CO'];
            const gLabels   = ['Imp%', 'Click%', 'Visitor%', 'Unit%', 'GMV Gap', 'GMV%', 'CTR%', 'CO%'];
            const BLK = 8 + 8 + 8; // PID+7metrics per period × 2 + 8 growth = 24
            const FIXED = 3; // SKU, Name, Link
            const sections = data.sections;

            const allSkus = [];
            const skuSet = new Set();
            const skuMeta = {};
            sections.forEach(sec => {
                sec.rows.forEach(r => {
                    if (r.sku && !skuSet.has(r.sku)) {
                        skuSet.add(r.sku); allSkus.push(r.sku);
                        skuMeta[r.sku] = { name: r.product_name || '', link: r.product_link || '' };
                    }
                });
            });

            const aoa = [];

            // Row 0: fixed labels + section names spanning BLK cols each
            const r0 = ['SKU', 'Name', 'Link'];
            sections.forEach(s => { r0.push(s.store_name || s.section); for (let i=1;i<BLK;i++) r0.push(''); });
            aoa.push(r0);

            // Row 1: period group headers
            const r1 = ['', '', ''];
            sections.forEach(() => {
                r1.push(`← ${weekA}${dateALabel} →`); for (let i=1;i<8;i++) r1.push('');
                r1.push(`← ${weekB}${dateBLabel} →`); for (let i=1;i<8;i++) r1.push('');
                r1.push('← Growth →');                for (let i=1;i<8;i++) r1.push('');
            });
            aoa.push(r1);

            // Row 2: sub-headers
            const r2 = ['SKU', 'Name', 'Link'];
            sections.forEach(() => { r2.push('PIDs', ...metLabels, 'PIDs', ...metLabels, ...gLabels); });
            aoa.push(r2);

            // Row 3: TOTAL per section
            const rTotal = ['TOTAL', '', ''];
            sections.forEach(sec => {
                const a = sec.total_a; const b = sec.total_b; const g = sec.growth;
                rTotal.push(sec.total_pid_a ?? 0);
                rTotal.push(a.impression, a.click, a.visitor, a.unit, a.gmv, parseFloat(((a.ctr||0)*100).toFixed(4)), parseFloat(((a.co||0)*100).toFixed(4)));
                rTotal.push(sec.total_pid_b ?? 0);
                rTotal.push(b.impression, b.click, b.visitor, b.unit, b.gmv, parseFloat(((b.ctr||0)*100).toFixed(4)), parseFloat(((b.co||0)*100).toFixed(4)));
                rTotal.push(g.impression, g.click, g.visitor, g.unit, g.gmv_gap, g.gmv, g.ctr, g.co);
            });
            aoa.push(rTotal);

            // SKU rows
            allSkus.forEach(sku => {
                const meta = skuMeta[sku] || {};
                const row = [sku, meta.name || '', meta.link || ''];
                sections.forEach(sec => {
                    const found = sec.rows.find(r => r.sku === sku);
                    if (found) {
                        row.push(found.pid_a ?? 0);
                        row.push(found.a.impression, found.a.click, found.a.visitor, found.a.unit, found.a.gmv,
                            parseFloat(((found.a.ctr||0)*100).toFixed(4)), parseFloat(((found.a.co||0)*100).toFixed(4)));
                        row.push(found.pid_b ?? 0);
                        row.push(found.b.impression, found.b.click, found.b.visitor, found.b.unit, found.b.gmv,
                            parseFloat(((found.b.ctr||0)*100).toFixed(4)), parseFloat(((found.b.co||0)*100).toFixed(4)));
                        row.push(found.growth.impression, found.growth.click, found.growth.visitor, found.growth.unit,
                            found.growth.gmv_gap, found.growth.gmv, found.growth.ctr, found.growth.co);
                    } else {
                        for (let i=0;i<BLK;i++) row.push(null);
                    }
                });
                aoa.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Merges
            const merges = [];
            sections.forEach((_, si) => {
                const base = FIXED + si * BLK;
                merges.push({ s:{r:0,c:base},    e:{r:0,c:base+BLK-1} });
                merges.push({ s:{r:1,c:base},    e:{r:1,c:base+7}    });
                merges.push({ s:{r:1,c:base+8},  e:{r:1,c:base+15}   });
                merges.push({ s:{r:1,c:base+16}, e:{r:1,c:base+23}   });
            });
            ws['!merges'] = merges;

            const colWidths = [{ wch: 38 }, { wch: 32 }, { wch: 32 }];
            sections.forEach(() => {
                colWidths.push({ wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 });
                colWidths.push({ wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 });
                colWidths.push({ wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 11 }, { wch: 11 });
            });
            ws['!cols'] = colWidths;
            ws['!freeze'] = { xSplit: FIXED, ySplit: 3 };

            // Apply styles
            const totalRows = 4 + allSkus.length;
            for (let ri = 0; ri < totalRows; ri++) {
                const isHdr0 = ri === 0;
                const isHdr1 = ri === 1;
                const isHdr2 = ri === 2;
                const isTotal = ri === 3;

                // Fixed cols (SKU=0, Name=1, Link=2)
                for (let fc = 0; fc < FIXED; fc++) {
                    const val = aoa[ri]?.[fc];
                    const isHdr = isHdr0 || isHdr1 || isHdr2;
                    const bg = isTotal ? CLR_TOTAL : isHdr ? CLR_SKU_H : CLR_WHITE;
                    const fnt = isHdr ? { color: 'FFFFFFFF', bold: true } : (isTotal && fc === 0 ? { bold: true } : {});
                    applyCell(ws, ri, fc, val, cellStyle(bg, fnt, null, isHdr || isTotal, fc === 0 ? 'left' : 'center'));
                }

                sections.forEach((_, si) => {
                    const base = FIXED + si * BLK;
                    for (let ci = 0; ci < BLK; ci++) {
                        const c = base + ci;
                        const val = aoa[ri]?.[c];
                        let bg, fnt = {}, numFmt = null;
                        // ci 0-7: Period A (PID at 0, metrics at 1-7)
                        // ci 8-15: Period B (PID at 8, metrics at 9-15)
                        // ci 16-23: Growth
                        const inA = ci < 8;
                        const inB = ci >= 8 && ci < 16;
                        const inG = ci >= 16;
                        const relG = ci - 16;
                        const relA = ci;       // CTR/CO at relA=6,7
                        const relB = ci - 8;   // CTR/CO at relB=6,7

                        if (isHdr0) {
                            applyCell(ws, ri, c, val, cellStyle(CLR_A_HDR, { color: 'FFFFFFFF', bold: true }, null, true, 'center'));
                            continue;
                        }
                        if (isHdr1) {
                            bg = inA ? CLR_A_HDR : inB ? CLR_B_HDR : CLR_G_HDR;
                            applyCell(ws, ri, c, val, cellStyle(bg, { color: 'FFFFFFFF', bold: true }, null, true, 'center'));
                            continue;
                        }
                        if (isHdr2) {
                            bg = inA ? CLR_A_HDR : inB ? CLR_B_HDR : CLR_G_HDR;
                            const isCTR_A = relA === 6 || relA === 7;
                            const isCTR_B = relB === 6 || relB === 7;
                            const fmtH = inA ? (isCTR_A ? FMT_PCT : FMT_NUM)
                                       : inB ? (isCTR_B ? FMT_PCT : FMT_NUM)
                                       : (relG === 4 ? FMT_GNUM : FMT_GPCT);
                            applyCell(ws, ri, c, val, cellStyle(bg, { color: 'FFFFFFFF', bold: true }, fmtH, true, 'center'));
                            continue;
                        }
                        // data rows
                        if (inA) {
                            bg = isTotal ? CLR_TOTAL : (val == null ? CLR_WHITE : CLR_A_ROW);
                            numFmt = (relA === 6 || relA === 7) ? FMT_PCT : FMT_NUM;
                            fnt = { bold: isTotal };
                        } else if (inB) {
                            bg = isTotal ? CLR_TOTAL : (val == null ? CLR_WHITE : CLR_B_ROW);
                            numFmt = (relB === 6 || relB === 7) ? FMT_PCT : FMT_NUM;
                            fnt = { bold: isTotal };
                        } else {
                            const isGMVGap = relG === 4;
                            const isFullDrop = val === -100;
                            const isPos = val != null && val >= 0;
                            if (val == null) { bg = CLR_WHITE; fnt = { color: 'FF888888' }; }
                            else if (isTotal) { bg = CLR_TOTAL; fnt = { bold: true, color: isPos ? CLR_G_POS_FNT : CLR_G_NEG_FNT }; }
                            else if (isFullDrop) { bg = 'FFFFF2CC'; fnt = { color: 'FF92400E' }; }
                            else { bg = isPos ? CLR_G_POS : CLR_G_NEG; fnt = { color: isPos ? CLR_G_POS_FNT : CLR_G_NEG_FNT }; }
                            numFmt = isGMVGap ? FMT_GNUM : FMT_GPCT;
                        }
                        applyCell(ws, ri, c, val ?? null, cellStyle(bg, fnt, numFmt, isTotal));
                    }
                });
            }
            return ws;
        };

        data.sections.forEach(sec => {
            const { ws, sheetName } = writeSection(sec);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        const summaryWs = writeSummary();
        const summarySheetName = uniqueExcelSheetName(t('productPerf.excelSummarySheet'), usedSheetNames);
        XLSX.utils.book_append_sheet(wb, summaryWs, summarySheetName);
        // Keep UI View as first sheet when present
        const uiName = wb.SheetNames.find(n => n.toLowerCase().includes('ui view'));
        if (uiName) wb.SheetNames = [uiName, ...wb.SheetNames.filter(n => n !== uiName)];
        else wb.SheetNames = [summarySheetName, ...wb.SheetNames.filter(n => n !== summarySheetName)];

        XLSX.writeFile(wb, `Comparison_${(weekA||'A').replace(/\s/g,'_')}_vs_${(weekB||'B').replace(/\s/g,'_')}.xlsx`);
        } catch (err) {
            console.error('Comparison Excel export failed:', err);
            message.error(err?.message || String(err) || t('productPerf.msgDownloadExcelFailed'));
        }
    };

    const section = data?.sections?.[sectionIdx];

    const bgA = 'rgba(59,130,246,0.08)';  // soft blue for Period A
    const bgB = 'rgba(34,197,94,0.08)';   // soft green for Period B
    const bgG = 'rgba(239,68,68,0.04)';   // soft red for Growth
    const mkCell = (bg, content) => <div style={{ background: bg, margin: '-4px -8px', padding: '4px 8px', height: '100%' }}>{content}</div>;

    const normalizeMarkGroup = (mark) => {
        const m = String(mark || '').trim().toLowerCase();
        if (m.includes('hot')) return 'hot';
        if (m.includes('regular')) return 'regular';
        if (m.includes('gtm')) return 'gtm';
        if (m.includes('new')) return 'new';
        if (m.includes('old')) return 'old';
        return null;
    };

    const buildTop5SignalMap = (rows) => {
        const byMark = new Map();
        rows.forEach((r) => {
            const mk = normalizeMarkGroup(r.mark);
            if (!mk) return;
            if (!byMark.has(mk)) byMark.set(mk, []);
            byMark.get(mk).push(r);
        });

        const out = new Map();
        byMark.forEach((items) => {
            const withGrowth = items.filter(r => typeof r?.growth?.gmv === 'number');
            const topGrowth = [...withGrowth].sort((a, b) => (b.growth.gmv ?? -Infinity) - (a.growth.gmv ?? -Infinity)).slice(0, 5);
            const topDrop = [...withGrowth].sort((a, b) => (a.growth.gmv ?? Infinity) - (b.growth.gmv ?? Infinity)).slice(0, 5);
            topGrowth.forEach(r => out.set(r.sku, { label: t('productPerf.top5Growth'), kind: 'growth' }));
            topDrop.forEach(r => {
                // If a SKU appears in both lists, keep the stronger absolute move.
                const prev = out.get(r.sku);
                if (!prev || prev.kind !== 'growth') out.set(r.sku, { label: t('productPerf.top5Drop'), kind: 'drop' });
            });
        });
        return out;
    };

    const enrichAndOrderRows = (rows) => {
        const top5MapLocal = buildTop5SignalMap(rows);
        const enriched = rows.map((r, i) => {
            const sig = top5MapLocal.get(r.sku);
            return {
                ...r,
                _markGroup: normalizeMarkGroup(r.mark),
                top5_signal: sig?.label || '-',
                top5_kind: sig?.kind || null,
                key: `${r.sku}_${i}`,
            };
        });

        const sortBySignalAndGrowth = (arr) => arr.sort((a, b) => {
            const signalRank = (r) => (r.top5_kind === 'growth' ? 0 : r.top5_kind === 'drop' ? 1 : 2);
            const ra = signalRank(a);
            const rb = signalRank(b);
            if (ra !== rb) return ra - rb;
            const ga = Number(a?.growth?.gmv ?? 0);
            const gb = Number(b?.growth?.gmv ?? 0);
            if (ra === 0) return gb - ga;
            if (ra === 1) return ga - gb;
            return Number(b?.b?.gmv ?? 0) - Number(a?.b?.gmv ?? 0);
        });

        const byMark = (mark, includeNoSignal) =>
            sortBySignalAndGrowth(
                enriched.filter(r => r._markGroup === mark && (includeNoSignal || !!r.top5_kind))
            );

        return [
            ...byMark('gtm', true),
            ...byMark('new', false),
            ...byMark('hot', false),
            ...byMark('regular', false),
            ...byMark('old', false),
        ];
    };

    const cmpCols = [
        {
            title: t('productPerf.colMark'),
            width: 95,
            fixed: 'left',
            align: 'center',
            render: (_, r) => (r._isTotal ? '—' : (r.mark ? <MarkTag mark={r.mark} /> : '—')),
        },
        {
            title: t('productPerf.colSku'),
            dataIndex: 'sku',
            width: 170,
            fixed: 'left',
            render: (v, r) => (
                <Tooltip title={v}>
                    <Text style={{ fontWeight: r._isTotal ? 700 : 600, fontSize: 12 }} ellipsis>{v || '—'}</Text>
                </Tooltip>
            ),
        },
        {
            title: t('productPerf.colProduct'),
            width: 220,
            fixed: 'left',
            render: (_, r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.photo
                        ? <img src={r.photo} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                        : <div style={{ width: 40, height: 40, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }} />}
                    <div
                        title={r.product_name || '—'}
                        style={{
                            fontSize: 12,
                            lineHeight: 1.25,
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                        }}
                    >
                        {r.product_name || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: t('productPerf.colLink'),
            width: 90,
            align: 'center',
            render: (_, r) => (
                r.product_link
                    ? <a href={r.product_link} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }} title={t('productPerf.titleOpenProduct')}>↗</a>
                    : '—'
            ),
        },
        { title: t('productPerf.colHighestGmvStore'), dataIndex: 'highest_gmv_store', width: 170, render: v => v || '—' },
        { title: t('productPerf.colHighestImpressionStore'), dataIndex: 'highest_impression_store', width: 190, render: v => v || '—' },
        {
            title: t('productPerf.colTopSignal'),
            width: 120,
            align: 'center',
            render: (_, r) => {
                if (r._isTotal) return '—';
                if (!r.top5_signal || r.top5_signal === '-') return '—';
                const bg = r.top5_kind === 'drop' ? '#fce7f3' : '#dbeafe';
                const color = r.top5_kind === 'drop' ? '#be185d' : '#1d4ed8';
                return <span style={{ background: bg, color, fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{r.top5_signal}</span>;
            },
        },
        { title: <span style={{ color: '#3b82f6' }}>{weekA || t('productPerf.periodAFallback')}</span>, children: [
            { title: t('productPerf.colPids'),    width: 70,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.pid_a) },
            { title: t('productPerf.colImp'),     width: 110, align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.a?.impression) },
            { title: t('productPerf.colClick'),   width: 90,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.a?.click) },
            { title: t('productPerf.colVisitor'), width: 90,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.a?.visitor) },
            { title: t('productPerf.colUnit'),    width: 80,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.a?.unit) },
            { title: t('productPerf.colGmv'),     width: 130, align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmt(r.a?.gmv) },
            { title: t('productPerf.colCtr'),     width: 80,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmtPct(r.a?.ctr) },
            { title: t('productPerf.colCo'),      width: 80,  align: 'right', onCell: () => ({ style: { background: bgA } }), render: (_, r) => fmtPct(r.a?.co) },
        ]},
        { title: <span style={{ color: '#22c55e' }}>{weekB || t('productPerf.periodBFallback')}</span>, children: [
            { title: t('productPerf.colPids'),    width: 70,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.pid_b) },
            { title: t('productPerf.colImp'),     width: 110, align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.b?.impression) },
            { title: t('productPerf.colClick'),   width: 90,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.b?.click) },
            { title: t('productPerf.colVisitor'), width: 90,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.b?.visitor) },
            { title: t('productPerf.colUnit'),    width: 80,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.b?.unit) },
            { title: t('productPerf.colGmv'),     width: 130, align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmt(r.b?.gmv) },
            { title: t('productPerf.colCtr'),     width: 80,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmtPct(r.b?.ctr) },
            { title: t('productPerf.colCo'),      width: 80,  align: 'right', onCell: () => ({ style: { background: bgB } }), render: (_, r) => fmtPct(r.b?.co) },
        ]},
        { title: t('productPerf.colGrowth'), children: [
            { title: t('productPerf.colImpPct'),     width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.impression) },
            { title: t('productPerf.colClickPct'),   width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.click) },
            { title: t('productPerf.colVisitorPct'), width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.visitor) },
            { title: t('productPerf.colUnitPct'),    width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.unit) },
            { title: t('productPerf.colGmvGap'),  width: 130, align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGap(r.growth?.gmv_gap) },
            { title: t('productPerf.colGmvPct'),     width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.gmv) },
            { title: t('productPerf.colCtrPct'),     width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.ctr) },
            { title: t('productPerf.colCoPct'),      width: 90,  align: 'right', onCell: () => ({ style: { background: bgG } }), render: (_, r) => fmtGrowth(r.growth?.co) },
        ]},
    ];

    const displayRows = section ? enrichAndOrderRows(section.rows) : [];

    const tableData = section ? [
        {
            sku: t('productPerf.colTotalRow'),
            product_name: '',
            product_link: '',
            mark: '',
            highest_gmv_store: '—',
            highest_impression_store: '—',
            top5_signal: '—',
            a: section.total_a,
            b: section.total_b,
            growth: section.growth,
            pid_a: section.total_pid_a,
            pid_b: section.total_pid_b,
            _isTotal: true,
            key: '__total',
        },
        ...displayRows,
    ] : [];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div style={sectionCard}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                    <SectionHeading icon={<SwapOutlined />} color="#f59e0b">{t('productPerf.comparisonTitle')}</SectionHeading>
                </div>
                <div style={{ padding: '16px 20px' }}>
                    <Row gutter={[16, 12]} align="bottom">
                        <Col>
                            <Label>{t('productPerf.labelPeriodA')}</Label>
                            <Select allowClear showSearch placeholder={t('productPerf.phPeriodA')} style={{ width: 260 }}
                                value={weekA} onChange={setWeekA} options={weekOpts} />
                        </Col>
                        <Col>
                            <Label>{t('productPerf.labelPeriodB')}</Label>
                            <Select allowClear showSearch placeholder={t('productPerf.phPeriodB')} style={{ width: 260 }}
                                value={weekB} onChange={setWeekB} options={weekOpts} />
                        </Col>
                        <Col>
                            <Label>{t('productPerf.labelPlatform')}</Label>
                            <Select style={{ width: 160 }} value={platform} onChange={setPlatform}
                                options={[
                                    { value: 'All',    label: t('productPerf.platformAll') },
                                    { value: 'Shopee', label: 'Shopee' },
                                    { value: 'TikTok', label: 'TikTok' },
                                ]}
                            />
                        </Col>
                        <Col>
                            <Space>
                                <Button loading={loading} disabled={!weekA || !weekB} onClick={handleLoad}
                                    icon={<SwapOutlined />}
                                    style={{ height: 36, borderRadius: 8, fontWeight: 700, background: '#f59e0b', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(245,158,11,0.28)' }}>
                                    {t('productPerf.btnLoadComparison')}
                                </Button>
                                <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!data}
                                    style={{ height: 36, borderRadius: 8, fontWeight: 600 }}>
                                    {t('productPerf.btnDownloadExcel')}
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </div>
            </div>

            {data && (
                <>
                    <Space align="center">
                        <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('productPerf.sectionLabel')}</Text>
                        <Select value={sectionIdx} onChange={v => setSectionIdx(v)} style={{ width: 300 }}
                            options={data.sections.map((s, i) => ({ value: i, label: s.store_name || s.section }))} />
                    </Space>

                    {section && (
                        <Row gutter={[16, 12]}>
                            {[
                                { label: t('productPerf.statGmvA', { week: weekA }), val: section.total_a.gmv, accent: '#3b82f6', prec: 0 },
                                { label: t('productPerf.statGmvA', { week: weekB }), val: section.total_b.gmv, accent: '#10b981', prec: 0 },
                                { label: t('productPerf.statGmvGrowthPct'), val: section.growth.gmv ?? 0, accent: (section.growth.gmv ?? 0) >= 0 ? '#22c55e' : '#ef4444', prec: 2, suffix: '%' },
                                { label: t('productPerf.colGmvGap'), val: section.growth.gmv_gap ?? 0, accent: (section.growth.gmv_gap ?? 0) >= 0 ? '#22c55e' : '#ef4444', prec: 0 },
                            ].map(({ label, val, accent, prec, suffix }) => (
                                <Col key={label}>
                                    <div style={statCard(accent)}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "'Outfit', sans-serif" }}>
                                            {prec === 0 ? Number(val).toLocaleString() : ((val >= 0 ? '+' : '') + Number(val).toFixed(prec))}{suffix || ''}
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    )}

                    <Table
                        dataSource={tableData}
                        columns={cmpCols}
                        rowKey="key"
                        size="small"
                        scroll={{ x: 'max-content' }}
                        pagination={{ pageSize: 50, showTotal: (tot) => t('productPerf.paginationRows', { total: tot }) }}
                        rowClassName={r => r._isTotal ? 'cmp-total-row' : ''}
                    />
                </>
            )}
        </Space>
    );
}

// ─────────────────────────────────────────────────────────────────
export default function ProductPerformanceCleaner() {
    const { t } = useTranslation();
    const [weeks, setWeeks] = useState([]);

    useEffect(() => {
        api.get('/product-performance/weeks').then(r => setWeeks(r.data)).catch(() => {});
    }, []);

    return (
        <div style={{ padding: '24px 32px' }}>
            <PageHeader
                title={t('productPerfPage.title')}
                subtitle={t('productPerfPage.subtitle')}
                accent="#10b981"
            />
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                <Tabs
                    defaultActiveKey="converter"
                    type="card"
                    items={[
                        { key: 'converter', label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><AppstoreOutlined />{t('productPerfPage.tabConverter')}</span>, children: <ConverterTab /> },
                        { key: 'platform',  label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><CloudUploadOutlined />{t('productPerfPage.tabPlatform')}</span>, children: <PlatformTab weeks={weeks} /> },
                        { key: 'brand',     label: <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><BarChartOutlined />{t('productPerfPage.tabBrand')}</span>, children: <BrandTab weeks={weeks} /> },
                    ]}
                />
            </div>
        </div>
    );
}
