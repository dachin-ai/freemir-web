import React, { useEffect, useState } from 'react';
import {
    Button, Typography, Upload, message,
} from 'antd';
import AdsMonitorStoreSelect from './AdsMonitorStoreSelect';
import {
    DownloadOutlined, FileExcelOutlined, ImportOutlined, InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { downloadImportTemplate, parseImportFile } from '../../utils/adsMonitorImport';

const { Text } = Typography;

export default function AdsMonitorManualImport({
    stores,
    storesLoading,
    storesError,
    storesWarning,
    onRetryStores,
    defaultStoreCode,
    onSaved,
}) {
    const { t } = useTranslation();
    const [importStoreCode, setImportStoreCode] = useState(defaultStoreCode || null);
    const [fileList, setFileList] = useState([]);
    const [parsed, setParsed] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (defaultStoreCode && !importStoreCode) {
            setImportStoreCode(defaultStoreCode);
        }
    }, [defaultStoreCode, importStoreCode]);

    const handleParseFile = async (file) => {
        setParsing(true);
        setParsed(null);
        try {
            const result = await parseImportFile(file);
            setParsed(result);
            if (result.errors?.length) {
                message.warning(t('adsMonitor.import.parseWarn', { count: result.errors.length }));
            }
        } catch (err) {
            message.error(err.message || t('adsMonitor.import.parseFail'));
            setFileList([]);
        } finally {
            setParsing(false);
        }
    };

    const handleImport = async () => {
        if (!importStoreCode) {
            message.warning(t('adsMonitor.import.storeRequired'));
            return;
        }
        if (!parsed?.records?.length) {
            message.warning(t('adsMonitor.import.fileRequired'));
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post('/ads-monitor/bulk-import', {
                store_code: importStoreCode,
                records: parsed.records,
            });
            message.success(t('adsMonitor.import.savedBulk', { count: data.saved }));
            setFileList([]);
            setParsed(null);
            const latest = parsed.records
                .map((r) => r.data_date)
                .sort()
                .pop();
            onSaved?.(latest ? dayjs(latest) : null, importStoreCode);
        } catch (err) {
            message.error(err.response?.data?.detail || t('adsMonitor.import.saveFail'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ads-monitor-import-panel">
            <div className="ads-monitor-import-toolbar">
                <div className="ads-monitor-import-store">
                    <Text type="secondary" className="ads-monitor-import-store-label">
                        {t('adsMonitor.storeLabel')}
                    </Text>
                    <AdsMonitorStoreSelect
                        value={importStoreCode}
                        onChange={setImportStoreCode}
                        stores={stores}
                        loading={storesLoading}
                        error={storesError}
                        warning={storesWarning}
                        onRetry={onRetryStores}
                    />
                </div>
                <div className="ads-monitor-import-actions">
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={() => downloadImportTemplate(t)}
                    >
                        {t('adsMonitor.import.templateBtn')}
                    </Button>
                    <Upload
                        accept=".xlsx,.xls,.csv"
                        maxCount={1}
                        showUploadList={false}
                        fileList={fileList}
                        beforeUpload={(file) => {
                            setFileList([file]);
                            handleParseFile(file);
                            return false;
                        }}
                        onRemove={() => {
                            setFileList([]);
                            setParsed(null);
                        }}
                    >
                        <Button icon={<InboxOutlined />} loading={parsing}>
                            {t('adsMonitor.import.chooseFile')}
                        </Button>
                    </Upload>
                    <Button
                        type="primary"
                        className="ads-monitor-import-btn"
                        icon={<ImportOutlined />}
                        loading={saving}
                        disabled={!parsed?.records?.length}
                        onClick={handleImport}
                    >
                        {t('adsMonitor.import.saveBtn')}
                    </Button>
                </div>
            </div>
            {fileList.length > 0 && (
                <div className="ads-monitor-import-file-meta">
                    <FileExcelOutlined />
                    <Text>{fileList[0].name}</Text>
                    {parsed?.rowCount > 0 && (
                        <Text type="secondary">
                            {t('adsMonitor.import.rowsReady', { count: parsed.rowCount })}
                        </Text>
                    )}
                </div>
            )}
            <Text type="secondary" className="ads-monitor-import-hint">
                {t('adsMonitor.import.fileHint')}
            </Text>
        </div>
    );
}
