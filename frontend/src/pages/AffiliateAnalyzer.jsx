import React, { useState } from 'react';
import { Typography, Radio, Button, Row, Col, message, Divider, Table, Upload } from 'antd';
import { InboxOutlined, FileExcelOutlined, PlayCircleOutlined, PieChartOutlined, TrophyOutlined, OrderedListOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { useTheme } from '../context/ThemeContext';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const NEGATIVE_METRICS = ['Refunded GMV', 'Refunded Items', 'Cancellation Rate'];

const MetricCard = ({ label, value, sub, isDark }) => (
    <div style={{ background: isDark ? 'rgba(2,132,199,0.08)' : '#f8fafc', border: `1px solid ${isDark ? 'rgba(2,132,199,0.2)' : '#e2e8f0'}`, borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</Text>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-main)', marginTop: 4 }}>{value}</div>
        <Text style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</Text>
    </div>
);

const SectionHeader = ({ icon, text, isDark }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', margin: '28px 0 16px', paddingBottom: 10, borderBottom: `2px solid ${isDark ? 'rgba(2,132,199,0.2)' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: isDark ? 'rgba(2,132,199,0.15)' : '#eef2ff', border: `1px solid ${isDark ? 'rgba(2,132,199,0.3)' : 'rgba(2,132,199,0.3)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', fontSize: 14, flexShrink: 0 }}>{icon}</span>
        {text}
    </div>
);

function fmtCurrency(val) {
    if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(2)}B`;
    if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}K`;
    return `Rp ${(val || 0).toLocaleString()}`;
}

function fmtNum(val) {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return `${(val || 0).toLocaleString()}`;
}

const Top5Box = ({ title, data, isDark }) => (
    <div style={{ background: isDark ? 'rgba(15,23,42,0.6)' : '#ffffff', border: `1px solid ${isDark ? 'rgba(2,132,199,0.2)' : '#e2e8f0'}`, borderLeft: '3px solid #0ea5e9', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${isDark ? 'rgba(2,132,199,0.1)' : '#f1f5f9'}` }}>
            {title}
        </div>
        {data && data.length > 0 ? data.map((item, i) => {
            let valStr = '';
            if (item.fmt === 'currency') valStr = fmtCurrency(item.value);
            else if (item.fmt === 'percent') valStr = `${(item.value * 100).toFixed(1)}%`;
            else valStr = fmtNum(item.value);

            return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 22 }}>{i + 1}.</span>
                    <span style={{ flex: 1, color: 'var(--text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ fontWeight: 700, color: isDark ? '#7dd3fc' : '#0ea5e9', marginLeft: 12, whiteSpace: 'nowrap' }}>{valStr}</span>
                </div>
            );
        }) : <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>No data</Text>}
    </div>
);

const AffiliateAnalyzer = () => {
    const { logActivity } = useAuth();
    const { isDark } = useTheme();
    const [mode, setMode] = useState('Creator');
    const [fileA, setFileA] = useState(null);
    const [fileB, setFileB] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const onHeaderCell = () => ({
        style: {
            background: isDark ? '#1a3a5c' : '#e8f4fd',
            color:      isDark ? '#ffffff' : '#1e40af',
            fontWeight: 700,
            fontSize:   12,
        }
    });
    const textPrimary = isDark ? '#e2e8f0' : '#1e293b';

    const handleRun = async () => {
        if (!fileA || !fileB) {
            message.warning("Please upload both File A (Older) and File B (Newer).");
            return;
        }

        const formData = new FormData();
        formData.append('mode', mode);
        formData.append('file_a', fileA);
        formData.append('file_b', fileB);

        setLoading(true);
        setResult(null);

        try {
            const res = await api.post('/affiliate/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResult(res.data);
            message.success('Analysis complete!');
            logActivity(`Affiliate Analyzer (${mode})`);
        } catch (err) {
            console.error(err);
            message.error(err.response?.data?.detail || "An error occurred during analysis.");
        } finally {
            setLoading(false);
        }
    };

    const downloadExcel = () => {
        if (!result || !result.file_base64) return;
        const bytes = atob(result.file_base64);
        const buf = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `affiliate_${mode.toLowerCase()}_analysis.xlsx`;
        link.click();
    };

    const buildColumns = () => {
        if (!result) return [];
        const { metrics } = result;

        const cols = [
            { title: 'Rank', dataIndex: 'Rank', key: 'Rank', width: 60, fixed: 'left', align: 'center', onHeaderCell, render: v => <strong style={{ color: textPrimary }}>{v}</strong> }
        ];

        if (mode === 'Product') {
            cols.push({ title: 'Product ID', dataIndex: 'Product ID', key: 'Product ID', width: 140, fixed: 'left', onHeaderCell, render: v => <Text style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#475569', fontFamily: 'monospace' }}>{v}</Text> });
            cols.push({ title: 'Product Name', dataIndex: 'Product Name', key: 'Product Name', width: 200, fixed: 'left', ellipsis: true, onHeaderCell, render: v => <span style={{ color: textPrimary }}>{v}</span> });
        } else {
            cols.push({ title: 'Creator Name', dataIndex: 'Creator Name', key: 'Creator Name', width: 220, fixed: 'left', ellipsis: true, onHeaderCell, render: v => <span style={{ color: textPrimary }}>{v}</span> });
        }

        metrics.forEach(m => {
            const isPct = m.includes('Cancellation');
            cols.push({
                title: `${m} (A)`, dataIndex: `${m} (A)`, key: `${m} (A)`, align: 'right', width: 110, onHeaderCell,
                render: (v, row) => row._a_missing ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <span style={{ color: textPrimary }}>{isPct ? `${(v * 100).toFixed(2)}%` : v?.toLocaleString()}</span>
            });
            cols.push({
                title: `${m} (B)`, dataIndex: `${m} (B)`, key: `${m} (B)`, align: 'right', width: 110, onHeaderCell,
                render: (v, row) => row._b_missing ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <span style={{ color: textPrimary }}>{isPct ? `${(v * 100).toFixed(2)}%` : v?.toLocaleString()}</span>
            });
            cols.push({
                title: `${m} Growth`, dataIndex: `${m} Growth`, key: `${m} Growth`, align: 'right', width: 110, onHeaderCell,
                render: (v, row) => {
                    if (row._a_missing || row._b_missing || v == null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                    const pctStr = `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
                    const isNegMetric = NEGATIVE_METRICS.includes(m);

                    let bg = '', color = '';
                    if (v > 0) {
                        bg = isNegMetric ? (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2') : (isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7');
                        color = isNegMetric ? '#ef4444' : '#16a34a';
                    } else if (v < 0) {
                        bg = isNegMetric ? (isDark ? 'rgba(34,197,94,0.15)' : '#dcfce7') : (isDark ? 'rgba(239,68,68,0.15)' : '#fee2e2');
                        color = isNegMetric ? '#16a34a' : '#ef4444';
                    }

                    if (bg) return <div style={{ background: bg, color, fontWeight: 600, padding: '2px 8px', borderRadius: 4, display: 'inline-block', fontSize: 12 }}>{pctStr}</div>;
                    return <span style={{ color: textPrimary }}>{pctStr}</span>;
                }
            });
        });

        return cols;
    };

    return (
        <div>
            {/* Banner */}
            <PageHeader
                title="TikTok Affiliate Analyzer"
                subtitle="Compare affiliate performance across two periods — Supports Creator and Product analysis modes"
                accent="#ec4899"
            />

            <Row gutter={[24, 24]}>
                <Col xs={24} lg={8}>
                    {/* Controls */}
                    <div style={{ background: isDark ? 'rgba(15,23,42,0.6)' : '#ffffff', padding: 24, borderRadius: 12, border: `1px solid ${isDark ? 'rgba(2,132,199,0.2)' : '#e2e8f0'}` }}>
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Analysis Mode</div>
                            <Radio.Group value={mode} onChange={e => setMode(e.target.value)} optionType="button" buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                                <Radio.Button value="Creator" style={{ flex: 1, textAlign: 'center' }}>Creator</Radio.Button>
                                <Radio.Button value="Product" style={{ flex: 1, textAlign: 'center' }}>Product</Radio.Button>
                            </Radio.Group>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>File A — Older Period</div>
                            <Dragger maxCount={1} beforeUpload={f => { setFileA(f); return false; }} onRemove={() => setFileA(null)}
                                style={{ background: isDark ? 'rgba(15,23,42,0.4)' : '#f8fafc', borderColor: isDark ? 'rgba(56,189,248,0.3)' : '#bae6fd' }}>
                                <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#38bdf8' }} /></p>
                                <p className="ant-upload-text" style={{ color: 'var(--text-main)' }}>Upload File A</p>
                            </Dragger>
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>File B — Newer Period</div>
                            <Dragger maxCount={1} beforeUpload={f => { setFileB(f); return false; }} onRemove={() => setFileB(null)}
                                style={{ background: isDark ? 'rgba(15,23,42,0.4)' : '#f8fafc', borderColor: isDark ? 'rgba(74,222,128,0.3)' : '#bbf7d0' }}>
                                <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#4ade80' }} /></p>
                                <p className="ant-upload-text" style={{ color: 'var(--text-main)' }}>Upload File B</p>
                            </Dragger>
                        </div>

                        <Button block loading={loading} onClick={handleRun} icon={<PlayCircleOutlined />}
                            style={{
                                height: 48, borderRadius: 8, fontWeight: 700, fontSize: 15,
                                background: 'var(--fm-gradient)', color: '#fff', border: 'none', boxShadow: 'var(--fm-shadow)',
                            }}>
                            {loading ? 'Processing...' : 'Start Analysis'}
                        </Button>
                    </div>
                </Col>

                <Col xs={24} lg={16}>
                    {!result && (
                        <div style={{ background: isDark ? 'rgba(15,23,42,0.4)' : '#f8fafc', border: `1px dashed ${isDark ? 'rgba(2,132,199,0.3)' : '#cbd5e1'}`, borderRadius: 12, height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                            <UploadOutlined style={{ fontSize: 40, color: isDark ? 'rgba(2,132,199,0.5)' : '#94a3b8' }} />
                            <Text style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 500 }}>Upload both files and click Start Analysis</Text>
                        </div>
                    )}

                    {result && (
                        <div style={{ background: isDark ? 'rgba(15,23,42,0.6)' : '#ffffff', padding: 24, borderRadius: 12, border: `1px solid ${isDark ? 'rgba(2,132,199,0.2)' : '#e2e8f0'}` }}>
                            <SectionHeader icon={<PieChartOutlined />} text="Summary Overview" isDark={isDark} />
                            <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                                <Col xs={12} md={8}><MetricCard label={`Total ${mode}s`} value={result.summary.total_entities} sub="Across both periods" isDark={isDark} /></Col>
                                <Col xs={12} md={8}><MetricCard label="New in Period B" value={result.summary.new_entities} sub="Not in Period A" isDark={isDark} /></Col>
                                <Col xs={12} md={8}><MetricCard label="Absent in Period B" value={result.summary.lost_entities} sub="Only in Period A" isDark={isDark} /></Col>
                                <Col xs={12} md={8}><MetricCard label="Total GMV (B)" value={fmtCurrency(result.summary.total_gmv_b)} sub={`${result.summary.gmv_change >= 0 ? '+' : ''}${(result.summary.gmv_change * 100).toFixed(1)}% vs Period A`} isDark={isDark} /></Col>
                                <Col xs={12} md={8}><MetricCard label="Total NMV (B)" value={fmtCurrency(result.summary.total_nmv_b)} sub={`${result.summary.nmv_change >= 0 ? '+' : ''}${(result.summary.nmv_change * 100).toFixed(1)}% vs Period A`} isDark={isDark} /></Col>
                                <Col xs={12} md={8}><MetricCard label="Total Items Sold (B)" value={fmtNum(result.summary.total_items_b)} sub={`vs ${fmtNum(result.summary.total_items_a)} in A`} isDark={isDark} /></Col>
                            </Row>

                            <SectionHeader icon={<TrophyOutlined />} text={`Top 5 ${mode} Highlights`} isDark={isDark} />
                            <Row gutter={[16, 16]}>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest GMV — Period B" data={result.top5.gmv_b} isDark={isDark} /></Col>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest NMV — Period B" data={result.top5.nmv_b} isDark={isDark} /></Col>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest Items Sold — Period B" data={result.top5.item_b} isDark={isDark} /></Col>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest GMV Growth" data={result.top5.gmv_growth} isDark={isDark} /></Col>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest NMV Growth" data={result.top5.nmv_growth} isDark={isDark} /></Col>
                                <Col xs={24} md={12} xl={8}><Top5Box title="Highest Items Sold Growth" data={result.top5.item_growth} isDark={isDark} /></Col>
                            </Row>

                            <SectionHeader icon={<OrderedListOutlined />} text="Comprehensive Comparison Table" isDark={isDark} />
                            <Table
                                columns={buildColumns()}
                                dataSource={result.table}
                                pagination={{ pageSize: 15 }}
                                scroll={{ x: 'max-content' }}
                                size="small"
                                bordered
                                onRow={(_, idx) => ({ style: { background: isDark ? (idx % 2 === 0 ? 'rgba(30,41,59,0.8)' : 'rgba(15,23,42,0.8)') : (idx % 2 === 0 ? '#ffffff' : '#f8fafc') } })}
                            />

                            <Divider />
                            <Button block size="large" onClick={downloadExcel} icon={<FileExcelOutlined />} style={{ height: 56, borderRadius: 8, background: '#10b981', color: '#fff', fontSize: 15, border: 'none', fontWeight: 600 }}>
                                Download Full Report (Excel)
                            </Button>
                        </div>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default AffiliateAnalyzer;
