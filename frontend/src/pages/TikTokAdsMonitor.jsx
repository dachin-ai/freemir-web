import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Button, Card, Checkbox, Collapse, DatePicker, Input, Modal, Space, Spin, Table, Tag, Typography, Upload, message,
} from 'antd';
import AdsMonitorStoreSelect from '../components/social/AdsMonitorStoreSelect';
import {
    CalendarOutlined, CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, DownloadOutlined, FileExcelOutlined, InboxOutlined, LoadingOutlined, SettingOutlined, TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import api from '../api';
import PageHeader from '../components/PageHeader';
import AdsMonitorManualImport from '../components/social/AdsMonitorManualImport';
import AdsMonitorMonthlyGrid from '../components/social/AdsMonitorMonthlyGrid';
import { exportMonthlyReportXlsx } from '../utils/adsMonitorReport';
import './ads-monitor.css';

const { Text } = Typography;

const BUCKET_KEYS = ['product_card', 'internal_creator', 'external_creator'];
const UPLOAD_STORE_LS_KEY = 'ads_monitor_upload_store_code';
const REPORT_STORE_LS_KEY = 'ads_monitor_report_store_code';
const MONTH_LS_KEY = 'ads_monitor_report_month';
const DELETE_MONTH_PHRASE = 'delete whole month';

function fmtIdr(value) {
    const n = Number(value || 0);
    return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

function fmtRoi(value) {
    const n = Number(value || 0);
    return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function extractDateFromFilename(name) {
    const matches = (name || '').match(/\d{4}-\d{2}-\d{2}/g);
    return matches?.length ? matches[matches.length - 1] : null;
}

const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
});

export default function TikTokAdsMonitor() {
    const { t, i18n } = useTranslation();
    const [fileList, setFileList] = useState([]);
    const [dataDate, setDataDate] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [internalCreators, setInternalCreators] = useState([]);
    const [creatorModalOpen, setCreatorModalOpen] = useState(false);
    const [creatorSearch, setCreatorSearch] = useState('');
    const [discoveredAccounts, setDiscoveredAccounts] = useState([]);
    const [creatorDraft, setCreatorDraft] = useState([]);
    const [savingCreators, setSavingCreators] = useState(false);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [stores, setStores] = useState([]);
    const [storesLoading, setStoresLoading] = useState(false);
    const [storesError, setStoresError] = useState(null);
    const [storesWarning, setStoresWarning] = useState(null);
    const [uploadStoreCode, setUploadStoreCode] = useState(() => localStorage.getItem(UPLOAD_STORE_LS_KEY) || null);
    const [reportStoreCode, setReportStoreCode] = useState(() => localStorage.getItem(REPORT_STORE_LS_KEY) || null);
    const [reportMonth, setReportMonth] = useState(() => {
        const saved = localStorage.getItem(MONTH_LS_KEY);
        return saved ? dayjs(`${saved}-01`) : dayjs();
    });
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [reportError, setReportError] = useState(null);
    const [resultExpanded, setResultExpanded] = useState(true);
    const [internalListExpanded, setInternalListExpanded] = useState(false);
    const [importExpanded, setImportExpanded] = useState(false);
    const [deleteMonthOpen, setDeleteMonthOpen] = useState(false);
    const [deleteMonthPhrase, setDeleteMonthPhrase] = useState('');
    const [deletingMonth, setDeletingMonth] = useState(false);
    const [deletingDate, setDeletingDate] = useState(null);

    const handleExportReport = () => {
        if (!monthlyReport?.filledDays) {
            message.warning(t('adsMonitor.report.noDataMonth'));
            return;
        }
        const ok = exportMonthlyReportXlsx(monthlyReport, t, i18n.language);
        if (ok) {
            message.success(t('adsMonitor.export.done'));
        }
    };

    const handleImportSaved = (importDate, importStoreCode) => {
        if (importStoreCode && importStoreCode !== reportStoreCode) {
            handleReportStoreChange(importStoreCode);
        }
        if (!importDate) {
            loadMonthlyReport();
            return;
        }
        const month = importDate.startOf('month');
        const sameMonth = reportMonth.format('YYYY-MM') === month.format('YYYY-MM');
        setReportMonth(month);
        localStorage.setItem(MONTH_LS_KEY, month.format('YYYY-MM'));
        if (sameMonth) {
            loadMonthlyReport();
        }
    };

    const loadStores = useCallback(async (refresh = false) => {
        setStoresLoading(true);
        setStoresError(null);
        setStoresWarning(null);
        try {
            const { data } = await api.get('/ads-monitor/stores', {
                params: refresh ? { refresh: true } : {},
            });
            const list = data.stores || [];
            setStores(list);
            if (data.warning) {
                setStoresWarning(data.warning);
            }
            if (!list.length) {
                setStoresError(data.warning || t('adsMonitor.stores.empty'));
            }
        } catch (err) {
            const status = err.response?.status;
            const detail = err.response?.data?.detail || err.response?.data?.warning;
            if (status === 403) {
                setStoresError(t('adsMonitor.stores.forbidden'));
            } else if (status === 401) {
                setStoresError(t('adsMonitor.stores.unauthorized'));
            } else {
                setStoresError(detail || t('adsMonitor.stores.loadFail'));
            }
            setStores([]);
        } finally {
            setStoresLoading(false);
        }
    }, [t]);

    const retryStores = useCallback(() => loadStores(true), [loadStores]);

    const loadMonthlyReport = useCallback(async () => {
        if (!reportStoreCode) {
            setMonthlyReport(null);
            setReportError(null);
            return;
        }
        setLoadingReport(true);
        setReportError(null);
        try {
            const { data } = await api.get('/ads-monitor/monthly-report', {
                params: {
                    store_code: reportStoreCode,
                    year: reportMonth.year(),
                    month: reportMonth.month() + 1,
                },
            });
            setMonthlyReport(data);
        } catch (err) {
            setMonthlyReport(null);
            setReportError(err.response?.data?.detail || t('adsMonitor.report.loadFail'));
        } finally {
            setLoadingReport(false);
        }
    }, [reportStoreCode, reportMonth, t]);

    const handleDeleteDay = async (dataDate) => {
        if (!reportStoreCode || !dataDate) return;
        setDeletingDate(dataDate);
        try {
            const { data } = await api.delete('/ads-monitor/daily-record', {
                params: { store_code: reportStoreCode, data_date: dataDate },
            });
            if (data.deleted) {
                message.success(t('adsMonitor.delete.dayDone'));
            } else {
                message.warning(t('adsMonitor.delete.dayMissing'));
            }
            loadMonthlyReport();
        } catch (err) {
            message.error(err.response?.data?.detail || t('adsMonitor.delete.dayFail'));
        } finally {
            setDeletingDate(null);
        }
    };

    const handleDeleteMonth = async () => {
        if (!reportStoreCode) return;
        if (deleteMonthPhrase.trim() !== DELETE_MONTH_PHRASE) {
            message.warning(t('adsMonitor.delete.monthPhraseMismatch'));
            return;
        }
        setDeletingMonth(true);
        try {
            const { data } = await api.delete('/ads-monitor/month-records', {
                params: {
                    store_code: reportStoreCode,
                    year: reportMonth.year(),
                    month: reportMonth.month() + 1,
                },
            });
            message.success(t('adsMonitor.delete.monthDone', { count: data.deleted }));
            setDeleteMonthOpen(false);
            setDeleteMonthPhrase('');
            loadMonthlyReport();
        } catch (err) {
            message.error(err.response?.data?.detail || t('adsMonitor.delete.monthFail'));
        } finally {
            setDeletingMonth(false);
        }
    };

    const handleUploadStoreChange = useCallback((code) => {
        setUploadStoreCode(code || null);
        if (code) {
            localStorage.setItem(UPLOAD_STORE_LS_KEY, code);
        } else {
            localStorage.removeItem(UPLOAD_STORE_LS_KEY);
        }
    }, []);

    const handleReportStoreChange = useCallback((code) => {
        setReportStoreCode(code || null);
        if (code) {
            localStorage.setItem(REPORT_STORE_LS_KEY, code);
        } else {
            localStorage.removeItem(REPORT_STORE_LS_KEY);
        }
    }, []);

    const handleReportMonthChange = useCallback((value) => {
        if (!value) return;
        setReportMonth(value);
        localStorage.setItem(MONTH_LS_KEY, value.format('YYYY-MM'));
    }, []);

    const loadInternalCreators = useCallback(async () => {
        try {
            const { data } = await api.get('/ads-monitor/internal-creators');
            setInternalCreators(data.accounts || []);
        } catch {
            setInternalCreators([]);
        }
    }, []);

    const loadDiscoveredAccounts = useCallback(async (q = '') => {
        setLoadingAccounts(true);
        try {
            const { data } = await api.get('/ads-monitor/discovered-accounts', {
                params: { q, limit: 1000 },
            });
            setDiscoveredAccounts(data.accounts || []);
        } catch {
            setDiscoveredAccounts([]);
        } finally {
            setLoadingAccounts(false);
        }
    }, []);

    useEffect(() => {
        const legacyStore = localStorage.getItem('ads_monitor_store_code');
        if (legacyStore) {
            if (!localStorage.getItem(UPLOAD_STORE_LS_KEY)) {
                localStorage.setItem(UPLOAD_STORE_LS_KEY, legacyStore);
                setUploadStoreCode(legacyStore);
            }
            if (!localStorage.getItem(REPORT_STORE_LS_KEY)) {
                localStorage.setItem(REPORT_STORE_LS_KEY, legacyStore);
                setReportStoreCode(legacyStore);
            }
            localStorage.removeItem('ads_monitor_store_code');
        }
        loadInternalCreators();
        loadStores();
    }, [loadInternalCreators, loadStores]);

    useEffect(() => {
        if (!stores.length) return;
        if (uploadStoreCode && !stores.some((s) => s.code === uploadStoreCode)) {
            handleUploadStoreChange(null);
        }
        if (reportStoreCode && !stores.some((s) => s.code === reportStoreCode)) {
            handleReportStoreChange(null);
        }
    }, [stores, uploadStoreCode, reportStoreCode, handleUploadStoreChange, handleReportStoreChange]);

    useEffect(() => {
        loadMonthlyReport();
    }, [loadMonthlyReport]);

    const openCreatorModal = () => {
        setCreatorDraft([...internalCreators]);
        setCreatorSearch('');
        loadDiscoveredAccounts('');
        setCreatorModalOpen(true);
    };

    const mergedAccountOptions = useMemo(() => {
        const set = new Set([...discoveredAccounts, ...creatorDraft, ...internalCreators]);
        return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [discoveredAccounts, creatorDraft, internalCreators]);

    const filteredAccountOptions = useMemo(() => {
        const q = creatorSearch.trim().toLowerCase();
        if (!q) return mergedAccountOptions;
        return mergedAccountOptions.filter((name) => name.toLowerCase().includes(q));
    }, [mergedAccountOptions, creatorSearch]);

    const handleAnalyze = async () => {
        if (!fileList.length) {
            message.warning(t('adsMonitor.uploadWarn'));
            return;
        }
        if (!dataDate) {
            message.warning(t('adsMonitor.dataDateRequired'));
            return;
        }
        if (!uploadStoreCode) {
            message.warning(t('adsMonitor.storeRequired'));
            return;
        }
        const file = fileList[0].originFileObj || fileList[0];
        setLoading(true);
        setResult(null);
        setResultExpanded(true);
        try {
            const content_b64 = await getBase64(file);
            const { data } = await api.post('/ads-monitor/analyze', {
                filename: file.name,
                content_b64,
                data_date: dataDate.format('YYYY-MM-DD'),
                store_code: uploadStoreCode,
            });
            setResult(data);
            setInternalCreators(data.internalCreators || []);
            const month = dataDate.startOf('month');
            setReportMonth(month);
            localStorage.setItem(MONTH_LS_KEY, month.format('YYYY-MM'));
            if (data.storeCode) {
                handleReportStoreChange(data.storeCode);
            }
            message.success(t('adsMonitor.analyzeDone'));
            loadDiscoveredAccounts('');
        } catch (err) {
            message.error(err.response?.data?.detail || t('adsMonitor.analyzeFail'));
        } finally {
            setLoading(false);
        }
    };

    const toggleCreator = (name, checked) => {
        setCreatorDraft((prev) => {
            if (checked) return prev.includes(name) ? prev : [...prev, name];
            return prev.filter((x) => x !== name);
        });
    };

    const saveCreators = async () => {
        setSavingCreators(true);
        try {
            const { data } = await api.put('/ads-monitor/internal-creators', {
                accounts: creatorDraft,
            });
            setInternalCreators(data.accounts || []);
            setCreatorModalOpen(false);
            message.success(t('adsMonitor.creatorsSaved'));
            if (result) {
                message.info(t('adsMonitor.reanalyzeHint'));
            }
        } catch (err) {
            message.error(err.response?.data?.detail || t('adsMonitor.creatorsSaveFail'));
        } finally {
            setSavingCreators(false);
        }
    };

    const resultRows = useMemo(() => {
        if (!result?.buckets) return [];
        const rows = BUCKET_KEYS.map((key) => ({
            key,
            bucket: t(`adsMonitor.bucket.${key}`),
            ...result.buckets[key],
        }));
        if (result.total) {
            rows.push({
                key: 'total',
                bucket: t('adsMonitor.bucket.total'),
                ...result.total,
                isTotal: true,
            });
        }
        return rows;
    }, [result, t]);

    const internalBreakdownRows = useMemo(() => (
        (result?.internalCreatorBreakdown || []).map((row) => ({
            key: row.account,
            ...row,
        }))
    ), [result]);

    const internalColumns = [
        {
            title: t('adsMonitor.colAccount'),
            dataIndex: 'account',
            key: 'account',
        },
        {
            title: t('adsMonitor.colCost'),
            dataIndex: 'cost',
            key: 'cost',
            align: 'right',
            render: (v) => fmtIdr(v),
        },
        {
            title: t('adsMonitor.colGross'),
            dataIndex: 'grossRevenue',
            key: 'grossRevenue',
            align: 'right',
            render: (v) => fmtIdr(v),
        },
        {
            title: t('adsMonitor.colRoi'),
            dataIndex: 'roi',
            key: 'roi',
            align: 'right',
            render: (v) => fmtRoi(v),
        },
        {
            title: t('adsMonitor.colRows'),
            dataIndex: 'rowCount',
            key: 'rowCount',
            align: 'right',
        },
    ];

    const columns = [
        {
            title: t('adsMonitor.colBucket'),
            dataIndex: 'bucket',
            key: 'bucket',
            render: (text, row) => (
                <Text strong={row.isTotal}>{text}</Text>
            ),
        },
        {
            title: t('adsMonitor.colCost'),
            dataIndex: 'cost',
            key: 'cost',
            align: 'right',
            render: (v) => fmtIdr(v),
        },
        {
            title: t('adsMonitor.colGross'),
            dataIndex: 'grossRevenue',
            key: 'grossRevenue',
            align: 'right',
            render: (v) => fmtIdr(v),
        },
        {
            title: t('adsMonitor.colRoi'),
            dataIndex: 'roi',
            key: 'roi',
            align: 'right',
            render: (v) => fmtRoi(v),
        },
        {
            title: t('adsMonitor.colRows'),
            dataIndex: 'rowCount',
            key: 'rowCount',
            align: 'right',
        },
    ];

    return (
        <div>
            <PageHeader
                title={t('adsMonitor.title')}
                subtitle={t('adsMonitor.subtitle')}
                accent="#ec4899"
                actions={(
                    <Button icon={<TeamOutlined />} onClick={openCreatorModal}>
                        {t('adsMonitor.internalCreatorsBtn')}
                    </Button>
                )}
            />

            {storesError && (
                <Alert
                    className="ads-monitor-stores-alert"
                    type="error"
                    showIcon
                    message={t('adsMonitor.stores.alertTitle')}
                    description={storesError}
                    action={(
                        <Button size="small" loading={storesLoading} onClick={retryStores}>
                            {t('adsMonitor.stores.retry')}
                        </Button>
                    )}
                />
            )}

            <Card
                className="ads-monitor-toolbar-card"
                styles={{ body: { padding: '12px 14px' } }}
            >
                <div className="ads-monitor-toolbar">
                    <label className="ads-monitor-toolbar-field">
                        <span className="ads-monitor-field-label">{t('adsMonitor.storeLabel')}</span>
                        <AdsMonitorStoreSelect
                            value={uploadStoreCode}
                            onChange={handleUploadStoreChange}
                            stores={stores}
                            loading={storesLoading}
                            warning={storesWarning}
                            onRetry={retryStores}
                            showError={false}
                        />
                    </label>
                    <label className="ads-monitor-toolbar-field ads-monitor-toolbar-field--date">
                        <span className="ads-monitor-field-label">{t('adsMonitor.dataDateLabel')}</span>
                        <DatePicker
                            value={dataDate}
                            onChange={setDataDate}
                            format="YYYY-MM-DD"
                            placeholder={t('adsMonitor.dataDatePh')}
                            style={{ width: '100%' }}
                            suffixIcon={<CalendarOutlined />}
                            allowClear
                        />
                    </label>
                    <label className="ads-monitor-toolbar-field ads-monitor-toolbar-field--file">
                        <span className="ads-monitor-field-label">{t('adsMonitor.uploadTitle')}</span>
                        <Upload
                            className="ads-monitor-file-upload"
                            accept=".xlsx,.xls,.csv"
                            maxCount={1}
                            showUploadList={false}
                            beforeUpload={(file) => {
                                setFileList([file]);
                                const hinted = extractDateFromFilename(file.name);
                                if (hinted) setDataDate(dayjs(hinted));
                                return false;
                            }}
                            fileList={fileList}
                        >
                            <button type="button" className="ads-monitor-file-trigger">
                                {fileList.length > 0 ? (
                                    <>
                                        <FileExcelOutlined className="ads-monitor-file-trigger-icon is-ready" />
                                        <span className="ads-monitor-file-trigger-name" title={fileList[0].name}>
                                            {fileList[0].name}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <InboxOutlined className="ads-monitor-file-trigger-icon" />
                                        <span className="ads-monitor-file-trigger-placeholder">
                                            {t('adsMonitor.uploadHint')}
                                        </span>
                                    </>
                                )}
                            </button>
                        </Upload>
                    </label>
                    <div className="ads-monitor-toolbar-action">
                        <span className="ads-monitor-toolbar-action-spacer" aria-hidden="true" />
                        <Button
                            type="primary"
                            className="ads-monitor-analyze-btn"
                            loading={loading}
                            icon={<CloudUploadOutlined />}
                            onClick={handleAnalyze}
                        >
                            {loading ? t('adsMonitor.analyzing') : t('adsMonitor.analyzeBtn')}
                        </Button>
                    </div>
                </div>
                {internalCreators.length > 0 && (
                    <Collapse
                        ghost
                        className="ads-monitor-internal-fold"
                        activeKey={internalListExpanded ? ['internal'] : []}
                        onChange={(keys) => setInternalListExpanded(keys.includes('internal'))}
                        items={[{
                            key: 'internal',
                            label: (
                                <span className="ads-monitor-internal-fold-label">
                                    <TeamOutlined />
                                    {t('adsMonitor.internalCount', { count: internalCreators.length })}
                                </span>
                            ),
                            children: (
                                <div className="ads-monitor-internal-tags">
                                    {internalCreators.map((name) => (
                                        <Tag key={name} className="ads-monitor-internal-tag">
                                            {name}
                                        </Tag>
                                    ))}
                                </div>
                            ),
                        }]}
                    />
                )}
            </Card>

            {(loading || result) && (
                <Collapse
                    className="ads-monitor-result-collapse"
                    activeKey={resultExpanded ? ['breakdown'] : []}
                    onChange={(keys) => setResultExpanded(keys.includes('breakdown'))}
                    items={[{
                        key: 'breakdown',
                        label: (
                            <div className="ads-monitor-result-header">
                                {loading ? (
                                    <>
                                        <LoadingOutlined spin className="ads-monitor-result-icon" />
                                        <span>{t('adsMonitor.resultProcessing')}</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircleOutlined className="ads-monitor-result-icon is-done" />
                                        <span>
                                            {t('adsMonitor.resultFoldTitle', { date: result.dataDate })}
                                            {result.storeCode ? ` · ${result.storeCode}` : ''}
                                        </span>
                                        {result.total && (
                                            <Text type="secondary" className="ads-monitor-result-summary">
                                                {t('adsMonitor.resultSummary', {
                                                    cost: fmtIdr(result.total.cost),
                                                    gmv: fmtIdr(result.total.grossRevenue),
                                                })}
                                            </Text>
                                        )}
                                    </>
                                )}
                            </div>
                        ),
                        children: loading ? (
                            <div className="ads-monitor-result-loading">
                                <Spin tip={t('adsMonitor.analyzing')} />
                            </div>
                        ) : (
                            <div className="ads-monitor-result-body">
                                {result?.rowsInFile > 0 && (
                                    <Text type="secondary" className="ads-monitor-result-meta">
                                        {t('adsMonitor.rowsProcessedNote', {
                                            processed: result.rowCount,
                                            total: result.rowsInFile,
                                        })}
                                        {result.filename ? ` · ${result.filename}` : ''}
                                    </Text>
                                )}
                                <Table
                                    columns={columns}
                                    dataSource={resultRows}
                                    pagination={false}
                                    size="small"
                                    rowClassName={(row) => (row.isTotal ? 'ads-monitor-total-row' : '')}
                                />
                                {internalBreakdownRows.length > 0 && (
                                    <div className="ads-monitor-internal-breakdown">
                                        <Text strong className="ads-monitor-internal-breakdown-title">
                                            {t('adsMonitor.internalBreakdownTitle')}
                                        </Text>
                                        <Table
                                            columns={internalColumns}
                                            dataSource={internalBreakdownRows}
                                            pagination={false}
                                            size="small"
                                        />
                                    </div>
                                )}
                                {result.accountsInFile?.length > 0 && (
                                    <Text type="secondary" className="ads-monitor-result-meta">
                                        {t('adsMonitor.accountsFound', { count: result.accountsInFile.length })}
                                    </Text>
                                )}
                            </div>
                        ),
                    }]}
                />
            )}

            <Card
                className="ads-monitor-monthly-card"
                styles={{ body: { padding: '12px 14px 14px' } }}
            >
                <div className="ads-monitor-monthly-toolbar">
                    <Text strong className="ads-monitor-monthly-title">
                        {t('adsMonitor.report.title')}
                    </Text>
                    <div className="ads-monitor-monthly-controls">
                        <AdsMonitorStoreSelect
                            className="ads-monitor-report-store-select"
                            placeholder={t('adsMonitor.report.storePh')}
                            value={reportStoreCode}
                            onChange={handleReportStoreChange}
                            stores={stores}
                            loading={storesLoading}
                            warning={storesWarning}
                            onRetry={retryStores}
                            showError={false}
                        />
                        <DatePicker
                            picker="month"
                            value={reportMonth}
                            onChange={handleReportMonthChange}
                            allowClear={false}
                        />
                        <Button
                            className="ads-monitor-export-btn"
                            icon={<DownloadOutlined />}
                            onClick={handleExportReport}
                            disabled={!monthlyReport?.filledDays}
                        >
                            {t('adsMonitor.export.btn')}
                        </Button>
                        <Button
                            danger
                            className="ads-monitor-delete-month-btn"
                            icon={<DeleteOutlined />}
                            onClick={() => {
                                setDeleteMonthPhrase('');
                                setDeleteMonthOpen(true);
                            }}
                            disabled={!monthlyReport?.filledDays}
                        >
                            {t('adsMonitor.delete.monthBtn')}
                        </Button>
                    </div>
                </div>
                <Collapse
                    ghost
                    className="ads-monitor-import-fold"
                    activeKey={importExpanded ? ['import'] : []}
                    onChange={(keys) => setImportExpanded(keys.includes('import'))}
                    items={[{
                        key: 'import',
                        label: t('adsMonitor.import.foldLabel'),
                        children: (
                            <AdsMonitorManualImport
                                stores={stores}
                                storesLoading={storesLoading}
                                storesError={storesError}
                                storesWarning={storesWarning}
                                onRetryStores={retryStores}
                                defaultStoreCode={reportStoreCode}
                                onSaved={handleImportSaved}
                            />
                        ),
                    }]}
                />
                {reportStoreCode && monthlyReport?.storeName && (
                    <Text type="secondary" className="ads-monitor-monthly-sub">
                        {`${monthlyReport.storeCode} — ${monthlyReport.storeName}`}
                    </Text>
                )}
                {!reportStoreCode ? (
                    <div className="ads-monitor-report-empty">
                        {t('adsMonitor.report.pickStoreHint')}
                    </div>
                ) : loadingReport ? (
                    <div className="ads-monitor-report-loading">
                        <Spin tip={t('adsMonitor.report.loading')} />
                    </div>
                ) : reportError ? (
                    <div className="ads-monitor-report-empty ads-monitor-report-error">
                        {reportError}
                    </div>
                ) : (
                    <AdsMonitorMonthlyGrid
                        report={monthlyReport}
                        t={t}
                        onDeleteDate={reportStoreCode ? handleDeleteDay : null}
                        deletingDate={deletingDate}
                    />
                )}
                {reportStoreCode && monthlyReport?.filledDays > 0 && (
                    <Text type="secondary" className="ads-monitor-monthly-meta">
                        {t('adsMonitor.report.filledDays', { count: monthlyReport.filledDays })}
                    </Text>
                )}
            </Card>

            <Modal
                title={t('adsMonitor.delete.monthTitle')}
                open={deleteMonthOpen}
                onCancel={() => {
                    if (deletingMonth) return;
                    setDeleteMonthOpen(false);
                    setDeleteMonthPhrase('');
                }}
                onOk={handleDeleteMonth}
                okText={t('adsMonitor.delete.monthConfirmBtn')}
                cancelText={t('adsMonitor.cancel')}
                okButtonProps={{
                    danger: true,
                    disabled: deleteMonthPhrase.trim() !== DELETE_MONTH_PHRASE,
                    loading: deletingMonth,
                }}
                destroyOnClose
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    {t('adsMonitor.delete.monthHint', {
                        store: reportStoreCode,
                        month: reportMonth.format('YYYY-MM'),
                    })}
                </Text>
                <Text style={{ display: 'block', marginBottom: 8 }}>
                    {t('adsMonitor.delete.monthTypeLabel')}
                    <Text code>{DELETE_MONTH_PHRASE}</Text>
                </Text>
                <Input
                    value={deleteMonthPhrase}
                    onChange={(e) => setDeleteMonthPhrase(e.target.value)}
                    placeholder={DELETE_MONTH_PHRASE}
                    disabled={deletingMonth}
                    onPressEnter={handleDeleteMonth}
                />
            </Modal>

            <Modal
                title={(
                    <Space>
                        <SettingOutlined />
                        {t('adsMonitor.internalCreatorsTitle')}
                    </Space>
                )}
                open={creatorModalOpen}
                onCancel={() => setCreatorModalOpen(false)}
                onOk={saveCreators}
                confirmLoading={savingCreators}
                okText={t('adsMonitor.creatorsSave')}
                cancelText={t('adsMonitor.cancel')}
                width={520}
                destroyOnClose
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                    {t('adsMonitor.internalCreatorsDesc')}
                </Text>
                <Input.Search
                    placeholder={t('adsMonitor.creatorSearchPh')}
                    value={creatorSearch}
                    onChange={(e) => setCreatorSearch(e.target.value)}
                    onSearch={loadDiscoveredAccounts}
                    allowClear
                    style={{ marginBottom: 12 }}
                />
                <div className="ads-monitor-creator-list">
                    {loadingAccounts ? (
                        <Text type="secondary">{t('adsMonitor.loadingAccounts')}</Text>
                    ) : filteredAccountOptions.length === 0 ? (
                        <Text type="secondary">{t('adsMonitor.noAccountsYet')}</Text>
                    ) : (
                        filteredAccountOptions.map((name) => (
                            <label key={name} className="ads-monitor-creator-item">
                                <Checkbox
                                    checked={creatorDraft.includes(name)}
                                    onChange={(e) => toggleCreator(name, e.target.checked)}
                                />
                                <span>{name}</span>
                            </label>
                        ))
                    )}
                </div>
            </Modal>
        </div>
    );
}
