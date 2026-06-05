import React, { useRef, useState } from 'react';
import {
    Button, Card, Input, Typography, Upload, message, Alert, Progress,
} from 'antd';
import {
    CloudUploadOutlined, FileExcelOutlined, LinkOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { downloadBase64Excel } from '../../utils/smaHelpers';
import { parseUrlsFromText, runSequentialAdd } from '../../utils/smaBulkProgress';
import SmaJobProgress from './SmaJobProgress';
import SmaShopNotice from './SmaShopNotice';
import SmaManualMetrics from './SmaManualMetrics';

const { TextArea } = Input;
const { Text, Title } = Typography;

export default function SmaVideoImport({ requireToken, onDone, logActivity }) {
    const { t } = useTranslation();
    const [bulkText, setBulkText] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [job, setJob] = useState(null);
    const cancelRef = useRef(false);

    const downloadTemplate = async () => {
        try {
            const res = await api.get('/social-media-analytics/import/template');
            downloadBase64Excel(res.data.file_base64, res.data.filename);
        } catch {
            message.error(t('socialMediaAnalytics.downloadFailed'));
        }
    };

    const finishResult = (data) => {
        setResult(data);
        const ok = data.success_count || 0;
        const err = data.error_count || 0;
        if (ok === 0 && err > 0) {
            message.error(t('socialMediaAnalytics.bulkAllFailed'));
        } else if (err > 0) {
            message.warning(t('socialMediaAnalytics.bulkDone', { ok, err }));
        } else if (ok > 0) {
            message.success(t('socialMediaAnalytics.bulkDone', { ok, err }));
        }
        if (ok > 0) {
            logActivity?.('Social Media Analytics (Bulk)');
            onDone?.();
        }
    };

    const runUrls = async (urls, tokenPayload) => {
        if (!urls.length) {
            message.warning(t('socialMediaAnalytics.urlRequired'));
            return;
        }
        cancelRef.current = false;
        setLoading(true);
        setResult(null);
        setJob({ phase: 'apify', current: 0, total: urls.length, url: urls[0], platform: null });
        try {
            const data = await runSequentialAdd(urls, {
                tokenPayload,
                cancelledRef: cancelRef,
                onProgress: setJob,
            });
            finishResult(data);
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.bulkFailed'));
        } finally {
            setLoading(false);
            setJob(null);
        }
    };

    const handlePasteBulk = () => {
        const tp = requireToken();
        if (!tp) return;
        runUrls(parseUrlsFromText(bulkText.trim()), tp);
    };

    const handleExcel = async (file) => {
        const tp = requireToken();
        if (!tp) return false;
        cancelRef.current = false;
        setLoading(true);
        setResult(null);
        setJob({ phase: 'parsing', current: 0, total: 0, url: file.name });
        const form = new FormData();
        form.append('file', file);
        try {
            const parsed = await api.post('/social-media-analytics/videos/parse-excel', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000,
            });
            const urls = parsed.data?.urls || [];
            if (!urls.length) {
                message.warning(t('socialMediaAnalytics.urlRequired'));
                setLoading(false);
                setJob(null);
                return false;
            }
            await runUrls(urls, tp);
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.bulkFailed'));
            setLoading(false);
            setJob(null);
        }
        return false;
    };

    const handleCancel = () => {
        cancelRef.current = true;
        message.info(t('socialMediaAnalytics.progressCancelling'));
    };

    const pct = result?.total
        ? Math.round(((result.success_count || 0) / result.total) * 100)
        : 0;

    return (
        <div className="sma-video-import">
            {loading && job && (
                <div className="sma-progress-sticky">
                    <SmaJobProgress job={job} onCancel={handleCancel} cancelling={cancelRef.current} />
                </div>
            )}

            <SmaShopNotice />

            <div className="sma-import-split">
                <Card className="sma-card sma-import-paste" bordered={false}>
                    <Title level={5} className="sma-section-title">
                        <LinkOutlined /> {t('socialMediaAnalytics.bulkPasteTitle')}
                    </Title>
                    <Text type="secondary" className="sma-block-hint">
                        {t('socialMediaAnalytics.bulkPasteHint')}
                    </Text>
                    <TextArea
                        rows={6}
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={t('socialMediaAnalytics.bulkPlaceholder')}
                        className="sma-bulk-textarea"
                        autoComplete="off"
                        name="sma_bulk_urls"
                        data-lpignore="true"
                        data-form-type="other"
                    />
                    <Button
                        type="primary"
                        loading={loading}
                        onClick={handlePasteBulk}
                        style={{ marginTop: 12 }}
                    >
                        {t('socialMediaAnalytics.bulkProcess')}
                    </Button>
                </Card>

                <Card className="sma-card sma-import-excel" bordered={false}>
                    <Title level={5} className="sma-section-title">
                        <FileExcelOutlined /> {t('socialMediaAnalytics.excelImportTitle')}
                    </Title>
                    <Text type="secondary" className="sma-block-hint sma-block-hint--compact">
                        {t('socialMediaAnalytics.excelImportHint')}
                    </Text>
                    <Button
                        block
                        icon={<DownloadOutlined />}
                        onClick={downloadTemplate}
                        style={{ marginBottom: 10 }}
                    >
                        {t('socialMediaAnalytics.downloadTemplate')}
                    </Button>
                    <Upload.Dragger
                        accept=".xlsx,.xls"
                        showUploadList={false}
                        beforeUpload={(f) => { handleExcel(f); return false; }}
                        disabled={loading}
                        className="sma-excel-dragger"
                    >
                        <p className="ant-upload-drag-icon">
                            <CloudUploadOutlined />
                        </p>
                        <p className="ant-upload-text sma-excel-drop-text">
                            {t('socialMediaAnalytics.excelDrop')}
                        </p>
                    </Upload.Dragger>
                </Card>
            </div>

            {result && !loading && (
                <Alert
                    type={result.error_count > 0 ? 'warning' : 'success'}
                    showIcon
                    message={t('socialMediaAnalytics.bulkSummary', {
                        ok: result.success_count,
                        err: result.error_count,
                        total: result.total,
                    })}
                    description={(
                        <div>
                            <Progress percent={pct} size="small" />
                            {result.errors?.length > 0 && (
                                <ul className="sma-error-list">
                                    {result.errors.slice(0, 5).map((e) => (
                                        <li key={e.url}>
                                            <Text code>{e.url?.slice(0, 48)}…</Text>
                                            {' — '}
                                            {e.error}
                                        </li>
                                    ))}
                                    {result.errors.length > 5 && (
                                        <li>…+{result.errors.length - 5} more</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )}
                    style={{ marginTop: 12 }}
                />
            )}

            <SmaManualMetrics onDone={onDone} />
        </div>
    );
}
