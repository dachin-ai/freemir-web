import React, { useState } from 'react';
import {
    Typography, Button, Row, Col, Upload, message, Spin, Divider, Select
} from 'antd';
import {
    InboxOutlined, CloudUploadOutlined, FileExcelOutlined,
    WarningOutlined, CheckCircleFilled, DollarOutlined, LineChartOutlined,
    SettingOutlined, UnorderedListOutlined, FolderOpenOutlined, BarChartOutlined, FundOutlined
} from '@ant-design/icons';
import api from '../api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import Bi from '../components/Bi';
import PageHeader from '../components/PageHeader';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

const SectionHeading = ({ icon, children, color = '#f97316' }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: `${color}20`, border: `1px solid ${color}35`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: color, fontSize: 14, flexShrink: 0 }}>{icon}</span>
        {children}
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

const OrderLossReview = () => {
    const { t } = useTranslation();
    const [fileList, setFileList] = useState([]);
    const [priceType, setPriceType] = useState('Warning');
    const [method, setMethod] = useState('Profit Review');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { logActivity } = useAuth();

    const handleUpload = async () => {
        if (!fileList.length) {
            message.warning(t('orderLoss.uploadWarn'));
            return;
        }

        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('price_type', priceType);
        formData.append('method', method);

        setLoading(true);
        setResult(null);

        try {
            const res = await api.post('/order-loss/calculate', formData);
            setResult(res.data);
            message.success(t('orderLoss.auditComplete'));
            logActivity('Order Loss Review');
        } catch (err) {
            message.error(err.response?.data?.detail || t('orderLoss.calcFail'));
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
        Object.assign(document.createElement('a'), { href: url, download: `Pricing_Pnl_Audit_${priceType}.xlsx` }).click();
    };

    return (
        <div>
            <PageHeader
                title={<Bi i18nKey="orderLoss.title" />}
                subtitle={<Bi i18nKey="orderLoss.subtitle" />}
                accent="#f97316"
            />

            <Row gutter={24}>
                {/* CONFIGURATION */}
                <Col xs={24} md={8}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 24 }}>
                        <SectionHeading icon={<SettingOutlined />}><Bi i18nKey="orderLoss.auditConfig" /></SectionHeading>
                        <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 16 }}>
                            <Bi i18nKey="orderLoss.selectMethod" />
                        </Text>
                        <Select
                            size="large"
                            value={method}
                            onChange={setMethod}
                            style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
                        >
                            <Option value="Profit Review">Profit Review</Option>
                            <Option value="Pre-Sales Review">Pre-Sales Review</Option>
                        </Select>

                        {method === 'Profit Review' && (
                            <>
                                <Text style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 16 }}>
                                    <Bi i18nKey="orderLoss.selectBasePrice" />
                                </Text>
                                <Select
                                    size="large"
                                    value={priceType}
                                    onChange={setPriceType}
                                    style={{ width: '100%', borderRadius: 8 }}
                                >
                                    <Option value="Warning">Warning Base Price</Option>
                                    <Option value="Daily-Top-Creator">Daily-Top-Creator</Option>
                                    <Option value="DD-Top-Creator">DD-Top-Creator</Option>
                                    <Option value="PD-Top-Creator">PD-Top-Creator</Option>
                                </Select>
                            </>
                        )}

                        <Divider style={{ borderColor: 'var(--border)', margin: '24px 0' }} />

                            <SectionHeading icon={<UnorderedListOutlined />}><Bi i18nKey="orderLoss.requirements" /></SectionHeading>
                        <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 20, margin: 0 }}>
                            <li style={{ marginBottom: 6 }}>Store (店铺)</li>
                            <li style={{ marginBottom: 6 }}>Original Order Number (原始单号)</li>
                            <li style={{ marginBottom: 6 }}>ERP Order Number (ERP单号)</li>
                            <li style={{ marginBottom: 6 }}>Online Product Code (线上商品编码)</li>
                            <li style={{ marginBottom: 6 }}>System Product Code (系统商品编码)</li>
                            {method === 'Profit Review' && (
                                <>
                                    <li style={{ marginBottom: 6 }}>Product Detail Gross Profit (商品明细毛利)</li>
                                    <li style={{ marginBottom: 6 }}>Amount After Discount (商品实付金额)</li>
                                    <li style={{ marginBottom: 0 }}>Seller Coupon (卖家优惠券)</li>
                                </>
                            )}
                            {method === 'Pre-Sales Review' && (
                                <>
                                    <li style={{ marginBottom: 6 }}>Qty (商品数量)</li>
                                    <li style={{ marginBottom: 0 }}>Order Label (订单标签 / Label)</li>
                                </>
                            )}
                        </ul>
                    </div>
                </Col>

                {/* UPLOAD & PROCESS */}
                <Col xs={24} md={16}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px' }}>
                            <SectionHeading icon={<FolderOpenOutlined />}><Bi i18nKey="orderLoss.uploadFile" /></SectionHeading>
                        <Dragger
                            maxCount={1}
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
                            <p className="ant-upload-text" style={{ color: 'var(--text-main)', fontSize: 16 }}>
                                <Bi i18nKey="orderLoss.uploadErp" />
                            </p>
                            <p className="ant-upload-hint" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                <Bi i18nKey="orderLoss.fileTypes" />
                            </p>
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
                            {loading ? <Bi i18nKey="orderLoss.running" /> : <Bi i18nKey="orderLoss.startAudit" />}
                        </Button>
                    </div>

                    {/* RESULTS */}
                    {result && !loading && (
                        <div style={{ marginTop: 24 }}>
                            <Divider style={{ borderColor: 'var(--border)' }} />
                            <SectionHeading icon={<BarChartOutlined />}><Bi i18nKey="orderLoss.outputSummary" /></SectionHeading>

                            {method === 'Profit Review' ? (
                                <>
                                    <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
                                        <Col xs={24} md={8}>
                                            <div style={{...statCardStyle('#3b82f6', 'rgba(59, 130, 246, 0.15)'), borderLeft: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', color: 'white' }}>
                                                <Text style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    Total Orders | 总订单数
                                                </Text>
                                                <div style={{ fontSize: 42, color: '#fff', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.total_orders.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <div style={{...statCardStyle('#10b981', 'rgba(16, 185, 129, 0.05)'), borderLeft: '4px solid #10b981' }}>
                                                <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    Safe Orders | 安全订单
                                                </Text>
                                                <div style={{ fontSize: 42, color: '#10b981', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.safe_orders.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <div style={{...statCardStyle('#ec4899', 'rgba(236, 72, 153, 0.05)'), borderLeft: '4px solid #ec4899' }}>
                                                <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    Diagnosed Issues | 诊断问题
                                                </Text>
                                                <div style={{ fontSize: 42, color: '#ec4899', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.review_orders.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <SectionHeading icon={<FundOutlined />}>Financial Summary | 财务摘要</SectionHeading>
                                    
                                    <Row gutter={[16, 16]} style={{ marginBottom: 32, display: 'flex' }}>
                                        <Col style={{ flex: '1 1 20%', minWidth: 150 }}>
                                            <div style={{...statCardStyle('#3b82f6', 'rgba(59,130,246,0.1)'), border: 'none', borderLeft: '4px solid #3b82f6', background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' }}>
                                                <Text style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    <Bi i18nKey="orderLoss.totalTx" />
                                                </Text>
                                                <div style={{ fontSize: 26, color: '#fff', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.total_transactions.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col style={{ flex: '1 1 20%', minWidth: 150 }}>
                                            <div style={{...statCardStyle('#f59e0b', 'rgba(245,158,11,0.05)'), border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b' }}>
                                                <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    <Bi i18nKey="orderLoss.salesLoss" />
                                                </Text>
                                                <div style={{ fontSize: 26, color: '#f59e0b', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.sales_loss.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col style={{ flex: '1 1 20%', minWidth: 150 }}>
                                            <div style={{...statCardStyle('#ec4899', 'rgba(236,72,153,0.05)'), border: '1px solid var(--border)', borderLeft: '4px solid #ec4899' }}>
                                                <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    <Bi i18nKey="orderLoss.afterSalesLoss" />
                                                </Text>
                                                <div style={{ fontSize: 26, color: '#ec4899', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.aftersales_loss.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col style={{ flex: '1 1 20%', minWidth: 150 }}>
                                            <div style={{...statCardStyle('#10b981', 'rgba(16,185,129,0.05)'), border: '1px solid var(--border)', borderLeft: '4px solid #10b981' }}>
                                                <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    <Bi i18nKey="orderLoss.totalProfit" />
                                                </Text>
                                                <div style={{ fontSize: 26, color: '#10b981', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.total_profit.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                        <Col style={{ flex: '1 1 20%', minWidth: 150 }}>
                                            <div style={{...statCardStyle('#f8fafc', 'transparent'), border: '1px solid var(--border)', borderLeft: '4px solid #475569' }}>
                                                <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                    <Bi i18nKey="orderLoss.finalProfit" />
                                                </Text>
                                                <div style={{ fontSize: 26, color: 'var(--text-main)', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                    {result.summary.final_profit.toLocaleString()}
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                </>
                            ) : (
                                <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
                                    <Col xs={24} md={8}>
                                        <div style={{...statCardStyle('#3b82f6', 'rgba(59, 130, 246, 0.15)'), borderLeft: 'none', background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', color: 'white' }}>
                                            <Text style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                <Bi i18nKey="orderLoss.rowsAnalyzed" />
                                            </Text>
                                            <div style={{ fontSize: 42, color: '#fff', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                {result.summary.total_orders.toLocaleString()}
                                            </div>
                                        </div>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <div style={{...statCardStyle('#10b981', 'rgba(16, 185, 129, 0.05)'), borderLeft: '4px solid #10b981' }}>
                                            <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                <Bi i18nKey="orderLoss.presaleRows" />
                                            </Text>
                                            <div style={{ fontSize: 42, color: '#10b981', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                {result.summary.review_orders.toLocaleString()}
                                            </div>
                                        </div>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <div style={{...statCardStyle('#a855f7', 'rgba(168, 85, 247, 0.05)'), borderLeft: '4px solid #a855f7' }}>
                                            <Text style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                                                <Bi i18nKey="orderLoss.presaleUnits" />
                                            </Text>
                                            <div style={{ fontSize: 42, color: '#a855f7', fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>
                                                {result.summary.total_profit.toLocaleString()}
                                            </div>
                                        </div>
                                    </Col>
                                </Row>
                            )}

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
                                {method === 'Profit Review' ? <Bi i18nKey="orderLoss.downloadProfit" /> : <Bi i18nKey="orderLoss.downloadPresales" />}
                            </Button>
                        </div>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default OrderLossReview;
