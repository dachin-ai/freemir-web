import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs, Card, Typography, Select, DatePicker, Upload, Button,
  Table, message, Space, Row, Col, Tag, Tooltip, Spin, Segmented
} from 'antd';
import {
  InboxOutlined, CheckCircleFilled, MinusCircleFilled,
  ShopOutlined, UploadOutlined, ReloadOutlined,
  DownloadOutlined, BarChartOutlined, FileTextOutlined,
  RiseOutlined, FallOutlined, MinusOutlined,
  DeleteOutlined, ExclamationCircleFilled,
  CloudUploadOutlined, AppstoreOutlined, LineChartOutlined,
  SwapOutlined, CalendarOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import Bi from '../components/Bi';
import PageHeader from '../components/PageHeader';
import { useTheme } from '../context/ThemeContext';
import { Modal } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { RangePicker } = DatePicker;

import api from '../api';

const API = '/shopee-affiliate';

// ── Design tokens — built at runtime based on theme ─────────────────────────
const getTokens = (isDark) => ({
  page:    { padding: 24, minHeight: '100vh', background: 'var(--bg-app)' },
  card:    { background: isDark ? 'rgba(30,41,59,0.6)' : '#ffffff', border: '1px solid var(--border)', borderRadius: 12 },
  infoBox: { padding: '10px 14px', background: isDark ? 'rgba(2,132,199,0.1)' : '#eef2ff', border: `1px solid ${isDark ? 'rgba(2,132,199,0.3)' : 'rgba(2,132,199,0.4)'}`, borderRadius: 8 },
  warnBox: { padding: '10px 14px', background: isDark ? 'rgba(250,173,20,0.08)' : '#fffbeb', border: `1px solid ${isDark ? 'rgba(250,173,20,0.25)' : 'rgba(250,173,20,0.5)'}`, borderRadius: 8 },
  label:   { color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' },
});

// Table style helpers — theme-aware
const getHeaderCellFn = (isDark) => () => ({
  style: {
    background: isDark ? '#1a3a5c' : '#e8f4fd',
    color:      isDark ? '#ffffff' : '#1e40af',
    fontWeight: 700,
    fontSize:   12,
  }
});

const getBodyRowStyleFn = (isDark) => (_, idx) => ({
  style: { background: isDark
    ? (idx % 2 === 0 ? 'rgba(30,41,59,0.8)' : 'rgba(15,23,42,0.8)')
    : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')
  }
});

const fmtRp = n => n != null
  ? new Intl.NumberFormat('id-ID').format(Math.round(n))
  : '—';

const tblScroll = { x: 'max-content', y: 480 };

// ─────────────────────────────────────────────────────────────────────────────
const ShopeeAffiliate = () => {
  const { isDark } = useTheme();
  const S = getTokens(isDark);
  const getHeaderCell = getHeaderCellFn(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [stores, setStores]               = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await api.get(`${API}/stores`);
        setStores(res.data.stores || []);
      } catch { message.error('Failed to load stores from AT1.'); }
      finally { setStoresLoading(false); }
    };
    fetchStores();
  }, []);

  return (
    <div style={S.page}>
      <PageHeader
        title={<Bi i18nKey="shopeeAffiliate.title" />}
        subtitle={<Bi i18nKey="shopeeAffiliate.subtitle" />}
        accent="#f97316"
      />

      <Card style={S.card} bodyStyle={{ padding: 0 }}
        styles={{ body: { padding: 0 } }}
      >
        <Tabs size="large" style={{ padding: '0 8px' }} items={[
          { key: 'upload',      label: <span><CloudUploadOutlined /> <Bi i18nKey="shopeeAffiliate.tabUpload" /></span>,       children: <UploadTab    stores={stores} storesLoading={storesLoading} isDark={isDark} /> },
          { key: 'checker',     label: <span><AppstoreOutlined /> <Bi i18nKey="shopeeAffiliate.tabChecker" /></span>,       children: <CheckerTab   stores={stores} isDark={isDark} /> },
          { key: 'analytics',   label: <span><LineChartOutlined /> <Bi i18nKey="shopeeAffiliate.tabAnalytics" /></span>,            children: <AnalyticsTab stores={stores} isDark={isDark} /> },
          { key: 'report',      label: <span><FileTextOutlined /> <Bi i18nKey="shopeeAffiliate.tabReport" /></span>,           children: <ReportTab    stores={stores} isDark={isDark} /> },
          { key: 'comparison',  label: <span><SwapOutlined /> <Bi i18nKey="shopeeAffiliate.tabComparison" /></span>,         children: <ComparisonTab stores={stores} isDark={isDark} /> },
        ]} />
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ① Upload Tab
// ─────────────────────────────────────────────────────────────────────────────
const UploadTab = ({ stores, storesLoading, isDark }) => {
  const S = getTokens(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [uploadType,    setUploadType]    = useState('conversion');
  const [selectedStore, setSelectedStore] = useState(null);
  const [manualDate,    setManualDate]    = useState(null);         // for product/creator (optional)
  const [uploading,     setUploading]     = useState(false);
  const [fileList,      setFileList]      = useState([]);

  const isConversion = uploadType === 'conversion';
  const needsManual  = !isConversion;  // product or creator

  const handleUpload = async () => {
    if (!selectedStore)                          return message.warning('Please select a store first.');
    if (!fileList.length)                        return message.warning('Select or drag CSV files to upload.');

    setUploading(true);
    let ok = 0, fail = 0;
    for (const fo of fileList) {
      const fd = new FormData();
      fd.append('file',       fo.originFileObj);
      fd.append('file_type',  uploadType);
      fd.append('store_id',   selectedStore);
      if (needsManual && manualDate)         fd.append('manual_date', manualDate.format('YYYY-MM-DD'));
      try {
        const res = await api.post(`${API}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        res.data.succeed ? ok++ : (fail++, message.error(`${fo.name}: ${res.data.message}`));
      } catch (e) {
        fail++;
        message.error(`${fo.name}: ${e.response?.data?.detail || e.message}`);
      }
    }
    if (ok) message.success(`✅ Successfully processed ${ok} file(s)!`);
    if (!fail) setFileList([]);
    setUploading(false);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={S.label}><Bi i18nKey="shopeeAffiliate.dataType" /></div>
            <Select style={{ width: '100%', marginTop: 6 }} value={uploadType}
              onChange={v => { setUploadType(v); setFileList([]); }}
              options={[
                { value: 'conversion', label: 'Conversion (batch)' },
                { value: 'product',    label: 'Product (batch)' },
                { value: 'creator',    label: 'Creator (batch)' },
              ]} />
          </Col>
          <Col span={12}>
            <div style={S.label}><Bi i18nKey="shopeeAffiliate.selectStore" /></div>
            <Select showSearch loading={storesLoading} placeholder="Select a Shopee store..."
              style={{ width: '100%', marginTop: 6 }} value={selectedStore} onChange={setSelectedStore}
              options={stores.map(s => ({ value: s.code, label: s.name || s.code }))} />
          </Col>
        </Row>

        {needsManual && (
          <div>
            <div style={S.label}>
              Manual Date Override <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — fill only if filename has no date)</span>
            </div>
            <DatePicker
              style={{ width: '100%', marginTop: 6 }}
              value={manualDate}
              onChange={setManualDate}
              placeholder="Leave blank to auto-detect from filename"
              allowClear
            />
            {manualDate
              ? (
                <div style={{ ...S.warnBox, marginTop: 8, fontSize: 12, color: '#faad14', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CalendarOutlined style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>All uploaded files in this batch will be tagged as <strong>{manualDate.format('DD MMMM YYYY')}</strong>.</span>
                </div>
              ) : (
                <div style={{ ...S.infoBox, color: isDark ? '#7dd3fc' : 'var(--text-main)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <InfoCircleOutlined style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>Dates are <strong>auto-detected</strong> from filenames (e.g. <code style={{ background: 'rgba(2,132,199,0.2)', padding: '1px 5px', borderRadius: 4 }}>_20260401</code> or <code style={{ background: 'rgba(2,132,199,0.2)', padding: '1px 5px', borderRadius: 4 }}>202604101458</code>). Batch uploading is allowed.</span>
                </div>
              )
            }
          </div>
        )}

        <Dragger multiple={!isConversion} fileList={fileList}
          onChange={info => setFileList(info.fileList)} beforeUpload={() => false}
          style={{ background: isDark ? 'rgba(15,23,42,0.6)' : '#f8fafc', borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#cbd5e1' }}>
          <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#ff4d4f', fontSize: 36 }} /></p>
          <p style={{ color: textPrimary, fontSize: 15, fontWeight: 500 }}>Click or Drag CSV files here</p>
          <p style={{ color: '#64748b', fontSize: 13 }}>Upload raw files directly from Shopee Affiliate portal</p>
        </Dragger>

        <Button type="primary" block size="large" icon={<UploadOutlined />}
          loading={uploading} onClick={handleUpload}
          style={{ background: 'linear-gradient(135deg,#ff4d4f,#ff7a45)', border: 'none', fontWeight: 600, height: 48 }}>
          <Bi i18nKey="shopeeAffiliate.startEtl" />
        </Button>
      </Space>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ② Checker Matrix
// ─────────────────────────────────────────────────────────────────────────────
const CheckerTab = ({ stores, isDark }) => {
  const S = getTokens(isDark);
  const getHeaderCell = getHeaderCellFn(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [selectedMonth, setSelectedMonth] = useState(dayjs());
  const [matrixData,    setMatrixData]    = useState([]);
  const [loading,       setLoading]       = useState(false);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API}/checker-matrix`, {
        params: { year: selectedMonth.format('YYYY'), month: selectedMonth.format('MM') }
      });
      setMatrixData(res.data.matrix || []);
    } catch { message.error('Failed to load Checker Matrix.'); }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

  const activeStoreCodes = [...new Set(matrixData.flatMap(r => Object.keys(r.stores || {})))].sort();
  const getStoreName = code => { const s = stores.find(x => x.code === code); return s ? s.name.split(' - ').slice(-1)[0] : code; };
  const STORE_GROUP_WIDTH = 62 + 62 + 75;
  const checkerScroll = { x: 110 + (activeStoreCodes.length * STORE_GROUP_WIDTH) + 64, y: 480 };

  const handleDelete = (date) => {
    Modal.confirm({
      title: 'Delete All Data for Date',
      icon: <ExclamationCircleFilled />,
      content: `All Product, Creator, and Conversion data for ${dayjs(date).format('DD MMM YYYY')} will be permanently deleted. Continue?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await api.delete(`${API}/data`, { params: { date, data_type: 'all' } });
          message.success(res.data.message);
          fetchMatrix();
        } catch (e) {
          message.error(e.response?.data?.detail || 'Failed to delete data.');
        }
      }
    });
  };

  const handleDeleteSpecific = (date, store_id, dataType) => {
    Modal.confirm({
      title: 'Delete Specific Data',
      icon: <ExclamationCircleFilled />,
      content: `Delete ${dataType.toUpperCase()} data for store ${getStoreName(store_id)} on ${dayjs(date).format('DD MMM YYYY')}?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await api.delete(`${API}/data`, { params: { date, store_id, data_type: dataType } });
          message.success(res.data.message);
          fetchMatrix();
        } catch (e) {
          message.error(e.response?.data?.detail || 'Failed to delete data.');
        }
      }
    });
  };

  const Tick = ({ val, rowDate, storeId, dataType }) => {
    if (val) {
      return (
        <Tooltip title={`Click to delete ${dataType} data for ${getStoreName(storeId)}`}>
          <CheckCircleFilled 
            onClick={() => handleDeleteSpecific(rowDate, storeId, dataType)}
            style={{ color: '#22c55e', fontSize: 16, cursor: 'pointer', transition: 'color 0.2s' }} 
            onMouseEnter={(e) => e.target.style.color = '#ef4444'}
            onMouseLeave={(e) => e.target.style.color = '#22c55e'}
          />
        </Tooltip>
      );
    }
    const missingColor = isDark ? '#94a3b8' : '#64748b';
    return <MinusCircleFilled style={{ color: missingColor, fontSize: 13 }} />;
  };

  const hasAnyData = (row) => {
    return Object.values(row.stores || {}).some(s => s.product || s.creator || s.conversion);
  };

  const hdrStore = isDark ? '#93c5fd' : '#0c4a6e';
  const hdrProduct = isDark ? '#86efac' : '#166534';
  const hdrCreator = isDark ? '#fbbf24' : '#a16207';
  const hdrConversion = isDark ? '#60a5fa' : '#1d4ed8';

  const columns = [
    {
      title: 'Date', dataIndex: 'date', fixed: 'left', width: 110,
      onHeaderCell: getHeaderCell,
      render: t => <span style={{ color: textPrimary, fontWeight: 600 }}>{dayjs(t).format('DD MMM YYYY')}</span>,
    },
    ...activeStoreCodes.map(code => ({
      title: <span style={{ color: hdrStore }}>{getStoreName(code)}</span>,
      width: STORE_GROUP_WIDTH,
      onHeaderCell: getHeaderCell,
      children: [
        { title: <span style={{ color: hdrProduct, fontSize: 10 }}>Product</span>, align: 'center', width: 62, onHeaderCell: getHeaderCell, render: (_, r) => <Tick val={r.stores[code]?.product} rowDate={r.date} storeId={code} dataType="product" /> },
        { title: <span style={{ color: hdrCreator, fontSize: 10 }}>Creator</span>, align: 'center', width: 62, onHeaderCell: getHeaderCell, render: (_, r) => <Tick val={r.stores[code]?.creator} rowDate={r.date} storeId={code} dataType="creator" /> },
        { title: <span style={{ color: hdrConversion, fontSize: 10 }}>Conversion</span>, align: 'center', width: 75, onHeaderCell: getHeaderCell, render: (_, r) => <Tick val={r.stores[code]?.conversion} rowDate={r.date} storeId={code} dataType="conversion" /> },
      ]
    })),
    {
      title: '', fixed: 'right', width: 64, align: 'center',
      onHeaderCell: getHeaderCell,
      render: (_, row) => hasAnyData(row) ? (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => handleDelete(row.date)}
          style={{ opacity: 0.6 }}
        />
      ) : null
    }
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Text style={{ color: 'var(--text-muted)' }}>Filter Month:</Text>
          <DatePicker picker="month" value={selectedMonth} onChange={d => d && setSelectedMonth(d)} allowClear={false} />
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchMatrix} loading={loading}>Refresh</Button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        <CheckCircleFilled style={{ color: '#22c55e' }} /> = Data available (Click on the tick to delete specific data)<br/>
        <MinusCircleFilled style={{ color: isDark ? '#94a3b8' : '#64748b' }} /> = Missing data &nbsp;&nbsp;&nbsp;&nbsp;
        <DeleteOutlined style={{ color: '#ef4444' }} /> = Bulk click to delete all data (for all stores) on that date
      </div>
      <Table columns={columns} dataSource={matrixData} rowKey="date" loading={loading}
        bordered size="small" pagination={false} scroll={checkerScroll} style={{ background: 'transparent' }}
        onRow={getBodyRowStyle} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ③ Analytics (quick top list with bars)
// ─────────────────────────────────────────────────────────────────────────────
const AnalyticsTab = ({ stores, isDark }) => {
  const S = getTokens(isDark);
  const getHeaderCell = getHeaderCellFn(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [dateRange,     setDateRange]     = useState([dayjs().startOf('month'), dayjs()]);
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [data,          setData]          = useState({ topProducts: [], topCreators: [] });
  const [loading,       setLoading]       = useState(false);

  const fetch = useCallback(async () => {
    if (!dateRange || dateRange.length !== 2) return;
    setLoading(true);
    try {
      const res = await api.get(`${API}/analytics`, {
        params: { start_date: dateRange[0].format('YYYY-MM-DD'), end_date: dateRange[1].format('YYYY-MM-DD'), store_id: selectedStore }
      });
      setData(res.data);
    } catch { message.error('Failed to load Analytics.'); }
    setLoading(false);
  }, [dateRange, selectedStore]);

  useEffect(() => { fetch(); }, [fetch]);

  const maxProd = Math.max(...data.topProducts.map(p => p.gmv || 0), 1);
  const maxCrtr = Math.max(...data.topCreators.map(c => c.gmv || 0), 1);

  const BarRow = ({ label, sub, gmv, max }) => (
    <div style={{ padding: '7px 0', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: textPrimary, fontSize: 13, maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>Rp {fmtRp(gmv)}</span>
      </div>
      {sub && <div style={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: 11, marginBottom: 3 }}>{sub}</div>}
      <div style={{ height: 3, background: isDark ? '#1e293b' : '#e2e8f0', borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${(gmv / max) * 100}%`, background: 'linear-gradient(90deg,#0ea5e9,#22c55e)', borderRadius: 4 }} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px 24px' }}>
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={14}>
          <div style={S.label}><Bi i18nKey="shopeeAffiliate.dateRange" /></div>
          <RangePicker style={{ width: '100%', marginTop: 6 }} value={dateRange} onChange={setDateRange} />
        </Col>
        <Col span={10}>
          <div style={S.label}><Bi i18nKey="shopeeAffiliate.store" /></div>
          <Select showSearch style={{ width: '100%', marginTop: 6 }} value={selectedStore} onChange={setSelectedStore}
            options={[{ value: 'ALL', label: '🌐 All Stores' }, ...stores.map(s => ({ value: s.code, label: `${s.code} — ${s.name}` }))]} />
        </Col>
      </Row>
      <Row gutter={20}>
        <Col span={12}>
          <Card title={<span style={{ color: textPrimary }}>🏆 Top 15 Products (GMV)</span>} style={{ ...S.card }} styles={{ body: { padding: '8px 16px' } }}>
            {loading ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
              : data.topProducts.length ? data.topProducts.map((p, i) => <BarRow key={i} label={p.name} sub={`PID: ${p.product_id}`} gmv={p.gmv} max={maxProd} />)
              : <div style={{ textAlign: 'center', padding: 32, color: '#475569' }}>No product data</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span style={{ color: textPrimary }}>🎬 Top 15 Creators (GMV)</span>} style={{ ...S.card }} styles={{ body: { padding: '8px 16px' } }}>
            {loading ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
              : data.topCreators.length ? data.topCreators.map((c, i) => <BarRow key={i} label={c.name || c.username} sub={`@${c.username}`} gmv={c.gmv} max={maxCrtr} />)
              : <div style={{ textAlign: 'center', padding: 32, color: '#475569' }}>No creator data</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ④ Laporan Lengkap
// ─────────────────────────────────────────────────────────────────────────────
const REPORT_DIMS = [
  { value: 'by_store',   label: 'By Store' },
  { value: 'by_creator', label: 'By Creator' },
  { value: 'by_product', label: 'By Product' },
];

const ReportTab = ({ stores, isDark }) => {
  const S = getTokens(isDark);
  const getHeaderCell = getHeaderCellFn(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [dateRange,     setDateRange]     = useState([dayjs().startOf('month'), dayjs()]);
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [dimension,     setDimension]     = useState('by_creator');
  const [data,          setData]          = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [expanded,      setExpanded]      = useState([]);

  const fetchReport = useCallback(async () => {
    if (!dateRange || dateRange.length !== 2) return;
    setLoading(true);
    try {
      const res = await api.get(`${API}/report`, {
        params: {
          start_date:  dateRange[0].format('YYYY-MM-DD'),
          end_date:    dateRange[1].format('YYYY-MM-DD'),
          report_type: dimension,
          store_id:    selectedStore
        }
      });
      setData(res.data.data || []);
    } catch { message.error('Failed to load report.'); }
    setLoading(false);
  }, [dateRange, selectedStore, dimension]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleDownload = async () => {
    if (!dateRange || dateRange.length !== 2) return;
    setDownloading(true);
    try {
      const res = await api.get(`${API}/report/download`, {
        params: {
          start_date:  dateRange[0].format('YYYY-MM-DD'),
          end_date:    dateRange[1].format('YYYY-MM-DD'),
          report_type: dimension,
          store_id:    selectedStore
        },
        responseType: 'blob'
      });
      const url  = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `Shopee_Affiliate_${dimension}_${dateRange[0].format('YYYYMMDD')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch { message.error('Failed to download report.'); }
    setDownloading(false);
  };

  // ── Build columns based on dimension ───────────────────────
  const numCol = (title, key, prefix = '') => ({
    title, dataIndex: key, align: 'right', width: 140, onHeaderCell: getHeaderCell,
    sorter: (a, b) => (a[key] || 0) - (b[key] || 0),
    render: v => <span style={{ color: textPrimary, fontFamily: 'monospace' }}>{prefix}{fmtRp(v)}</span>
  });
  const roiCol = () => ({
    title: 'ROI', dataIndex: 'roi', align: 'right', width: 90, onHeaderCell: getHeaderCell,
    sorter: (a, b) => (a.roi || 0) - (b.roi || 0),
    render: v => {
      const col = v >= 5 ? '#22c55e' : v >= 2 ? '#faad14' : '#ef4444';
      return <span style={{ color: col, fontWeight: 700 }}>{(v || 0).toFixed(2)}x</span>;
    }
  });

  let columns = [];
  if (dimension === 'by_store') {
    columns = [
      { title: 'No', render: (_, __, i) => i+1, width: 50, align: 'center', onHeaderCell: getHeaderCell },
      { title: 'Store ID', dataIndex: 'store_id', width: 150, onHeaderCell: getHeaderCell, render: v => <Tag color="blue">{v}</Tag> },
      numCol('GMV Completed', 'gmv_completed', 'Rp '),
      numCol('GMV Pending', 'gmv_pending', 'Rp '),
      numCol('GMV Potential', 'gmv_potential', 'Rp '),
      numCol('GMV Canceled', 'gmv_canceled', 'Rp '),
      numCol('Commission (Rp)', 'commission', 'Rp '),
      roiCol(),
      numCol('Units Sold', 'units'),
      numCol('Clicks', 'clicks'),
      { title: 'Creators', dataIndex: 'creator_count', align: 'right', width: 90, onHeaderCell: getHeaderCell, render: v => <span style={{ color: isDark ? '#7dd3fc' : '#0ea5e9', fontWeight: 600 }}>{v}</span> }
    ];
  } else if (dimension === 'by_creator') {
    columns = [
      { title: 'No', render: (_, __, i) => i+1, width: 50, align: 'center', onHeaderCell: getHeaderCell },
      { title: 'Username', dataIndex: 'username', width: 180, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: isDark ? '#7dd3fc' : '#0ea5e9', fontFamily: 'monospace' }}>@{v}</span> },
      { title: 'Creator Name', dataIndex: 'name', width: 200, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: textPrimary }}>{v}</span> },
      numCol('GMV Completed', 'gmv_completed', 'Rp '),
      numCol('GMV Pending', 'gmv_pending', 'Rp '),
      numCol('GMV Potential', 'gmv_potential', 'Rp '),
      numCol('GMV Canceled', 'gmv_canceled', 'Rp '),
      numCol('Commission (Rp)', 'commission', 'Rp '),
      roiCol(),
      numCol('Units Sold', 'units'),
      numCol('Clicks', 'clicks'),
      { title: 'Stores', dataIndex: 'store_count', align: 'right', width: 80, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: isDark ? '#fbbf24' : '#d97706', fontWeight: 600 }}>{v}</span> },
    ];
  } else if (dimension === 'by_product') {
    columns = [
      { title: 'No', render: (_, __, i) => i+1, width: 50, align: 'center', onHeaderCell: getHeaderCell },
      { title: 'PID', dataIndex: 'product_id', width: 120, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: isDark ? '#94a3b8' : '#475569', fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
      { title: 'Product Name', dataIndex: 'product_name', width: 280, ellipsis: true, onHeaderCell: getHeaderCell,
        render: v => <Tooltip title={v}><span style={{ color: textPrimary }}>{v}</span></Tooltip> },
      numCol('GMV Completed', 'gmv_completed', 'Rp '),
      numCol('GMV Pending', 'gmv_pending', 'Rp '),
      numCol('GMV Potential', 'gmv_potential', 'Rp '),
      numCol('GMV Canceled', 'gmv_canceled', 'Rp '),
      numCol('Commission (Rp)', 'commission', 'Rp '),
      roiCol(),
      numCol('Units Sold', 'units'),
      { title: 'Creators', dataIndex: 'creator_count', align: 'right', width: 80, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: isDark ? '#fbbf24' : '#d97706', fontWeight: 600 }}>{v}</span> },
    ];
  }

  // Creator sub-table for by_product
  const expandedRow = record => {
    const subCols = [
      { title: 'Username', dataIndex: 'username', width: 180, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: isDark ? '#7dd3fc' : '#0ea5e9' }}>@{v}</span> },
      { title: 'Creator Name', dataIndex: 'name', width: 200, onHeaderCell: getHeaderCell },
      { title: 'GMV Potential (Rp)', dataIndex: 'gmv_potential', align: 'right', width: 150, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: '#22c55e', fontFamily: 'monospace' }}>Rp {fmtRp(v)}</span> },
      { title: 'Commission (Rp)', dataIndex: 'commission', align: 'right', width: 150, onHeaderCell: getHeaderCell,
        render: v => <span style={{ color: textPrimary, fontFamily: 'monospace' }}>Rp {fmtRp(v)}</span> },
    ];
    return (
      <div style={{ padding: '8px 32px', background: isDark ? 'rgba(10,20,35,0.8)' : '#f1f5f9' }}>
        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12, marginBottom: 8, display: 'block' }}>Creators who drove this product:</Text>
        <Table columns={subCols} dataSource={record.creators} rowKey="username"
          bordered size="small" pagination={false} scroll={{ x: 'max-content' }}
          style={{ background: 'transparent' }} onRow={getBodyRowStyle} />
      </div>
    );
  };

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Controls */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={11}>
          <div style={S.label}>Date Range</div>
          <RangePicker style={{ width: '100%', marginTop: 6 }} value={dateRange} onChange={setDateRange} />
        </Col>
        <Col span={8}>
          <div style={S.label}>Store</div>
          <Select showSearch style={{ width: '100%', marginTop: 6 }} value={selectedStore} onChange={setSelectedStore}
            options={[{ value: 'ALL', label: '🌐 All Stores' }, ...stores.map(s => ({ value: s.code, label: `${s.code} — ${s.name}` }))]} />
        </Col>
        <Col span={5}>
          <div style={S.label}>Download</div>
          <Button block icon={<DownloadOutlined />} loading={downloading} onClick={handleDownload}
            style={{ marginTop: 6, background: 'linear-gradient(135deg,#1a3a5c,#2d5a8e)', color: '#fff', border: 'none', fontWeight: 600 }}>
            Export Excel
          </Button>
        </Col>
      </Row>

      {/* Dimension Segmented */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={dimension}
          onChange={setDimension}
          options={REPORT_DIMS}
          style={{ background: isDark ? 'rgba(15,23,42,0.8)' : '#e2e8f0' }}
        />
        <Text style={{ color: '#475569', fontSize: 12, marginLeft: 12 }}>
          {data.length} rows · {dateRange?.[0]?.format('DD MMM')} – {dateRange?.[1]?.format('DD MMM YYYY')}
        </Text>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey={r => r.store_id || r.username || r.product_id}
        loading={loading}
        bordered
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25','50','100'] }}
        scroll={tblScroll}
        style={{ background: 'transparent' }}
        onRow={getBodyRowStyle}
        expandable={dimension === 'by_product' ? {
          expandedRowRender: expandedRow,
          expandedRowKeys: expanded,
          onExpandedRowsChange: setExpanded,
          rowExpandable: r => r.creators?.length > 0
        } : undefined}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ Komparasi Periode
// ─────────────────────────────────────────────────────────────────────────────
const ComparisonTab = ({ stores, isDark }) => {
  const S = getTokens(isDark);
  const getHeaderCell = getHeaderCellFn(isDark);
  const getBodyRowStyle = getBodyRowStyleFn(isDark);
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const [periodA,       setPeriodA]       = useState([dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')]);
  const [periodB,       setPeriodB]       = useState([dayjs().startOf('month'), dayjs()]);
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [dimension,     setDimension]     = useState('by_creator');
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(false);

  const fetchComparison = useCallback(async () => {
    if (!periodA || !periodB) return;
    setLoading(true);
    try {
      const res = await api.get(`${API}/comparison`, {
        params: {
          period_a_start: periodA[0].format('YYYY-MM-DD'),
          period_a_end:   periodA[1].format('YYYY-MM-DD'),
          period_b_start: periodB[0].format('YYYY-MM-DD'),
          period_b_end:   periodB[1].format('YYYY-MM-DD'),
          dimension,
          store_id:       selectedStore
        }
      });
      setData(res.data);
    } catch { message.error('Failed to load comparison data.'); }
    setLoading(false);
  }, [periodA, periodB, selectedStore, dimension]);

  useEffect(() => { fetchComparison(); }, [fetchComparison]);

  const DeltaBadge = ({ val }) => {
    if (val == null) return <span style={{ color: '#475569' }}>—</span>;
    const up    = val > 0;
    const zero  = val === 0;
    const color = up ? '#22c55e' : zero ? '#64748b' : '#ef4444';
    const icon  = up ? <RiseOutlined /> : zero ? <MinusOutlined /> : <FallOutlined />;
    return (
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>
        {icon} {up ? '+' : ''}{val}%
      </span>
    );
  };

  const metricCols = (metricKey, label, prefix = 'Rp ') => [
    {
      title: <span style={{ color: isDark ? '#93c5fd' : '#1d4ed8' }}>{label} A</span>,
      align: 'right', width: 140, onHeaderCell: getHeaderCell,
      render: r => <span style={{ color: textPrimary, fontFamily: 'monospace' }}>{prefix}{fmtRp(r[`a_${metricKey}`])}</span>
    },
    {
      title: <span style={{ color: isDark ? '#fbbf24' : '#b45309' }}>{label} B</span>,
      align: 'right', width: 140, onHeaderCell: getHeaderCell,
      render: r => <span style={{ color: textPrimary, fontFamily: 'monospace' }}>{prefix}{fmtRp(r[`b_${metricKey}`])}</span>
    },
    {
      title: <span style={{ color: isDark ? '#7dd3fc' : '#0ea5e9' }}>Δ {label}</span>,
      align: 'center', width: 110, onHeaderCell: getHeaderCell,
      sorter: (a, b) => (a[`delta_${metricKey}`] || -999) - (b[`delta_${metricKey}`] || -999),
      render: r => <DeltaBadge val={r[`delta_${metricKey}`]} />
    }
  ];

  const roiCompCols = () => [
    {
      title: <span style={{ color: isDark ? '#93c5fd' : '#1d4ed8' }}>ROI A</span>,
      align: 'right', width: 100, onHeaderCell: getHeaderCell,
      render: r => {
        const v = r.a_roi || 0;
        const col = v >= 5 ? '#22c55e' : v >= 2 ? '#faad14' : '#ef4444';
        return <span style={{ color: col, fontWeight: 700 }}>{v.toFixed(2)}x</span>;
      }
    },
    {
      title: <span style={{ color: isDark ? '#fbbf24' : '#b45309' }}>ROI B</span>,
      align: 'right', width: 100, onHeaderCell: getHeaderCell,
      render: r => {
        const v = r.b_roi || 0;
        const col = v >= 5 ? '#22c55e' : v >= 2 ? '#faad14' : '#ef4444';
        return <span style={{ color: col, fontWeight: 700 }}>{v.toFixed(2)}x</span>;
      }
    },
    {
      title: <span style={{ color: isDark ? '#7dd3fc' : '#0ea5e9' }}>Δ ROI</span>,
      align: 'center', width: 110, onHeaderCell: getHeaderCell,
      sorter: (a, b) => (a.delta_roi || -999) - (b.delta_roi || -999),
      render: r => <DeltaBadge val={r.delta_roi} />
    }
  ];

  const labelCol = dimension === 'by_store'
    ? [{ title: 'Store ID',  dataIndex: 'label', render: v => <Tag color="blue">{v}</Tag>, width: 140, onHeaderCell: getHeaderCell }]
    : dimension === 'by_creator'
    ? [{ title: 'Creator',   dataIndex: 'label', render: v => <span style={{ color: textPrimary }}>{v}</span>, width: 240, onHeaderCell: getHeaderCell }]
    : [
        { title: 'PID', dataIndex: 'key', width: 120, onHeaderCell: getHeaderCell, render: v => <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
        { title: 'Product Name', dataIndex: 'label', render: v => <Tooltip title={v}><span style={{ color: textPrimary }}>{v.split(' (PID:')[0]}</span></Tooltip>, width: 280, ellipsis: true, onHeaderCell: getHeaderCell }
      ];

  const columns = [
    { title: 'No', render: (_, __, i) => i+1, width: 45, align: 'center', onHeaderCell: getHeaderCell },
    ...labelCol,
    ...metricCols('gmv',        'GMV'),
    ...metricCols('commission', 'Commission'),
    ...roiCompCols(),
    ...metricCols('units',      'Units', ''),
    ...metricCols('clicks',     'Clicks', ''),
  ];

  const rows = data?.rows || [];

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Period pickers */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={7}>
          <div style={S.label}><CalendarOutlined style={{ marginRight: 5 }} />Period A (Baseline)</div>
          <RangePicker style={{ width: '100%', marginTop: 6 }} value={periodA} onChange={setPeriodA}
            placeholder={['A Start', 'A End']} />
        </Col>
        <Col span={7}>
          <div style={S.label}><CalendarOutlined style={{ marginRight: 5 }} />Period B (Comparison)</div>
          <RangePicker style={{ width: '100%', marginTop: 6 }} value={periodB} onChange={setPeriodB}
            placeholder={['B Start', 'B End']} />
        </Col>
        <Col span={6}>
          <div style={S.label}>Store</div>
          <Select showSearch style={{ width: '100%', marginTop: 6 }} value={selectedStore} onChange={setSelectedStore}
            options={[{ value: 'ALL', label: '🌐 All Stores' }, ...stores.map(s => ({ value: s.code, label: s.code }))]} />
        </Col>
        <Col span={4}>
          <div style={S.label}>&nbsp;</div>
          <Button block icon={<ReloadOutlined />} onClick={fetchComparison} loading={loading} style={{ marginTop: 6 }}>
            Refresh
          </Button>
        </Col>
      </Row>

      {/* Dimension picker */}
      <div style={{ marginBottom: 16 }}>
        <Segmented value={dimension} onChange={setDimension}
          options={REPORT_DIMS} style={{ background: isDark ? 'rgba(15,23,42,0.8)' : '#e2e8f0' }} />
      </div>

      {/* Legend */}
      {data && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 24 }}>
          <div style={{ background: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', border: `1px solid ${isDark ? 'rgba(59,130,246,0.3)' : '#bfdbfe'}`, borderRadius: 8, padding: '8px 16px' }}>
            <Text style={{ color: '#3b82f6', fontWeight: 600, fontSize: 12 }}>Period A</Text>
            <div style={{ color: textPrimary, fontSize: 12 }}>{data.period_a}</div>
          </div>
          <div style={{ background: isDark ? 'rgba(234,179,8,0.1)' : '#fffbeb', border: `1px solid ${isDark ? 'rgba(234,179,8,0.3)' : '#fde68a'}`, borderRadius: 8, padding: '8px 16px' }}>
            <Text style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>Period B</Text>
            <div style={{ color: textPrimary, fontSize: 12 }}>{data.period_b}</div>
          </div>
          <div style={{ background: isDark ? 'rgba(34,197,94,0.08)' : '#f0fdf4', border: `1px solid ${isDark ? 'rgba(34,197,94,0.2)' : '#bbf7d0'}`, borderRadius: 8, padding: '8px 16px' }}>
            <Text style={{ color: '#22c55e', fontSize: 12 }}><RiseOutlined /> Positive Δ = Period B is better than A</Text>
          </div>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="key"
        loading={loading}
        bordered
        size="small"
        pagination={{ pageSize: 50 }}
        scroll={{ x: 2400 }}
        style={{ background: 'transparent' }}
        onRow={getBodyRowStyle}
      />
    </div>
  );
};

export default ShopeeAffiliate;
