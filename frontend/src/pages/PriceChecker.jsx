import React, { useEffect, useMemo, useState } from 'react';
import {
    Button, Input, InputNumber, Segmented, Collapse, Dropdown, Modal,
    Row, Col, Typography, Table, Upload,
    message, Spin, Divider
} from 'antd';
import {
    InboxOutlined, SyncOutlined, CloudDownloadOutlined,
    CheckCircleFilled, CloseCircleFilled, FileExcelOutlined,
    DatabaseOutlined, DownloadOutlined, UploadOutlined,
    FileTextOutlined, BarChartOutlined, AppstoreOutlined, RiseOutlined,
    UnorderedListOutlined, BarcodeOutlined, ThunderboltOutlined, RightOutlined, LinkOutlined, DownOutlined
} from '@ant-design/icons';
import api from '../api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Bi from '../components/Bi';
import PageHeader from '../components/PageHeader';
import FlagIcon from '../components/FlagIcon';
import {
    readCurrency, writeCurrency,
    SUPPORTED_CURRENCIES, CURRENCY_META, formatPrice,
} from '../utils/currencyStorage';

const { Title, Text } = Typography;
const { Dragger } = Upload;

/* ─── Reusable UI helpers ─── */
const Label = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
        {children}
    </div>
);

const SectionHeading = ({ icon, children, color }) => {
    const { isDark } = useTheme();
    const accent = color ?? (isDark ? '#6366f1' : '#0284c7');
    return (
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ width: 28, height: 28, borderRadius: 6, background: `${accent}22`, border: `1px solid ${accent}40`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: accent, fontSize: 14, flexShrink: 0 }}>{icon}</span>
            {children}
        </div>
    );
};

/* ─── Card style helpers ─── */
const stepCardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
};

const statCardStyle = (accentColor) => ({
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderTop: `4px solid ${accentColor}`,
    borderRadius: 12,
    padding: '20px 16px',
    textAlign: 'center',
});

/** Prefer Material Library main photo (authenticated API); fallback to public image URL. */
const MATERIAL_PREVIEW_CACHE_MAX = 80;
const materialPreviewCache = new Map();

function cacheMaterialPreview(materialId, blobUrl) {
    if (materialPreviewCache.has(materialId)) {
        const prev = materialPreviewCache.get(materialId);
        if (prev !== blobUrl) URL.revokeObjectURL(prev);
    }
    materialPreviewCache.set(materialId, blobUrl);
    if (materialPreviewCache.size > MATERIAL_PREVIEW_CACHE_MAX) {
        const oldest = materialPreviewCache.keys().next().value;
        URL.revokeObjectURL(materialPreviewCache.get(oldest));
        materialPreviewCache.delete(oldest);
    }
}

async function fetchMaterialPreviewUrl(materialId) {
    if (!materialId) return null;
    if (materialPreviewCache.has(materialId)) {
        return materialPreviewCache.get(materialId);
    }
    const { data } = await api.get(`/price-checker/material-preview/${materialId}`, {
        responseType: 'blob',
    });
    if (!data?.size) return null;
    const url = URL.createObjectURL(data);
    cacheMaterialPreview(materialId, url);
    return url;
}

function DirectSkuPhoto({ item, previewSrc, noImageLabel }) {
    const src = previewSrc || item.previewUrl || (
        item.imageSource !== 'brand_material' ? item.image : null
    );
    if (src) {
        return (
            <img
                src={src}
                alt={item.name || item.sku}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
        );
    }
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            <Text style={{ fontSize: 12 }}>{noImageLabel}</Text>
        </div>
    );
}

/* ─── Main Component ─── */
const PriceChecker = () => {
    const { t } = useTranslation();
    const { isDark } = useTheme();
    const [inputMode, setInputMode] = useState('Batch');
    const [method, setMethod] = useState('Listing');
    const [loadingDb, setLoadingDb] = useState(false);
    const [calcLoading, setCalcLoading] = useState(false);
    const [currency, setCurrency] = useState(() => readCurrency());
    const currencyMeta = CURRENCY_META[currency] || CURRENCY_META.IDR;
    const { logActivity } = useAuth();

    const handleCurrencyChange = (next) => {
        if (!SUPPORTED_CURRENCIES.includes(next) || next === currency) return;
        setCurrency(next);
        writeCurrency(next);
        // Stale results reference the previous region's stock keys / prices.
        setDirectResult(null);
        setDirectPreviewBySku({});
        setBatchOverview(null);
    };

    // Direct Input
    const [skuInput, setSkuInput] = useState('');
    const [targetPrice, setTargetPrice] = useState(null);
    const [targetStock, setTargetStock] = useState(null);
    const [directResult, setDirectResult] = useState(null);
    const [directPreviewBySku, setDirectPreviewBySku] = useState({});

    // Batch
    const [fileList, setFileList] = useState([]);
    const [batchOverview, setBatchOverview] = useState(null);
    const [lastStockUploadAt, setLastStockUploadAt] = useState(null);
    const [downloadingWithPicture, setDownloadingWithPicture] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    const formatWibDateTime = (isoString) => {
        if (!isoString) return '-';
        try {
            const dt = new Date(isoString);
            if (Number.isNaN(dt.getTime())) return '-';
            const formatted = new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            }).format(dt);
            return `${formatted} Jakarta Time`;
        } catch {
            return '-';
        }
    };

    const fetchStockUploadStatus = async () => {
        try {
            const res = await api.get('/price-checker/upload-stock-data/status');
            setLastStockUploadAt(res.data?.last_uploaded_at || null);
        } catch {
            setLastStockUploadAt(null);
        }
    };

    useEffect(() => {
        fetchStockUploadStatus();
    }, []);

    useEffect(() => {
        const items = directResult?.items || [];
        const brandItems = items.filter(
            (it) => it.brandMaterialId && !it.previewUrl,
        );
        if (!brandItems.length) {
            setDirectPreviewBySku({});
            return undefined;
        }

        let cancelled = false;
        Promise.all(
            brandItems.map(async (it) => {
                try {
                    const url = await fetchMaterialPreviewUrl(it.brandMaterialId);
                    return url ? [it.sku, url] : null;
                } catch {
                    return null;
                }
            }),
        ).then((pairs) => {
            if (cancelled) return;
            const next = {};
            pairs.forEach((p) => {
                if (p) next[p[0]] = p[1];
            });
            setDirectPreviewBySku(next);
        });

        return () => { cancelled = true; };
    }, [directResult]);

    const fetchReferenceData = async () => {
        setLoadingDb(true);
        try {
            const res = await api.get('/price-checker/refresh');
            message.success(t('priceChecker.msgDbLoaded', { count: res.data.records }));
        } catch (err) {
            message.error(err.response?.data?.detail || t('priceChecker.msgDbFail'));
        } finally { setLoadingDb(false); }
    };

    const syncNeonData = async () => {
        setLoadingDb(true);
        try {
            const res = await api.post('/price-checker/sync');
            message.success(res.data.message);
            fetchReferenceData(); // refresh the loaded cache
            logActivity('Price Checker (Sync DB)');
        } catch (error) {
            message.error(error.response?.data?.detail || t('priceChecker.msgSyncFail'));
        } finally { setLoadingDb(false); }
    };

    const uploadStockData = async ({ file, onSuccess, onError }) => {
        setLoadingDb(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/price-checker/upload-stock-data', formData);
            message.success(res.data.message || t('priceChecker.msgStockOk'));
            setLastStockUploadAt(res.data?.last_uploaded_at || null);
            onSuccess?.(res.data);
            logActivity('Price Checker (Upload Stock Data)');
        } catch (error) {
            const msg = error.response?.data?.detail || 'Failed to upload stock data';
            message.error(msg);
            onError?.(new Error(msg));
        } finally {
            setLoadingDb(false);
        }
    };

    const downloadTemplate = async (tplMethod) => {
        try {
            const res = await api.get(`/price-checker/template/${tplMethod}`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data]));
            Object.assign(document.createElement('a'), { href: url, download: `PC_${tplMethod}_Template.xlsx` }).click();
        } catch (err) { message.error(err.response?.data?.detail || t('priceChecker.msgDownloadTplFail')); }
    };

    const doCalculateDirect = async () => {
        if (!skuInput) { message.warning(t('priceChecker.msgEnterSku')); return; }
        setCalcLoading(true); setDirectResult(null); setDirectPreviewBySku({});
        try {
            const res = await api.post('/price-checker/calculate-direct', {
                sku_string: skuInput,
                target_price: Number(targetPrice || 0),
                target_stock: Number(targetStock || 0),
                currency,
            });
            setDirectResult(res.data);
            logActivity(`Price Checker (Direct ${currency})`);
        } catch (err) { message.error(err.response?.data?.detail || t('priceChecker.msgCalcFail'));
        } finally { setCalcLoading(false); }
    };

    const handleUpload = async () => {
        if (!fileList.length) { message.warning(t('priceChecker.msgUploadFirst')); return; }
        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('method', method);
        formData.append('currency', currency);
        setCalcLoading(true); setBatchOverview(null);
        try {
            const res = await api.post('/price-checker/calculate-batch', formData);
            setBatchOverview(res.data);
            message.success(t('priceChecker.msgBatchDone'));
            logActivity(`Price Checker (Batch ${currency})`);
        } catch (err) { message.error(err.response?.data?.detail || t('priceChecker.msgBatchFail'));
        } finally { setCalcLoading(false); }
    };

    const handleDownloadResult = () => {
        if (!batchOverview?.file_base64) return;
        const bytes = atob(batchOverview.file_base64);
        const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const downloadCurrency = batchOverview?.currency || currency;
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `PC_${method}_${downloadCurrency}_Result.xlsx` }).click();
    };

    const handleDownloadWithPicture = async () => {
        if (!fileList.length) {
            message.warning(t('priceChecker.msgUploadFirst'));
            return;
        }
        setDownloadingWithPicture(true);
        try {
            const formData = new FormData();
            formData.append('file', fileList[0]);
            formData.append('method', method);
            formData.append('currency', currency);
            formData.append('include_pictures', 'true');
            const res = await api.post('/price-checker/calculate-batch', formData);
            if (!res.data?.file_base64) {
                throw new Error('No file generated');
            }
            const bytes = atob(res.data.file_base64);
            const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `PC_${method}_${currency}_Result_With_Picture.xlsx` }).click();
            message.success(t('priceChecker.msgPicReady'));
        } catch (err) {
            message.error(err.response?.data?.detail || err.message || t('priceChecker.msgPicFail'));
        } finally {
            setDownloadingWithPicture(false);
        }
    };

    const runExportData = async (withPictures) => {
        setExportLoading(true);
        try {
            const res = await api.get('/price-checker/export-data', {
                params: { include_pictures: withPictures ? 'true' : 'false' },
                responseType: 'blob',
            });
            const blob = new Blob(
                [res.data],
                { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            );
            const href = URL.createObjectURL(blob);
            const filename = withPictures ? 'Price_Checker_Export_With_Image.xlsx' : 'Price_Checker_Export.xlsx';
            Object.assign(document.createElement('a'), { href, download: filename }).click();
            message.success(withPictures ? t('priceChecker.msgExportPicReady') : t('priceChecker.msgExportReady'));
            logActivity(withPictures
                ? `Price Checker (Export Data With Picture ${currency})`
                : `Price Checker (Export Data ${currency})`);
        } catch (err) {
            message.error(err.response?.data?.detail || t('priceChecker.msgExportFail'));
        } finally {
            setExportLoading(false);
        }
    };

    const handleExportData = (withPictures) => {
        if (!withPictures) {
            runExportData(false);
            return;
        }
        Modal.confirm({
            title: t('priceChecker.exportConfirmTitle'),
            content: t('priceChecker.exportConfirmContent'),
            okText: t('priceChecker.exportConfirmOk'),
            cancelText: t('priceChecker.exportConfirmCancel'),
            onOk: () => runExportData(true),
        });
    };

    /* ─── Table Column Definitions ─── */
    const copyableCellProps = (value, extraStyle = {}) => ({
        style: { userSelect: 'text', cursor: 'copy', ...extraStyle },
        onClick: () => {
            const v = value === null || value === undefined ? '' : String(value);
            navigator.clipboard.writeText(v).then(() => message.success(t('priceChecker.copyOk', { val: v }), 1));
        },
    });

    const isImageUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        return /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url) || url.includes('cdn') || url.includes('imgur.com');
    };

    const copyTable = (data, columns) => {
        const headers = columns.map(c => c.title).join('\t');
        const rows = data.map(row =>
            columns.map(c => {
                const v = row[c.dataIndex];
                return (v === null || v === undefined) ? '' : v;
            }).join('\t')
        ).join('\n');
        navigator.clipboard.writeText(headers + '\n' + rows)
            .then(() => message.success(t('priceChecker.copyTableOk')))
            .catch(() => message.error(t('priceChecker.copyFail')));
    };

    const directStockTypes = useMemo(
        () => directResult?.stock_types || [],
        [directResult],
    );

    const directItemPreviewBySku = useMemo(() => {
        const map = {};
        (directResult?.items || []).forEach((it) => {
            const skuKey = String(it?.sku || '').trim().toUpperCase();
            if (!skuKey) return;
            map[skuKey] = directPreviewBySku[it.sku] || it.previewUrl || (
                it.imageSource !== 'brand_material' ? it.image : null
            ) || null;
        });
        return map;
    }, [directResult, directPreviewBySku]);

    const evalColumns = useMemo(() => [
        {
            title: '',
            dataIndex: 'Tier',
            key: 'tierColor',
            width: 64,
            align: 'center',
            render: (tier) => {
                const text = String(tier || '').toLowerCase();
                let color = 'rgba(148,163,184,0.9)';
                if (text.startsWith('warning')) color = '#ef4444';
                else if (text.startsWith('daily')) color = '#22c55e';
                else if (text.startsWith('dd')) color = '#facc15';
                else if (text.startsWith('pd')) color = '#60a5fa';
                return (
                    <span
                        style={{
                            display: 'inline-block',
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: color,
                            boxShadow: `0 0 0 3px ${color}24`,
                            verticalAlign: 'middle',
                        }}
                    />
                );
            },
        },
        { title: 'Price Tier',    dataIndex: 'Tier',        key: 'Tier',  width: 160, onCell: r => copyableCellProps(r.Tier) },
        { title: `System Price (${currency})`, dataIndex: 'SystemPrice', key: 'sys',   width: 150, onCell: r => copyableCellProps(r.SystemPrice),
            render: v => (v === 'Invalid' || v === '' || v === null || v === undefined || isNaN(Number(v))) ? (v ?? '–') : formatPrice(v, currency) },
        { title: `Target Price (${currency})`, dataIndex: 'TargetPrice', key: 'tgt',   width: 150, onCell: r => copyableCellProps(r.TargetPrice),
            render: v => (v === 'Invalid' || v === '' || v === null || v === undefined || isNaN(Number(v))) ? (v ?? '–') : formatPrice(v, currency) },
        { title: 'Gap (Margin)', dataIndex: 'Gap',         key: 'gap',   width: 150, onCell: r => copyableCellProps(r.Gap),
            render: v => {
                if (v === 'Invalid') return <span style={{ color: 'var(--text-muted)' }}>–</span>;
                const n = Number(v);
                if (!Number.isFinite(n)) return <span style={{ color: 'var(--text-muted)' }}>–</span>;
                const formatted = formatPrice(Math.abs(n), currency);
                return <span style={{ fontWeight: 700, color: n >= 0 ? '#10b981' : '#ef4444' }}>{n >= 0 ? '+' : '-'}{formatted}</span>;
            }
        },
        { title: 'Status', dataIndex: 'Status', key: 'status', width: 110, onCell: r => copyableCellProps(r.Status),
            render: v => (
                <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                    fontSize: 12, fontWeight: 600,
                    background: v.includes('Safe') ? 'rgba(16,185,129,0.15)' : v.includes('Under') ? 'rgba(239,68,68,0.15)' : 'var(--bg-panel)',
                    color: v.includes('Safe') ? '#10b981' : v.includes('Under') ? '#ef4444' : 'var(--text-muted)',
                }}>{v}</span>
            ),
        },
    ], [currency]);

    const breakdownColumns = useMemo(() => {
        const contributionKey = `Total Contribution (${currency})`;
        const stockColumns = directStockTypes.map((st) => ({
            title: st,
            dataIndex: st,
            key: `bd_${st}`,
            width: 120,
            onCell: (r) => copyableCellProps(r[st]),
            render: (v) => Number(v || 0).toLocaleString(),
        }));
        return [
            {
                title: '',
                dataIndex: 'SKU',
                key: 'thumb',
                width: 74,
                align: 'center',
                fixed: 'left',
                onHeaderCell: () => ({
                    style: {
                        background: isDark ? '#111827' : '#f8fafc',
                    },
                }),
                onCell: () => ({
                    style: {
                        background: isDark ? '#111827' : '#f8fafc',
                    },
                }),
                render: (sku) => {
                    const key = String(sku || '').trim().toUpperCase();
                    const src = directItemPreviewBySku[key];
                    return (
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-panel)',
                                marginInline: 'auto',
                            }}
                        >
                            {src ? (
                                <img
                                    src={src}
                                    alt={sku}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                            ) : (
                                <span
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-muted)',
                                        fontSize: 9,
                                        fontWeight: 700,
                                    }}
                                >
                                    N/A
                                </span>
                            )}
                        </div>
                    );
                },
            },
            {
                title: 'SKU',
                dataIndex: 'SKU',
                key: 'SKU',
                width: 150,
                fixed: 'left',
                onHeaderCell: () => ({
                    style: {
                        background: isDark ? '#111827' : '#f8fafc',
                    },
                }),
                onCell: (r) => copyableCellProps(r['SKU'], {
                    background: isDark ? '#111827' : '#f8fafc',
                    fontWeight: 600,
                }),
            },
            { title: 'Product Name',      dataIndex: 'Product Name',         key: 'pn',   width: 240, onCell: r => copyableCellProps(r['Product Name']) },
            { title: `Base Price (${currency})`, dataIndex: 'Base Price (Warning)', key: 'bp', width: 150, onCell: r => copyableCellProps(r['Base Price (Warning)']),
                render: v => (v === 'Invalid' || v === '' || v === null || v === undefined || isNaN(Number(v))) ? (v ?? '–') : formatPrice(v, currency) },
            { title: 'Logic Applied',     dataIndex: 'Logic Applied',        key: 'la',   width: 180, onCell: r => copyableCellProps(r['Logic Applied']) },
            { title: `Contribution (${currency})`, dataIndex: contributionKey, key: 'con',  width: 170, onCell: r => copyableCellProps(r[contributionKey]),
                render: v => (v === 'Invalid' || v === '' || v === null || v === undefined || isNaN(Number(v))) ? (v ?? '–') : formatPrice(v, currency) },
            ...stockColumns,
        ];
    }, [currency, directStockTypes, isDark, directItemPreviewBySku]);

    const stockEvalColumns = [
        {
            title: '',
            dataIndex: 'StockType',
            key: 'stockColor',
            width: 64,
            align: 'center',
            render: (stockType) => {
                const text = String(stockType || '').toLowerCase();
                let color = 'rgba(148,163,184,0.9)';
                if (text.includes('ready')) color = '#22c55e';
                else if (text.includes('lock')) color = '#facc15';
                else if (text.includes('otw')) color = '#60a5fa';
                return (
                    <span
                        style={{
                            display: 'inline-block',
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: color,
                            boxShadow: `0 0 0 3px ${color}24`,
                            verticalAlign: 'middle',
                        }}
                    />
                );
            },
        },
        { title: 'Stock Type', dataIndex: 'StockType', key: 'StockType', width: 160 },
        { title: 'Current Stock', dataIndex: 'CurrentStock', key: 'CurrentStock', width: 130, render: v => Number(v || 0).toLocaleString() },
        { title: 'Target Stock', dataIndex: 'TargetStock', key: 'TargetStock', width: 130, render: v => Number(v || 0).toLocaleString() },
        {
            title: 'Gap',
            dataIndex: 'Gap',
            key: 'Gap',
            width: 130,
            render: v => {
                const n = Number(v || 0);
                const color = n > 0 ? '#10b981' : n === 0 ? '#faad14' : '#ef4444';
                return <span style={{ fontWeight: 700, color }}>{n.toLocaleString()}</span>;
            },
        },
        {
            title: 'Status',
            dataIndex: 'Status',
            key: 'Status',
            width: 110,
            render: (v, row) => (
                (() => {
                    const gap = Number(row?.Gap);
                    const isNoStockLeft = Number.isFinite(gap) && gap === 0;
                    const isSafe = Number.isFinite(gap) ? gap > 0 : String(v || '').includes('Safe');
                    const label = isNoStockLeft ? '⚠️ No Stock Left' : (isSafe ? '✅ Safe' : '❌ Need Restock');
                    const bg = isSafe
                        ? 'rgba(16,185,129,0.15)'
                        : isNoStockLeft
                            ? 'rgba(250,173,20,0.18)'
                            : 'rgba(239,68,68,0.15)';
                    const fg = isSafe
                        ? '#10b981'
                        : isNoStockLeft
                            ? '#faad14'
                            : '#ef4444';
                    return (
                <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: bg,
                    color: fg,
                }}>{label}</span>
                    );
                })()
            ),
        },
    ];

    const previewColumns = batchOverview?.preview?.length
        ? Object.keys(batchOverview.preview[0]).map(k => ({
            title: k, dataIndex: k, key: k, width: 160, ellipsis: true,
            render: (v) => {
                if (k === 'Gap Warning') {
                    if (v === 'Invalid') return <Text style={{ color: '#ef4444', fontWeight: 600 }}>Invalid</Text>;
                    const n = Number(v);
                    if (!isNaN(n)) return <Text style={{ color: n >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{n >= 0 ? '+' : ''}{n.toLocaleString()}</Text>;
                }
                return v ?? '–';
            },
          }))
        : [];

    const foldLabelStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '9px 12px',
        background: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(248,250,252,0.95)',
        fontWeight: 700,
        color: 'var(--text-main)',
        cursor: 'pointer',
        transition: 'all 160ms ease',
    };

    /* ─── RENDER ─── */
    return (
        <div>
            <PageHeader
                title={<Bi i18nKey="priceChecker.title" />}
                subtitle={<Bi i18nKey="priceChecker.subtitle" />}
                accent="var(--indigo)"
                actions={
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Segmented
                                value={currency}
                                onChange={handleCurrencyChange}
                                size="middle"
                                options={SUPPORTED_CURRENCIES.map((code) => {
                                    const meta = CURRENCY_META[code];
                                    const isActive = currency === code;
                                    return {
                                        value: code,
                                        label: (
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    fontWeight: isActive ? 800 : 600,
                                                    fontSize: 13,
                                                    paddingInline: 2,
                                                    opacity: isActive ? 1 : 0.55,
                                                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                                                    transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                                    transition: 'all 180ms ease',
                                                }}
                                            >
                                                <FlagIcon code={meta.countryCode} width={22} />
                                                {code}
                                            </span>
                                        ),
                                    };
                                })}
                                style={{
                                    height: 38,
                                    borderRadius: 10,
                                    padding: 3,
                                    background: isDark ? 'rgba(15,23,42,0.75)' : 'rgba(148,163,184,0.2)',
                                    border: '1px solid var(--border)',
                                }}
                            />
                            <Upload
                                accept=".xlsx,.xls"
                                showUploadList={false}
                                customRequest={uploadStockData}
                            >
                                <Button
                                    icon={<UploadOutlined />}
                                    loading={loadingDb}
                                    style={{ height: 36, borderRadius: 8, fontWeight: 600, fontSize: 13 }}
                                >
                                    <Bi i18nKey="priceChecker.uploadStock" />
                                </Button>
                            </Upload>
                            <Button
                                icon={<DatabaseOutlined />}
                                onClick={syncNeonData}
                                loading={loadingDb}
                                style={{
                                    height: 36, borderRadius: 8, fontWeight: 600, fontSize: 13,
                                    background: 'var(--indigo)', color: '#fff', border: 'none',
                                    boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                                }}
                            >
                                <Bi i18nKey="priceChecker.syncPrice" />
                            </Button>
                        </div>
                        <div style={{ textAlign: 'right', maxWidth: 420 }}>
                            <Text style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block' }}>
                                {t('priceChecker.lastStockUpload', { time: formatWibDateTime(lastStockUploadAt) })}
                            </Text>
                        </div>
                    </div>
                }
            />

            {/* MODE SWITCH + EXPORT */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div
                    style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        padding: 6,
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: isDark ? 'rgba(15,23,42,0.7)' : 'rgba(148,163,184,0.12)',
                        overflow: 'hidden',
                        width: 330,
                        maxWidth: '100%',
                    }}
                >
                    <span
                        style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            width: 'calc(50% - 10px)',
                            height: 'calc(100% - 12px)',
                            borderRadius: 9,
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            boxShadow: '0 8px 18px rgba(79,70,229,0.35)',
                            transform: inputMode === 'Batch' ? 'translateX(0)' : 'translateX(calc(100% + 8px))',
                            transition: 'transform 220ms ease',
                            pointerEvents: 'none',
                        }}
                    />
                    <Button
                        type="text"
                        onClick={() => {
                            setInputMode('Batch');
                            setFileList([]);
                            setDirectResult(null);
                            setBatchOverview(null);
                        }}
                        style={{
                            height: 38,
                            borderRadius: 9,
                            fontWeight: 700,
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            position: 'relative',
                            zIndex: 1,
                            color: inputMode === 'Batch' ? '#fff' : 'var(--text-main)',
                            background: 'transparent',
                            transition: 'color 180ms ease',
                        }}
                    >
                        <UnorderedListOutlined />
                        <Bi i18nKey="priceChecker.batchInput" />
                    </Button>
                    <Button
                        type="text"
                        onClick={() => {
                            setInputMode('Direct');
                            setFileList([]);
                            setDirectResult(null);
                            setBatchOverview(null);
                        }}
                        style={{
                            height: 38,
                            borderRadius: 9,
                            fontWeight: 700,
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            position: 'relative',
                            zIndex: 1,
                            color: inputMode === 'Direct' ? '#fff' : 'var(--text-main)',
                            background: 'transparent',
                            transition: 'color 180ms ease',
                        }}
                    >
                        <ThunderboltOutlined />
                        <Bi i18nKey="priceChecker.directInput" />
                    </Button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                <Dropdown
                    menu={{
                        items: [
                            { key: 'plain', label: t('priceChecker.exportWithoutImage'), onClick: () => handleExportData(false) },
                            { key: 'img', label: t('priceChecker.exportWithImage'), onClick: () => handleExportData(true) },
                        ],
                    }}
                    trigger={['click']}
                >
                    <Button
                        icon={<DownloadOutlined />}
                        loading={exportLoading}
                        style={{
                            height: 38,
                            minWidth: 170,
                            borderRadius: 10,
                            fontWeight: 700,
                            fontSize: 13,
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#fff',
                            border: '1px solid rgba(99,102,241,0.45)',
                            boxShadow: '0 4px 10px rgba(79,70,229,0.24)',
                        }}
                    >
                        {t('priceChecker.exportData')} <DownOutlined style={{ fontSize: 11 }} />
                    </Button>
                </Dropdown>
                </div>
            </div>

            {/* ─── BATCH METHODS ─── */}
            {inputMode === 'Batch' && (
                <div>
                    <div style={{ marginBottom: 18 }}>
                        <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>
                            <Bi i18nKey="priceChecker.batchMethod" />
                        </Text>
                        <div
                            style={{
                                position: 'relative',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 8,
                                padding: 6,
                                borderRadius: 12,
                                border: '1px solid var(--border)',
                                background: isDark ? 'rgba(15,23,42,0.7)' : 'rgba(148,163,184,0.12)',
                                width: '100%',
                                overflow: 'hidden',
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    top: 6,
                                    left: 6,
                                    width: 'calc(50% - 10px)',
                                    height: 'calc(100% - 12px)',
                                    borderRadius: 9,
                                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                    boxShadow: '0 8px 18px rgba(79,70,229,0.35)',
                                    transform: method === 'Listing' ? 'translateX(0)' : 'translateX(calc(100% + 8px))',
                                    transition: 'transform 220ms ease',
                                    pointerEvents: 'none',
                                }}
                            />
                            <Button
                                type="text"
                                onClick={() => { setMethod('Listing'); setFileList([]); setBatchOverview(null); }}
                                style={{
                                    height: 44,
                                    borderRadius: 9,
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    position: 'relative',
                                    zIndex: 1,
                                    color: method === 'Listing' ? '#fff' : 'var(--text-main)',
                                    background: 'transparent',
                                    transition: 'color 180ms ease',
                                }}
                            >
                                <UnorderedListOutlined />
                                {t('priceChecker.listingMethod')}
                            </Button>
                            <Button
                                type="text"
                                onClick={() => { setMethod('SKU'); setFileList([]); setBatchOverview(null); }}
                                style={{
                                    height: 44,
                                    borderRadius: 9,
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    position: 'relative',
                                    zIndex: 1,
                                    color: method === 'SKU' ? '#fff' : 'var(--text-main)',
                                    background: 'transparent',
                                    transition: 'color 180ms ease',
                                }}
                            >
                                <BarcodeOutlined />
                                {t('priceChecker.skuMethod')}
                            </Button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, alignItems: 'stretch' }}>
                        <div style={stepCardStyle}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                <SectionHeading icon={<DownloadOutlined />}>Step 1 - <Bi i18nKey="priceChecker.downloadTemplate" /> <RightOutlined style={{ fontSize: 12, marginLeft: 2 }} /></SectionHeading>
                            </div>
                            <div style={{ padding: '18px 20px' }}>
                                <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 16 }}>
                                    <Bi i18nKey="priceChecker.downloadTemplateHint" />
                                </Text>
                                <Button
                                    icon={<CloudDownloadOutlined />}
                                    block
                                    onClick={() => downloadTemplate(method)}
                                    style={{
                                        height: 44, borderRadius: 8, fontWeight: 600, fontSize: 13,
                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                        color: '#fff',
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(79,70,229,0.35)',
                                    }}
                                >
                                    {t('priceChecker.downloadMethodTemplate', { method })}
                                </Button>
                            </div>
                        </div>

                        <div style={stepCardStyle}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                <SectionHeading icon={<UploadOutlined />}>Step 2 - <Bi i18nKey="priceChecker.uploadFile" /> <RightOutlined style={{ fontSize: 12, marginLeft: 2 }} /></SectionHeading>
                            </div>
                            <div style={{ padding: '18px 20px' }}>
                                <Dragger
                                    maxCount={1}
                                    beforeUpload={(file) => { setFileList([file]); return false; }}
                                    onRemove={() => setFileList([])}
                                    fileList={fileList}
                                    style={{ borderRadius: 8 }}
                                    itemRender={(_, file, __, { remove }) => (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', borderRadius: 6,
                                            padding: '8px 12px', marginTop: 8,
                                        }}>
                                            <Text style={{ color: '#10b981', fontSize: 13, fontWeight: 500 }}>
                                                <SyncOutlined style={{ color: '#10b981', marginRight: 6 }} />{file.name}
                                                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {file.size ? '(' + (file.size / 1024 / 1024 > 1 ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : (file.size / 1024).toFixed(2) + ' KB') + ')' : ''}
                                                </span>
                                            </Text>
                                            <Button
                                                type="text" size="small" danger
                                                onClick={remove}
                                                style={{ fontSize: 12, color: '#ef4444', padding: '0 4px' }}
                                            >
                                                <Bi i18nKey="priceChecker.remove" />
                                            </Button>
                                        </div>
                                    )}
                                >
                                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                    <p className="ant-upload-text"><Bi i18nKey="priceChecker.uploadExcelHint" /></p>
                                </Dragger>
                            </div>
                        </div>

                        <div style={stepCardStyle}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                <SectionHeading icon={<RiseOutlined />}>Step 3 - <Bi i18nKey="priceChecker.startCalculation" /></SectionHeading>
                            </div>
                            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Text style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    {fileList.length ? t('priceChecker.fileReady') : t('priceChecker.fileNotReady')}
                                </Text>
                                <Button
                                    block
                                    loading={calcLoading}
                                    disabled={!fileList.length}
                                    onClick={handleUpload}
                                    style={{
                                        height: 44, borderRadius: 8, fontWeight: 700, fontSize: 14,
                                        background: !fileList.length ? 'var(--bg-panel)' : 'var(--indigo)',
                                        color: !fileList.length ? 'var(--text-muted)' : '#fff',
                                        border: !fileList.length ? '1px solid var(--border)' : 'none',
                                        boxShadow: !fileList.length ? 'none' : '0 2px 8px rgba(99,102,241,0.25)',
                                    }}
                                >
                                    {calcLoading ? <Bi i18nKey="priceChecker.processing" /> : <Bi i18nKey="priceChecker.startBatch" />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ─── BATCH OVERVIEW ─── */}
                    {batchOverview && (
                        <div style={{ marginTop: 32 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />
                            <SectionHeading icon={<FileTextOutlined />}><Bi i18nKey="priceChecker.processingOverview" /></SectionHeading>

                            {/* Stats */}
                            <Row gutter={16} style={{ marginBottom: 24 }}>
                                <Col xs={24} md={8}>
                                    <div style={statCardStyle('var(--indigo)')}>
                                        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--indigo)', fontFamily: "'Outfit', sans-serif" }}>
                                            {batchOverview.summary.total}
                                        </div>
                                        <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}><Bi i18nKey="priceChecker.totalRows" /></Text>
                                    </div>
                                </Col>
                                <Col xs={24} md={8}>
                                    <div style={statCardStyle('#10b981')}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <CheckCircleFilled style={{ color: '#10b981', fontSize: 20 }} />
                                            <span style={{ fontSize: 40, fontWeight: 800, color: '#10b981', fontFamily: "'Outfit', sans-serif" }}>
                                                {batchOverview.summary.valid}
                                            </span>
                                        </div>
                                        <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}><Bi i18nKey="priceChecker.validItems" /></Text>
                                    </div>
                                </Col>
                                <Col xs={24} md={8}>
                                    <div style={statCardStyle('#ef4444')}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <CloseCircleFilled style={{ color: '#ef4444', fontSize: 20 }} />
                                            <span style={{ fontSize: 40, fontWeight: 800, color: '#ef4444', fontFamily: "'Outfit', sans-serif" }}>
                                                {batchOverview.summary.invalid}
                                            </span>
                                        </div>
                                        <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}><Bi i18nKey="priceChecker.invalidItems" /></Text>
                                    </div>
                                </Col>
                            </Row>

                            {/* Preview Table (scrollable) */}
                            <div style={{ marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <Bi i18nKey="priceChecker.dataPreview" />
                                </Text>
                            </div>
                            <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <Table
                                    dataSource={batchOverview.preview}
                                    columns={previewColumns}
                                    pagination={false}
                                    size="small"
                                    rowKey={(_, i) => i}
                                    scroll={{ x: 'max-content' }}
                                    className="price-checker-center-table"
                                />
                            </div>

                            {/* Download */}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <Button
                                    size="large"
                                    icon={<FileExcelOutlined />}
                                    onClick={handleDownloadResult}
                                    style={{
                                        height: 46, borderRadius: 8, fontWeight: 700, fontSize: 14,
                                        background: '#10b981', color: '#fff', border: 'none',
                                        boxShadow: '0 2px 10px rgba(16,185,129,0.3)', paddingInline: 28,
                                    }}
                                >
                                    <Bi i18nKey="priceChecker.downloadFull" />
                                </Button>
                                <Button
                                    size="large"
                                    icon={<FileExcelOutlined />}
                                    loading={downloadingWithPicture}
                                    onClick={handleDownloadWithPicture}
                                    style={{
                                        height: 46, borderRadius: 8, fontWeight: 700, fontSize: 14,
                                        background: '#f59e0b', color: '#fff', border: 'none',
                                        boxShadow: '0 2px 10px rgba(245,158,11,0.35)', paddingInline: 28,
                                    }}
                                >
                                    <Bi i18nKey="priceChecker.downloadWithPic" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── DIRECT INPUT ─── */}
            {inputMode === 'Direct' && (
                <div style={{
                    background: isDark
                        ? 'linear-gradient(145deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.98) 100%)'
                        : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                    borderRadius: 16,
                    border: isDark ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(99,102,241,0.2)',
                    padding: '24px',
                    boxShadow: isDark
                        ? '0 10px 30px rgba(2, 6, 23, 0.45)'
                        : '0 10px 30px rgba(15, 23, 42, 0.08)',
                }}>
                    <div style={{ marginBottom: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                            <Bi i18nKey="priceChecker.directInput" />
                        </Text>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 14,
                        alignItems: 'end',
                    }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <Label><Bi i18nKey="priceChecker.bundleSku" /></Label>
                            <Input
                                size="large"
                                placeholder="e.g. SKU_A + SKU_B or SKU_A SKU_B"
                                value={skuInput}
                                onChange={e => setSkuInput(e.target.value)}
                                onPressEnter={doCalculateDirect}
                                style={{ borderRadius: 10, height: 40, borderWidth: 1.5 }}
                            />
                        </div>
                        <div>
                            <Label><Bi i18nKey="priceChecker.targetPrice" /></Label>
                            <InputNumber
                                className="pc-clean-number"
                                size="large"
                                style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }}
                                controls={false}
                                placeholder={`Enter target price (${currencyMeta.short})`}
                                min={0}
                                step={currency === 'MYR' ? 1 : 1000}
                                value={targetPrice}
                                onChange={setTargetPrice}
                                onFocus={() => { if (targetPrice === 0) setTargetPrice(null); }}
                                formatter={(v) => (v === null || v === undefined || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}
                                parser={(v) => (v ? v.replace(/\./g, '') : '')}
                            />
                        </div>
                        <div>
                            <Label><Bi i18nKey="priceChecker.targetStock" /></Label>
                            <InputNumber
                                className="pc-clean-number"
                                size="large"
                                style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }}
                                controls={false}
                                placeholder="Enter target stock"
                                min={0}
                                step={1}
                                value={targetStock}
                                onChange={setTargetStock}
                                onFocus={() => { if (targetStock === 0) setTargetStock(null); }}
                            />
                        </div>
                    </div>

                    <Button
                        className="pc-live-cta"
                        size="large"
                        icon={<ThunderboltOutlined />}
                        loading={calcLoading}
                        onClick={doCalculateDirect}
                        style={{
                            marginTop: 18, height: 42, borderRadius: 9, fontWeight: 700, fontSize: 13,
                            color: '#fff', border: '1px solid rgba(99,102,241,0.42)', paddingInline: 26,
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            boxShadow: '0 3px 8px rgba(79,70,229,0.2)',
                        }}
                    >
                        <Bi i18nKey="priceChecker.calculate" />
                    </Button>

                    {calcLoading && (
                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}><Bi i18nKey="priceChecker.calculating" /></div>
                        </div>
                    )}

                    {directResult && !calcLoading && (
                        <div style={{ marginTop: 28 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />

                            {/* Summary */}
                            <SectionHeading icon={<BarChartOutlined />}>Summary</SectionHeading>
                            <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                                {(() => {
                                    const giftRate = Number(directResult.summary.gift_discount || 0);
                                    const giftValue = giftRate > 0
                                        ? `${Math.round(giftRate * 100)}%`
                                        : (directResult.summary.gift || '-');
                                    const warningFromSummary = directResult.summary.warning_price;
                                    const warningFromEvaluation = directResult.evaluation?.find((row) => row?.Tier === 'Warning')?.SystemPrice;
                                    const warningRaw = warningFromSummary ?? warningFromEvaluation;
                                    const warningNumeric = Number(warningRaw);
                                    const warningValue = Number.isFinite(warningNumeric)
                                        ? formatPrice(warningNumeric, currency)
                                        : (warningRaw && warningRaw !== 'Invalid' ? String(warningRaw) : '-');
                                    const availableRaw = directResult.summary.available_stock || 'No Stock';
                                    const availableMatch = String(availableRaw).match(/^(\d+)\s*\(([^)]+)\)/);
                                    const availableValue = availableMatch
                                        ? `${Number(availableMatch[1]).toLocaleString()} • ${availableMatch[2]}`
                                        : availableRaw;
                                    return [
                                        { label: `Warning Price (${currency})`, value: warningValue, color: '#8b5cf6', compact: false, md: 7 },
                                        { label: 'Available Stock', value: availableValue, color: '#06b6d4', compact: false, md: 7 },
                                        { label: 'Bundle Discount', value: `${Number(directResult.summary.bundle_discount) * 100}%`, color: 'var(--indigo)', compact: true, md: 3 },
                                        { label: 'Clearance Status', value: directResult.summary.clearance, color: '#f59e0b', compact: true, md: 3 },
                                        { label: 'Gift Status', value: giftValue, color: '#10b981', compact: true, md: 4 },
                                    ];
                                })().map(({ label, value, color, compact, md }) => (
                                    <Col key={label} xs={24} sm={12} md={md}>
                                        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 10, padding: compact ? '12px 10px' : '14px 12px', textAlign: 'center', height: '100%' }}>
                                            <div style={{ fontSize: compact ? 20 : 24, fontWeight: 800, color, fontFamily: "'Outfit', sans-serif", lineHeight: 1.15, wordBreak: 'break-word' }}>{value}</div>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
                                        </div>
                                    </Col>
                                ))}
                            </Row>

                            {/* SKU Preview */}
                            {directResult.items?.length > 0 && (
                                <div style={{ marginBottom: 28 }}>
                                    <SectionHeading icon={<AppstoreOutlined />}>Preview</SectionHeading>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 160px))',
                                            justifyContent: 'start',
                                            gap: 10,
                                        }}
                                    >
                                        {directResult.items.map((item, idx) => (
                                            <div
                                                key={`${item.sku}-${idx}`}
                                                style={{
                                                    background: isDark
                                                        ? 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(2,6,23,0.98) 100%)'
                                                        : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                                                    border: isDark ? '1px solid rgba(99,102,241,0.24)' : '1px solid rgba(99,102,241,0.18)',
                                                    borderRadius: 14,
                                                    overflow: 'hidden',
                                                    minHeight: 220,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    boxShadow: isDark
                                                        ? '0 10px 24px rgba(2,6,23,0.4)'
                                                        : '0 10px 24px rgba(15,23,42,0.08)',
                                                }}
                                            >
                                                <div style={{
                                                    padding: 8,
                                                    background: isDark
                                                        ? 'linear-gradient(180deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.8) 100%)'
                                                        : 'linear-gradient(180deg, #eef2ff 0%, #e2e8f0 100%)',
                                                    borderBottom: '1px solid var(--border)',
                                                }}>
                                                    <div style={{
                                                        width: '100%',
                                                        aspectRatio: '1 / 1',
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        borderRadius: 10,
                                                        background: isDark ? '#111827' : '#ffffff',
                                                        border: isDark ? '1px solid #374151' : '1px solid #cbd5e1',
                                                        boxShadow: isDark ? 'inset 0 0 0 1px rgba(255,255,255,0.02), 0 6px 14px rgba(0,0,0,0.3)' : '0 6px 14px rgba(15,23,42,0.1)',
                                                    }}>
                                                        <DirectSkuPhoto item={item} previewSrc={directPreviewBySku[item.sku]} noImageLabel={t('priceChecker.noImage')} />
                                                    </div>
                                                </div>
                                                <div style={{ padding: '8px 10px 10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                                                    <div>
                                                        <Text strong style={{ display: 'block', marginBottom: 2, fontSize: 11.5, wordBreak: 'break-all', letterSpacing: '0.2px' }}>{item.sku}</Text>
                                                        <Text type="secondary" style={{ display: 'block', fontSize: 10.5, lineHeight: 1.25 }}>{item.name || '-'}</Text>
                                                    </div>
                                                    {item.link ? (
                                                        <a
                                                            href={item.link}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            style={{
                                                                fontSize: 10,
                                                                color: 'var(--indigo)',
                                                                fontWeight: 600,
                                                                background: isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.12)',
                                                                border: '1px solid rgba(99,102,241,0.35)',
                                                                borderRadius: 6,
                                                                padding: '4px 7px',
                                                                width: 'fit-content',
                                                                textDecoration: 'none',
                                                            }}
                                                        >
                                                            <LinkOutlined style={{ marginRight: 6 }} />
                                                            Image
                                                        </a>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: 20 }}>
                                <Collapse
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                    }}
                                    expandIconPosition="end"
                                    expandIcon={({ isActive }) => (
                                        <RightOutlined
                                            style={{
                                                fontSize: 12,
                                                color: 'var(--text-muted)',
                                                transform: isActive ? 'rotate(90deg)' : 'rotate(0deg)',
                                                transition: 'transform 180ms ease',
                                            }}
                                        />
                                    )}
                                    items={[
                                        {
                                            key: 'breakdown',
                                            label: (
                                                <div style={foldLabelStyle}>
                                                    <AppstoreOutlined style={{ color: 'var(--indigo)' }} />
                                                    Composition
                                                </div>
                                            ),
                                            extra: (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<FileTextOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyTable(directResult.breakdown, breakdownColumns);
                                                    }}
                                                    style={{
                                                        fontSize: 11,
                                                        height: 30,
                                                        borderRadius: 8,
                                                        paddingInline: 8,
                                                        color: 'var(--text-muted)',
                                                    }}
                                                >
                                                    Copy
                                                </Button>
                                            ),
                                            children: (
                                                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
                                                    <Table
                                                        dataSource={directResult.breakdown}
                                                        columns={breakdownColumns}
                                                        pagination={false}
                                                        size="middle"
                                                        rowKey="SKU"
                                                        scroll={{ x: 'max-content' }}
                                                        className="copyable-table price-checker-center-table"
                                                    />
                                                </div>
                                            ),
                                        },
                                        {
                                            key: 'evaluation',
                                            label: (
                                                <div style={foldLabelStyle}>
                                                    <RiseOutlined style={{ color: 'var(--indigo)' }} />
                                                    Price Tier
                                                </div>
                                            ),
                                            extra: (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<FileTextOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyTable(directResult.evaluation, evalColumns);
                                                    }}
                                                    style={{
                                                        fontSize: 11,
                                                        height: 30,
                                                        borderRadius: 8,
                                                        paddingInline: 8,
                                                        color: 'var(--text-muted)',
                                                    }}
                                                >
                                                    Copy
                                                </Button>
                                            ),
                                            children: (
                                                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
                                                    <Table
                                                        dataSource={directResult.evaluation}
                                                        columns={evalColumns}
                                                        pagination={false}
                                                        size="middle"
                                                        rowKey="Tier"
                                                        scroll={{ x: 660 }}
                                                        className="copyable-table price-checker-center-table"
                                                    />
                                                </div>
                                            ),
                                        },
                                        {
                                            key: 'stock-evaluation',
                                            label: (
                                                <div style={foldLabelStyle}>
                                                    <BarChartOutlined style={{ color: 'var(--indigo)' }} />
                                                    Stock Tier
                                                </div>
                                            ),
                                            extra: (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<FileTextOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyTable(directResult.stock_evaluation || [], stockEvalColumns);
                                                    }}
                                                    style={{
                                                        fontSize: 11,
                                                        height: 30,
                                                        borderRadius: 8,
                                                        paddingInline: 8,
                                                        color: 'var(--text-muted)',
                                                    }}
                                                >
                                                    Copy
                                                </Button>
                                            ),
                                            children: (
                                                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                    <Table
                                                        dataSource={directResult.stock_evaluation || []}
                                                        columns={stockEvalColumns}
                                                        pagination={false}
                                                        size="middle"
                                                        rowKey="StockType"
                                                        scroll={{ x: 660 }}
                                                        className="price-checker-center-table"
                                                    />
                                                </div>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PriceChecker;
