import React, { useState } from 'react';
import { Button, Card, Input, Typography, Upload, message } from 'antd';
import { DownloadOutlined, InboxOutlined, LinkOutlined, FileExcelOutlined, RightOutlined } from '@ant-design/icons';
import PageHeader from '../components/PageHeader';
import { downloadPhotoTemplate, downloadPhotoDirect, downloadPhotoBatch } from '../api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const { Text } = Typography;

const saveBlob = (blob, fallbackName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(url);
};

const extractFilename = (headers, fallbackName) => {
  const cd = headers?.['content-disposition'] || headers?.['Content-Disposition'] || '';
  const match = /filename="?([^"]+)"?/i.exec(cd);
  return match?.[1] || fallbackName;
};

const extractErrorDetail = async (error, fallbackText) => {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const txt = await data.text();
      const parsed = JSON.parse(txt);
      if (parsed?.detail) return parsed.detail;
    } catch {
      // ignore blob parse failures and fallback below
    }
  }
  return error?.response?.data?.detail || fallbackText;
};

const PhotoDownloader = () => {
  const { t } = useTranslation();
  const { logActivity } = useAuth();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loadingDirect, setLoadingDirect] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [fileList, setFileList] = useState([]);

  const stepCardStyle = {
    borderRadius: 12,
    border: '1px solid var(--border)',
    overflow: 'hidden',
    background: 'var(--bg-card)',
  };

  const handleDirectDownload = async () => {
    if (!name.trim() || !url.trim()) {
      message.warning(t('photoDownloader.msgFillDirect'));
      return;
    }
    setLoadingDirect(true);
    try {
      const res = await downloadPhotoDirect(name.trim(), url.trim());
      const filename = extractFilename(res.headers, `${name.trim()}.png`);
      saveBlob(res.data, filename);
      message.success(t('photoDownloader.msgDirectOk'));
      logActivity('Photo Downloader (Direct)');
    } catch (e) {
      const detail = await extractErrorDetail(e, t('photoDownloader.msgDirectFail'));
      message.error(detail);
    } finally {
      setLoadingDirect(false);
    }
  };

  const handleTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const res = await downloadPhotoTemplate();
      const filename = extractFilename(res.headers, 'photo_downloader_template.xlsx');
      saveBlob(res.data, filename);
      message.success(t('photoDownloader.msgTplOk'));
      logActivity('Photo Downloader (Download Template)');
    } catch (e) {
      const detail = await extractErrorDetail(e, t('photoDownloader.msgTplFail'));
      message.error(detail);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleBatchDownload = async () => {
    if (!fileList.length) {
      message.warning(t('photoDownloader.msgUploadFirst'));
      return;
    }
    setLoadingBatch(true);
    try {
      const res = await downloadPhotoBatch(fileList[0]);
      const filename = extractFilename(res.headers, 'photo_downloader_results.zip');
      saveBlob(res.data, filename);
      message.success(t('photoDownloader.msgBatchOk'));
      logActivity('Photo Downloader (Batch)');
    } catch (e) {
      const detail = await extractErrorDetail(e, t('photoDownloader.msgBatchFail'));
      message.error(detail);
    } finally {
      setLoadingBatch(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('photoDownloader.title')}
        subtitle={t('photoDownloader.subtitle')}
        accent="var(--indigo)"
      />
      <div style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {t('photoDownloader.directTitle')}
        </Text>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Text style={{ color: 'var(--text-muted)' }}>
          {t('photoDownloader.directHint')}
        </Text>
      </div>

      <Card style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px, 1fr) minmax(260px, 2fr) auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <Text style={{ fontWeight: 600 }}>{t('photoDownloader.photoName')}</Text>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('photoDownloader.phName')}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Text style={{ fontWeight: 600 }}>{t('photoDownloader.directUrl')}</Text>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('photoDownloader.phUrl')}
              style={{ marginTop: 6 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={handleDirectDownload}
              loading={loadingDirect}
            >
              {t('photoDownloader.downloadSingle')}
            </Button>
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {t('photoDownloader.batchTitle')}
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <Card style={stepCardStyle}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
            <Text style={{ fontWeight: 700 }}><DownloadOutlined /> {t('photoDownloader.step1')} <RightOutlined style={{ fontSize: 11 }} /></Text>
          </div>
          <div style={{ padding: 16 }}>
            <Text style={{ display: 'block', marginBottom: 12, color: 'var(--text-muted)' }}>{t('photoDownloader.step1Hint')}</Text>
            <Text style={{ display: 'block', marginBottom: 8 }}>
              {t('photoDownloader.templateFormat')}
              <br />- {t('photoDownloader.colA')}
              <br />- {t('photoDownloader.colB')}
            </Text>
            <Button icon={<DownloadOutlined />} onClick={handleTemplate} loading={loadingTemplate}>
              {t('photoDownloader.downloadTemplate')}
            </Button>
          </div>
        </Card>

        <Card style={stepCardStyle}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
            <Text style={{ fontWeight: 700 }}><InboxOutlined /> {t('photoDownloader.step2')} <RightOutlined style={{ fontSize: 11 }} /></Text>
          </div>
          <div style={{ padding: 16 }}>
            <Upload.Dragger
              maxCount={1}
              accept=".xlsx,.xls,.csv"
              beforeUpload={(file) => {
                setFileList([file]);
                return false;
              }}
              onRemove={() => setFileList([])}
              fileList={fileList}
            >
              <p className="ant-upload-drag-icon"><FileExcelOutlined /></p>
              <p className="ant-upload-text">{t('photoDownloader.uploadHint')}</p>
            </Upload.Dragger>
          </div>
        </Card>

        <Card style={stepCardStyle}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
            <Text style={{ fontWeight: 700 }}><DownloadOutlined /> {t('photoDownloader.step3')}</Text>
          </div>
          <div style={{ padding: 16 }}>
            <Text style={{ display: 'block', marginBottom: 12, color: 'var(--text-muted)' }}>
              {fileList.length ? t('photoDownloader.fileReady') : t('photoDownloader.fileNotReady')}
            </Text>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={loadingBatch}
              onClick={handleBatchDownload}
              disabled={!fileList.length}
            >
              {t('photoDownloader.downloadAll')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PhotoDownloader;
