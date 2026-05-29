import React, { useState } from 'react';
import { Typography, Button, Row, Col, Upload, message, Divider, Table, Tabs, Tag } from 'antd';
import { InboxOutlined, ScanOutlined, FileExcelOutlined, CheckCircleFilled, WarningFilled, AimOutlined } from '@ant-design/icons';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const SectionHeading = ({ emoji, children }) => (
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span>{emoji}</span> {children}
    </div>
);

const MetricCard = ({ label, value, color, gradient, icon }) => (
    <div style={{
        background: gradient || 'var(--bg-card)',
        border: `1px solid ${color}40`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 12,
        padding: '20px 16px',
        textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
    }}>
        {icon && <div style={{ fontSize: 20 }}>{icon}</div>}
        <div style={{ fontSize: 32, fontWeight: 900, color, fontFamily: "'Outfit', sans-serif" }}>
            {value}
        </div>
        <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
        </Text>
    </div>
);

const MatchCell = ({ value }) => {
    if (value === 'Match') return <Tag color="green" style={{ fontWeight: 700 }}>✅ Match</Tag>;
    if (value === 'Not Match') return <Tag color="red" style={{ fontWeight: 700 }}>❌ Not Match</Tag>;
    return <span>{value}</span>;
};

const OrderMatchChecker = () => {
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { logActivity } = useAuth();

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning('Please upload an Excel or CSV file first');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileList[0]);

        setLoading(true);
        setResult(null);

        try {
            const res = await api.post('/order-match/calculate', formData);
            setResult(res.data);
            message.success('Order matching complete!');
            logActivity('Order Match Checker');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Processing failed. Check your file structure.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!result?.file_base64) return;
        const bytes = atob(result.file_base64);
        const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'Order_Match_Result.xlsx' }).click();
    };

    const buildColumns = (colNames) => colNames.map(k => ({
        title: k,
        dataIndex: k,
        key: k,
        ellipsis: true,
        width: k === 'Product Match' ? 140 : k === 'Reason' ? 220 : 160,
        render: (val) => k === 'Product Match' ? <MatchCell value={val} /> : <span>{val}</span>
    }));

    const tabItems = result ? [
        {
            key: 'sheet1',
            label: '📊 Detailed Verification',
            children: (
                <Table
                    dataSource={result.preview_sheet1}
                    columns={buildColumns(result.columns_sheet1)}
                    rowKey={(_, i) => i}
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content', y: 400 }}
                    rowClassName={(row) => row['Product Match'] === 'Not Match' ? 'error-row' : ''}
                />
            )
        },
        {
            key: 'sheet2',
            label: `⚠️ Unmatched Orders (${result.metrics.unmatched_orders})`,
            children: result.preview_sheet2.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <CheckCircleFilled style={{ fontSize: 48, color: '#10b981' }} />
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981', marginTop: 12 }}>100% Accuracy — No Anomalies Found!</div>
                </div>
            ) : (
                <Table
                    dataSource={result.preview_sheet2}
                    columns={buildColumns(result.columns_sheet2)}
                    rowKey={(_, i) => i}
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content', y: 400 }}
                />
            )
        }
    ] : [];

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0, fontFamily: "'Outfit', sans-serif", color: 'var(--text-main)', fontWeight: 800 }}>
                    Order Match Checker
                </Title>
                <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Cross-reference validation for Multiplatform Orders vs System ERP
                </Text>
            </div>

            <Row gutter={24}>
                {/* Info Panel */}
                <Col xs={24} md={7}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 24 }}>
                        <SectionHeading emoji="📋">Required Columns</SectionHeading>
                        <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>
                            Column positions are <strong style={{ color: 'var(--text-main)' }}>auto-detected</strong> by name (case-insensitive):
                        </Text>
                        {['Original Order Number', 'Online Product Code', 'Online Product SKU ID', 'System Product Code'].map(col => (
                            <div key={col} style={{ background: 'var(--bg-panel)', borderRadius: 6, padding: '8px 12px', marginBottom: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-main)', fontWeight: 500 }}>
                                🔑 {col}
                            </div>
                        ))}

                        <Divider style={{ borderColor: 'var(--border)', margin: '20px 0' }} />
                        <SectionHeading emoji="⚙️">Match Logic</SectionHeading>
                        <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 18, margin: 0 }}>
                            <li style={{ marginBottom: 6 }}>Groups rows by Order + SKU ID</li>
                            <li style={{ marginBottom: 6 }}>Parses <code style={{ color: '#38bdf8' }}>Online Product Code</code> (split by <code>+</code>)</li>
                            <li style={{ marginBottom: 6 }}>Compares against <code style={{ color: '#38bdf8' }}>System Product Code</code></li>
                            <li>Labels each group as <strong style={{ color: '#10b981' }}>Match</strong> or <strong style={{ color: '#ef4444' }}>Not Match</strong> with reason</li>
                        </ul>
                    </div>
                </Col>

                {/* Upload + Results */}
                <Col xs={24} md={17}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>
                        <SectionHeading emoji="📂">Upload Order Export</SectionHeading>
                        <Dragger
                            maxCount={1}
                            accept=".xlsx,.csv"
                            beforeUpload={(file) => { setFileList([file]); return false; }}
                            onRemove={() => setFileList([])}
                            fileList={fileList}
                            style={{ borderRadius: 8, marginBottom: 24, padding: '20px 0' }}
                            itemRender={(_, file, __, { remove }) => (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: 'rgba(56,189,248,0.1)', border: '1px solid #38bdf8', borderRadius: 6,
                                    padding: '8px 12px', marginTop: 16,
                                }}>
                                    <Text style={{ color: '#38bdf8', fontSize: 14, fontWeight: 500 }}>📄 {file.name}
                                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                            {file.size ? '(' + (file.size / 1024 / 1024 > 1 ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : (file.size / 1024).toFixed(2) + ' KB') + ')' : ''}
                                        </span></Text>
                                    <Button type="text" size="small" danger onClick={remove} style={{ fontSize: 12, color: '#ef4444' }}>Remove</Button>
                                </div>
                            )}
                        >
                            <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#38bdf8' }} /></p>
                            <p className="ant-upload-text" style={{ color: 'var(--text-main)', fontSize: 16 }}>Click or drag an Order Export file here</p>
                            <p className="ant-upload-hint" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Supports .xlsx and .csv files. Header names auto-detected.</p>
                        </Dragger>

                        <Button type="primary" className="fm-btn-primary" block loading={loading} onClick={handleUpload} icon={<ScanOutlined />}
                            style={{ height: 48, borderRadius: 10, fontWeight: 700, fontSize: 15 }}>
                            {loading ? 'Running Match Verification...' : 'Run Order Match Check'}
                        </Button>
                    </div>

                    {/* RESULTS */}
                    {result && !loading && (
                        <div style={{ marginTop: 24 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />
                            <SectionHeading emoji="📈">Executive Summary</SectionHeading>

                            <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                                <Col xs={12} md={6}>
                                    <MetricCard label="Total Orders" value={result.metrics.total_orders.toLocaleString()} color="#0ea5e9" />
                                </Col>
                                <Col xs={12} md={6}>
                                    <MetricCard label="Matched Orders" value={result.metrics.matched_orders.toLocaleString()} color="#10b981" icon="✅" />
                                </Col>
                                <Col xs={12} md={6}>
                                    <MetricCard label="Unmatched" value={result.metrics.unmatched_orders.toLocaleString()} color="#ef4444" icon="⚠️" />
                                </Col>
                                <Col xs={12} md={6}>
                                    <MetricCard
                                        label="Match Rate"
                                        value={`${result.metrics.accuracy}%`}
                                        color={result.metrics.accuracy >= 95 ? '#10b981' : result.metrics.accuracy >= 80 ? '#f59e0b' : '#ef4444'}
                                        icon="🎯"
                                    />
                                </Col>
                            </Row>

                            {/* Accuracy Progress Bar */}
                            <div style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>OVERALL MATCH ACCURACY</Text>
                                    <Text style={{ fontSize: 12, color: result.metrics.accuracy >= 95 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>{result.metrics.accuracy}%</Text>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 999,
                                        width: `${result.metrics.accuracy}%`,
                                        background: result.metrics.accuracy >= 95 ? 'linear-gradient(90deg, #10b981, #34d399)' : result.metrics.accuracy >= 80 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                                        transition: 'width 1s ease'
                                    }} />
                                </div>
                            </div>

                            {/* Data Tables tabs */}
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 24 }}>
                                <Tabs items={tabItems} />
                            </div>

                            <Button size="large" onClick={handleDownload} icon={<FileExcelOutlined />}
                                style={{ height: 54, borderRadius: 8, fontWeight: 700, fontSize: 15, background: '#10b981', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', width: '100%' }}>
                                Download Full Analysis Report (.xlsx)
                            </Button>
                        </div>
                    )}
                </Col>
            </Row>

            <style>{`
                .error-row td { background: rgba(239,68,68,0.04) !important; }
            `}</style>
        </div>
    );
};

export default OrderMatchChecker;
