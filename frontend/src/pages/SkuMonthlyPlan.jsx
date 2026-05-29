import React, { useState } from 'react';
import { Typography, Button, Row, Col, Upload, message, Divider, DatePicker, Input, Table } from 'antd';
import { InboxOutlined, CloudUploadOutlined, FileExcelOutlined, CalendarOutlined, TagOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const SectionHeading = ({ emoji, children }) => (
    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span>{emoji}</span> {children}
    </div>
);

const statCardStyle = (accentColor, bgColor) => ({
    background: bgColor,
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${accentColor}`,
    borderRadius: 12,
    padding: '20px 16px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center'
});

const SkuMonthlyPlan = () => {
    const [fileList, setFileList] = useState([]);
    const [targetDate, setTargetDate] = useState(dayjs('2026-01-01'));
    const [brand, setBrand] = useState('freemir');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { logActivity } = useAuth();

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning('Please upload an Excel file first');
            return;
        }
        if (!brand.trim()) {
            message.warning('Please enter a Brand name');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('target_date', targetDate.format('YYYY-MM-DD'));
        formData.append('brand', brand.trim());

        setLoading(true);
        setResult(null);

        try {
            const res = await api.post('/sku-plan/calculate', formData);
            setResult(res.data);
            message.success('Data successfully processed & formatted!');
            logActivity('SKU Monthly Plan');
        } catch (err) {
            message.error(err.response?.data?.detail || 'Formatting failed. Please check the file structure.');
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
        Object.assign(document.createElement('a'), { href: url, download: `Cleaned_${brand}_${targetDate.format('YYYY-MM-DD')}.xlsx` }).click();
    };

    const columns = [
        { title: 'Month', dataIndex: '月份/Month', key: 'month' },
        { title: 'Brand', dataIndex: '品牌/Brand', key: 'brand' },
        { title: 'Platform', dataIndex: '平台/Platform', key: 'platform' },
        { title: 'Store', dataIndex: '店铺/Store', key: 'store' },
        { title: 'SKU', dataIndex: 'SKU', key: 'sku', render: (text) => <Text strong style={{ color: 'var(--indigo)' }}>{text}</Text> },
        { title: 'Grade', dataIndex: '产品等级/Product grade', key: 'grade' },
        { title: 'Goal', dataIndex: '月目标/Monthly goal', key: 'goal', render: (val) => val.toLocaleString() },
    ];

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0, fontFamily: "'Outfit', sans-serif", color: 'var(--text-main)', fontWeight: 800 }}>
                    SKU Target Cleaner
                </Title>
                <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Automated Formatting for Monthly SKU Plans
                </Text>
            </div>

            <Row gutter={24}>
                {/* SETTINGS */}
                <Col xs={24} md={8}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 24 }}>
                        <SectionHeading emoji="⚙️">Configuration</SectionHeading>
                        <div style={{ marginBottom: 16 }}>
                            <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                                <CalendarOutlined /> Target Month / Date
                            </Text>
                            <DatePicker 
                                size="large" 
                                style={{ width: '100%', borderRadius: 8 }} 
                                value={targetDate} 
                                onChange={setTargetDate} 
                                allowClear={false}
                            />
                        </div>
                        <div>
                            <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                                <TagOutlined /> Target Brand
                            </Text>
                            <Input 
                                size="large" 
                                style={{ width: '100%', borderRadius: 8 }} 
                                value={brand} 
                                onChange={(e) => setBrand(e.target.value)} 
                                placeholder="e.g., freemir"
                            />
                        </div>

                        <Divider style={{ borderColor: 'var(--border)', margin: '24px 0' }} />

                        <SectionHeading emoji="📋">File Requirements</SectionHeading>
                        <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>
                            Upload an Excel file containing exactly these two sheets:
                        </Text>
                        <div style={{ background: 'var(--bg-panel)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>📄 SKU Target</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Columns configured as 'STORE_CODE - Platform Name' for target units.</div>
                            
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>📄 SKU Grade</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Column 1: SKU, Column 2: Grade (A, B, C, etc.)</div>
                        </div>
                    </div>
                </Col>

                {/* FILE UPLOAD & ACTIONS */}
                <Col xs={24} md={16}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>
                        <SectionHeading emoji="📂">Upload Source File</SectionHeading>
                        <Dragger
                            maxCount={1}
                            accept=".xlsx"
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
                            <p className="ant-upload-text" style={{ color: 'var(--text-main)', fontSize: 16 }}>Click or drag Excel File here</p>
                            <p className="ant-upload-hint" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Only .xlsx format is supported.</p>
                        </Dragger>

                        <Button
                            type="primary"
                            className="fm-btn-primary"
                            block
                            loading={loading}
                            onClick={handleUpload}
                            icon={<CloudUploadOutlined />}
                            style={{
                                height: 48, borderRadius: 10, fontWeight: 700, fontSize: 15,
                            }}
                        >
                            {loading ? 'Processing & Formatting Data...' : 'Process Data'}
                        </Button>
                    </div>

                    {/* RESULTS SECTION */}
                    {result && !loading && (
                        <div style={{ marginTop: 24 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />
                            <SectionHeading emoji="✨">Transformation Summary</SectionHeading>

                            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                                <Col xs={24} sm={12} md={6}>
                                    <div style={statCardStyle('var(--indigo)', 'rgba(2,132,199,0.05)')}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif" }}>
                                            {result.summary.total_rows.toLocaleString()}
                                        </div>
                                        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--indigo)', textTransform: 'uppercase' }}>
                                            Output Rows
                                        </Text>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12} md={6}>
                                    <div style={statCardStyle('#06b6d4', 'rgba(6,182,212,0.05)')}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif" }}>
                                            {result.summary.unique_skus.toLocaleString()}
                                        </div>
                                        <Text style={{ fontSize: 11, fontWeight: 600, color: '#06b6d4', textTransform: 'uppercase' }}>
                                            Unique SKUs
                                        </Text>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12} md={6}>
                                    <div style={statCardStyle('#0ea5e9', 'rgba(14,165,233,0.05)')}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif" }}>
                                            {result.summary.unique_stores.toLocaleString()}
                                        </div>
                                        <Text style={{ fontSize: 11, fontWeight: 600, color: '#0ea5e9', textTransform: 'uppercase' }}>
                                            Stores Audited
                                        </Text>
                                    </div>
                                </Col>
                                <Col xs={24} sm={12} md={6}>
                                    <div style={statCardStyle('#10b981', 'rgba(16,185,129,0.05)')}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', fontFamily: "'Outfit', sans-serif" }}>
                                            {result.summary.total_goals.toLocaleString()}
                                        </div>
                                        <Text style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                            Combined Goals
                                        </Text>
                                    </div>
                                </Col>
                            </Row>

                            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 24 }}>
                                <SectionHeading emoji="👁️">Data Preview (Top 10)</SectionHeading>
                                <Table 
                                    dataSource={result.preview} 
                                    columns={columns} 
                                    pagination={false}
                                    rowKey={(record, idx) => idx}
                                    size="small"
                                    scroll={{ x: 'max-content' }}
                                />
                            </div>

                            <Button
                                size="large"
                                onClick={handleDownload}
                                icon={<FileExcelOutlined />}
                                style={{
                                    height: 54, borderRadius: 8, fontWeight: 700, fontSize: 15,
                                    background: '#10b981', color: '#fff', border: 'none',
                                    boxShadow: '0 4px 14px rgba(16,185,129,0.3)', width: '100%',
                                }}
                            >
                                Download Formatted Results (.xlsx)
                            </Button>
                        </div>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default SkuMonthlyPlan;
