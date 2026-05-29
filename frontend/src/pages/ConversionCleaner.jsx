import React, { useState } from 'react';
import { Typography, Button, Row, Col, Upload, message, Divider, Table, Tabs } from 'antd';
import { InboxOutlined, CloudUploadOutlined, FileExcelOutlined,
    DollarOutlined, ArrowLeftOutlined, UserOutlined, AppstoreOutlined
} from '@ant-design/icons';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const SectionHeading = ({ emoji, children }) => (
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span>{emoji}</span> {children}
    </div>
);

const StatCard = ({ label, value, color, prefix }) => (
    <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderLeft: `4px solid ${color}`, borderRadius: 12,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4
    }}>
        <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
        </Text>
        <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'Outfit', sans-serif" }}>
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
        </div>
    </div>
);

const Top5Table = ({ data, metricLabel }) => {
    const cols = [
        { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
        {
            title: metricLabel, dataIndex: 'value', key: 'value', align: 'right',
            render: (val) => <Text strong style={{ color: '#0ea5e9' }}>{Number(val).toLocaleString()}</Text>
        }
    ];
    return (
        <Table
            dataSource={data} columns={cols}
            rowKey={(_, i) => i} pagination={false} size="small"
            style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}
        />
    );
};

const ConversionCleaner = () => {
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { logActivity } = useAuth();

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning('Please upload a CSV file first');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileList[0]);

        setLoading(true);
        setResult(null);

        try {
            const res = await api.post('/conversion-cleaner/calculate', formData);
            setResult(res.data);
            message.success('Data processed successfully!');
            logActivity('Conversion Cleaner');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Processing failed. Check your CSV file structure.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!result?.file_base64) return;
        const bytes = atob(result.file_base64);
        const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const date = result.stats?.date_range?.split(' ')[0] || 'report';
        Object.assign(document.createElement('a'), { href: url, download: `Cleaned_Conversion_${date}.xlsx` }).click();
    };

    const previewColumns = result
        ? Object.keys(result.preview[0] || {}).map(k => ({
            title: k, dataIndex: k, key: k, ellipsis: true, width: 140
        }))
        : [];

    const tabItems = result ? [
        {
            key: 'purchase',
            label: '💰 Purchase Value',
            children: (
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Items</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Purchase Value'].top_items} metricLabel="Purchase Value" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Affiliates</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Purchase Value'].top_affiliates} metricLabel="Purchase Value" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Channels</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Purchase Value'].top_channels} metricLabel="Purchase Value" /></div></Col>
                </Row>
            )
        },
        {
            key: 'refund',
            label: '💸 Refund Amount',
            children: (
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Items</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Refund Amount'].top_items} metricLabel="Refund Amount" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Affiliates</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Refund Amount'].top_affiliates} metricLabel="Refund Amount" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Channels</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Refund Amount'].top_channels} metricLabel="Refund Amount" /></div></Col>
                </Row>
            )
        },
        {
            key: 'commission',
            label: '🏷️ Commission',
            children: (
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Items</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Item Brand Commission'].top_items} metricLabel="Commission" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Affiliates</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Item Brand Commission'].top_affiliates} metricLabel="Commission" /></div></Col>
                    <Col xs={24} md={8}><Text style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>Top 5 Channels</Text><div style={{ marginTop: 8 }}><Top5Table data={result.summaries['Item Brand Commission'].top_channels} metricLabel="Commission" /></div></Col>
                </Row>
            )
        }
    ] : [];

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0, fontFamily: "'Outfit', sans-serif", color: 'var(--text-main)', fontWeight: 800 }}>
                    Conversion Report Cleaner
                </Title>
                <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Upload CSV → Extract Columns → Group Channels → Top 5 Summary
                </Text>
            </div>

            <Row gutter={24}>
                {/* LEFT: Info / Reqmt */}
                <Col xs={24} md={7}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 24 }}>
                        <SectionHeading emoji="📋">File Requirements</SectionHeading>
                        <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>
                            Upload a Shopee <strong style={{ color: 'var(--text-main)' }}>CSV</strong> Seller Conversion Report containing at least <strong style={{ color: '#0ea5e9' }}>34 columns</strong>.
                        </Text>
                        <div style={{ background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text-main)' }}>Extracted Columns:</div>
                                {['Order Status', 'Order Time', 'Item ID', 'Model ID', 'Price', 'Affiliate Username', 'Purchase Value', 'Refund Amount', 'Item Brand Commission', 'Commission Rate', 'Original Channel'].map(c => (
                                    <div key={c} style={{ marginBottom: 3 }}>→ {c}</div>
                                ))}
                            </div>
                        </div>
                        <Divider style={{ borderColor: 'var(--border)', margin: '20px 0' }} />
                        <SectionHeading emoji="⚡">Auto Processing</SectionHeading>
                        <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 20, margin: 0 }}>
                            <li style={{ marginBottom: 5 }}>Date extraction from Order Time</li>
                            <li style={{ marginBottom: 5 }}>Currency columns cleaned to integers</li>
                            <li style={{ marginBottom: 5 }}>Channel grouping (Live / Video / Social Media)</li>
                            <li>Top 5 ranking by Purchase, Refund, Commission</li>
                        </ul>
                    </div>
                </Col>

                {/* RIGHT: Upload + Results */}
                <Col xs={24} md={17}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>
                        <SectionHeading emoji="📂">Upload Conversion Report</SectionHeading>
                        <Dragger
                            maxCount={1}
                            accept=".csv"
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
                                    <Text style={{ color: '#38bdf8', fontSize: 14, fontWeight: 500 }}>
                                        📄 {file.name}
                                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                            {file.size ? '(' + (file.size / 1024 / 1024 > 1 ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : (file.size / 1024).toFixed(2) + ' KB') + ')' : ''}
                                        </span>
                                    </Text>
                                    <Button type="text" size="small" danger onClick={remove} style={{ fontSize: 12, color: '#ef4444' }}>
                                        Remove
                                    </Button>
                                </div>
                            )}
                        >
                            <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: '#38bdf8' }} /></p>
                            <p className="ant-upload-text" style={{ color: 'var(--text-main)', fontSize: 16 }}>Click or drag a Conversion CSV here</p>
                            <p className="ant-upload-hint" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Shopee SellerConversionReport format only (.csv)</p>
                        </Dragger>
                        <Button type="primary" className="fm-btn-primary" block loading={loading} onClick={handleUpload} icon={<CloudUploadOutlined />}
                            style={{ height: 48, borderRadius: 10, fontWeight: 700, fontSize: 15 }}>
                            {loading ? 'Processing Report...' : 'Clean & Analyze'}
                        </Button>
                    </div>

                    {/* RESULTS */}
                    {result && !loading && (
                        <div style={{ marginTop: 24 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />

                            {/* Date Range Badge */}
                            <div style={{ background: 'rgba(2,132,199,0.1)', border: '1px solid rgba(2,132,199,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span>📅</span>
                                <Text style={{ color: '#38bdf8', fontWeight: 600, fontSize: 13 }}>Period: {result.stats.date_range}</Text>
                            </div>

                            {/* Stats Row */}
                            <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                                <Col xs={12} md={8}>
                                    <StatCard label="Total Rows" value={result.stats.total_rows} color="#0ea5e9" />
                                </Col>
                                <Col xs={12} md={8}>
                                    <StatCard label="Unique Affiliates" value={result.stats.unique_affiliates} color="#06b6d4" />
                                </Col>
                                <Col xs={24} md={8}>
                                    <StatCard label="Total Purchase Value" value={result.stats.total_purchase} color="#10b981" prefix="Rp " />
                                </Col>
                                <Col xs={12} md={12}>
                                    <StatCard label="Total Refund" value={result.stats.total_refund} color="#ef4444" prefix="Rp " />
                                </Col>
                                <Col xs={12} md={12}>
                                    <StatCard label="Total Commission" value={result.stats.total_commission} color="#f59e0b" prefix="Rp " />
                                </Col>
                            </Row>

                            {/* Summary Tabs */}
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 24 }}>
                                <SectionHeading emoji="📊">Analytics Summary</SectionHeading>
                                <Tabs items={tabItems} />
                            </div>

                            {/* Detailed Preview */}
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px', marginBottom: 24 }}>
                                <SectionHeading emoji="📋">Detailed Data Preview (Top 10)</SectionHeading>
                                <Table
                                    dataSource={result.preview}
                                    columns={previewColumns}
                                    pagination={false}
                                    rowKey={(_, i) => i}
                                    size="small"
                                    scroll={{ x: 'max-content' }}
                                />
                            </div>

                            {/* Download */}
                            <Button size="large" onClick={handleDownload} icon={<FileExcelOutlined />}
                                style={{ height: 54, borderRadius: 8, fontWeight: 700, fontSize: 15, background: '#10b981', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', width: '100%' }}>
                                Download Cleaned Report (.xlsx)
                            </Button>
                        </div>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default ConversionCleaner;
