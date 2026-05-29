import React, { useState } from 'react';
import {
    Typography, Button, Row, Col, Input, InputNumber,
    Radio, Tabs, Checkbox, message, Divider, Table, Tag, Alert
} from 'antd';
import {
    PlayCircleOutlined, FileExcelOutlined, InstagramOutlined,
    EyeOutlined, HeartOutlined, CommentOutlined, LockOutlined
} from '@ant-design/icons';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;
const { TextArea, Password } = Input;

const SectionHeading = ({ emoji, children }) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span>{emoji}</span> {children}
    </div>
);

/* ── Metric Card ── */
const MetricCard = ({ label, value, color }) => (
    <div style={{ background: 'var(--bg-panel)', border: `1px solid ${color}40`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '12px 16px' }}>
        <Text style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>{label}</Text>
        <Text style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Outfit', sans-serif" }}>{value ?? '—'}</Text>
    </div>
);

const SocmedScraping = () => {
    const { logActivity } = useAuth();

    const [token, setToken] = useState('');
    const [platform, setPlatform] = useState('instagram');
    const [mode, setMode] = useState('specific');

    // Specific
    const [url, setUrl] = useState('');
    const [commentsLimit, setCommentsLimit] = useState(0);

    // General
    const [rawLinks, setRawLinks] = useState('');
    const [dedupe, setDedupe] = useState(true);
    const [boostType, setBoostType] = useState('boosted');

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    /* ── Helpers ── */
    const downloadExcel = (b64, filename) => {
        const bytes = atob(b64);
        const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename }).click();
    };

    const handleRun = async () => {
        if (!token.trim()) { message.warning('Please enter your Apify API token'); return; }

        if (mode === 'specific') {
            if (!url.trim()) { message.warning('Please enter a post URL'); return; }
            setLoading(true); setResult(null);
            try {
                const res = await api.post('/socmed/scrape-specific', {
                    token: token.trim(), platform, url: url.trim(), comments_limit: commentsLimit
                });
                setResult(res.data);
                message.success('Scraping complete!');
                logActivity('Socmed Scraper (Specific)');
            } catch (err) {
                message.error(err.response?.data?.detail || 'Scraping failed — check token or URL');
            } finally { setLoading(false); }

        } else {
            if (!rawLinks.trim()) { message.warning('Please paste at least one link'); return; }
            setLoading(true); setResult(null);
            try {
                const res = await api.post('/socmed/scrape-general', {
                    token: token.trim(), platform, raw_links: rawLinks, dedupe,
                    boost_type: platform === 'instagram' ? boostType : null
                });
                setResult(res.data);
                message.success(`Scraped ${res.data.count} post(s)!`);
                logActivity('Socmed Scraper (General)');
            } catch (err) {
                message.error(err.response?.data?.detail || 'Scraping failed — check token or links');
            } finally { setLoading(false); }
        }
    };

    /* ── Render Specific Results ── */
    const renderSpecific = () => {
        if (!result || result.mode !== 'specific') return null;
        const { kv1, kv2, comments, comments_columns } = result;
        const kvCols = [
            { title: 'Field', dataIndex: 'field', key: 'field', width: 160, render: v => <Text style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>{v}</Text> },
            { title: 'Value', dataIndex: 'value', key: 'value', ellipsis: true, render: v => <Text style={{ color: 'var(--text-main)', fontSize: 12 }}>{v}</Text> },
        ];
        const kv1Rows = Object.entries(kv1).map(([field, value]) => ({ field, value, key: field }));
        const kv2Rows = Object.entries(kv2).map(([field, value]) => ({ field, value, key: field }));
        const commentCols = (comments_columns || []).map(c => ({
            title: c, dataIndex: c, key: c, ellipsis: true,
            render: v => <Text style={{ fontSize: 11, color: 'var(--text-main)' }}>{v}</Text>
        }));

        return (
            <div style={{ marginTop: 24 }}>
                <Divider style={{ borderColor: 'var(--border)' }} />

                {/* Metrics Row */}
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                    <Col xs={12} md={6}><MetricCard label="Followers" value={Number(kv1.followers)?.toLocaleString() || kv1.followers} color="#0ea5e9" /></Col>
                    <Col xs={12} md={6}><MetricCard label="Likes" value={Number(kv2.likes)?.toLocaleString() || kv2.likes} color="#ec4899" /></Col>
                    <Col xs={12} md={6}><MetricCard label="Comments" value={Number(kv2.comment_count)?.toLocaleString() || kv2.comment_count} color="#f59e0b" /></Col>
                    <Col xs={12} md={6}><MetricCard label="Views" value={Number(kv2['Video Play Count'])?.toLocaleString() || kv2['Video Play Count']} color="#38bdf8" /></Col>
                </Row>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                    <Tabs defaultActiveKey="1" items={[
                        {
                            key: '1', label: '👤 Profile / General',
                            children: <Table columns={kvCols} dataSource={kv1Rows} pagination={false} size="small" />
                        },
                        {
                            key: '2', label: '📸 Post Info',
                            children: <Table columns={kvCols} dataSource={kv2Rows} pagination={false} size="small" />
                        },
                        {
                            key: '3', label: `💬 Comments (${comments?.length || 0})`,
                            children: comments?.length > 0
                                ? <Table columns={commentCols} dataSource={comments.map((r, i) => ({ ...r, key: i }))} pagination={{ pageSize: 20 }} size="small" scroll={{ x: 'max-content' }} />
                                : <Text style={{ color: 'var(--text-muted)' }}>No comments scraped</Text>
                        },
                    ]} />
                </div>

                <Button block size="large" icon={<FileExcelOutlined />}
                    onClick={() => downloadExcel(result.file_base64, `freemir_${platform}_specific.xlsx`)}
                    style={{ height: 52, borderRadius: 10, fontWeight: 700, fontSize: 15, background: '#10b981', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
                    Download Excel (3 Sheets)
                </Button>
            </div>
        );
    };

    /* ── Render General Results ── */
    const renderGeneral = () => {
        if (!result || result.mode !== 'general') return null;
        const cols = (result.columns || []).map(c => ({
            title: <span style={{ fontSize: 11 }}>{c}</span>, dataIndex: c, key: c, ellipsis: true, width: 120,
            render: v => <Text style={{ fontSize: 11, color: 'var(--text-main)' }}>{v}</Text>
        }));

        return (
            <div style={{ marginTop: 24 }}>
                <Divider style={{ borderColor: 'var(--border)' }} />

                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={8}>
                        <MetricCard label="Posts Scraped" value={result.count} color="#10b981" />
                    </Col>
                    <Col xs={24} md={8}>
                        <MetricCard label="Platform" value={platform === 'instagram' ? 'Instagram' : 'TikTok'} color="#0ea5e9" />
                    </Col>
                    <Col xs={24} md={8}>
                        <MetricCard label="Errors" value={result.errors?.length || 0} color={result.errors?.length > 0 ? '#ef4444' : '#10b981'} />
                    </Col>
                </Row>

                {result.errors?.length > 0 && (
                    <Alert type="warning" style={{ marginBottom: 16 }} showIcon
                        message={`${result.errors.length} link(s) failed`}
                        description={result.errors.join('\n')} />
                )}

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
                    <Table columns={cols} dataSource={(result.rows || []).map((r, i) => ({ ...r, key: i }))}
                        pagination={{ pageSize: 10 }} size="small" scroll={{ x: 'max-content' }} />
                </div>

                <Button block size="large" icon={<FileExcelOutlined />}
                    onClick={() => downloadExcel(result.file_base64, `freemir_${platform}_general.xlsx`)}
                    style={{ height: 52, borderRadius: 10, fontWeight: 700, fontSize: 15, background: '#10b981', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
                    Download Excel
                </Button>
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0, fontFamily: "'Outfit', sans-serif", color: 'var(--text-main)', fontWeight: 800 }}>
                    📥 Social Media Scraper
                </Title>
                <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    Instagram + TikTok data collection via Apify — exported as Excel
                </Text>
            </div>

            <Row gutter={[20, 20]}>
                {/* LEFT: Config Panel */}
                <Col xs={24} lg={10}>
                    {/* Auth */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                        <SectionHeading emoji="🔑">Apify API Token</SectionHeading>
                        <Password
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="apify_api_xxxx..."
                            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
                            style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                        />
                        <Text style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>
                            Get your token at <a href="https://console.apify.com/account/integrations" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>console.apify.com</a>
                        </Text>
                    </div>

                    {/* Platform + Mode */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                        <SectionHeading emoji="📱">Platform</SectionHeading>
                        <Radio.Group value={platform} onChange={e => setPlatform(e.target.value)} style={{ marginBottom: 20 }}
                            optionType="button" buttonStyle="solid"
                            options={[
                                { label: '📷 Instagram', value: 'instagram' },
                                { label: '🎵 TikTok', value: 'tiktok' },
                            ]} />

                        <SectionHeading emoji="⚙️">Scraping Mode</SectionHeading>
                        <Radio.Group value={mode} onChange={e => setMode(e.target.value)}
                            optionType="button" buttonStyle="solid"
                            options={[
                                { label: '🔍 Specific (Detail)', value: 'specific' },
                                { label: '📋 General (Bulk)', value: 'general' },
                            ]} />
                    </div>

                    {/* Mode-specific inputs */}
                    {mode === 'specific' ? (
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                            <SectionHeading emoji="🔗">Post URL</SectionHeading>
                            <Input
                                value={url} onChange={e => setUrl(e.target.value)}
                                placeholder={platform === 'instagram' ? 'https://www.instagram.com/p/...' : 'https://www.tiktok.com/@.../video/... or vt.tiktok.com/...'}
                                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)', color: 'var(--text-main)', marginBottom: 16 }}
                            />
                            <SectionHeading emoji="💬">Comments to Scrape</SectionHeading>
                            <InputNumber
                                value={commentsLimit} onChange={setCommentsLimit} min={0} max={20000}
                                style={{ width: '100%', background: 'var(--bg-panel)', borderColor: 'var(--border)', color: 'var(--text-main)' }}
                                placeholder="0 = skip comments"
                            />
                        </div>
                    ) : (
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                            {platform === 'instagram' && (
                                <>
                                    <SectionHeading emoji="📣">Boost Type</SectionHeading>
                                    <Radio.Group value={boostType} onChange={e => setBoostType(e.target.value)} style={{ marginBottom: 16 }}>
                                        <Radio value="boosted">Boosted</Radio>
                                        <Radio value="not_boosted">Not Boosted</Radio>
                                    </Radio.Group>
                                </>
                            )}
                            <SectionHeading emoji="📋">Post Links</SectionHeading>
                            <Text style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                                One URL per line. TikTok short links (vt.tiktok.com) auto-resolved.
                            </Text>
                            <TextArea
                                value={rawLinks} onChange={e => setRawLinks(e.target.value)}
                                rows={8} placeholder={"https://...\nhttps://...\nhttps://..."}
                                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)', color: 'var(--text-main)', fontFamily: 'monospace', fontSize: 12 }}
                            />
                            <Checkbox checked={dedupe} onChange={e => setDedupe(e.target.checked)} style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                                De-duplicate input links
                            </Checkbox>
                        </div>
                    )}

                    {/* Run Button */}
                    <Button block loading={loading} onClick={handleRun}
                        icon={<PlayCircleOutlined />}
                        style={{
                            height: 52, borderRadius: 10, fontWeight: 700, fontSize: 16,
                            background: 'linear-gradient(135deg, #38bdf8 0%, #4ade80 100%)',
                            color: '#fff', border: 'none',
                            boxShadow: '0 4px 20px rgba(56,189,248,0.35)',
                        }}>
                        {loading ? 'Scraping... (may take a while)' : '🚀 Run Scraper'}
                    </Button>

                    {loading && (
                        <Alert style={{ marginTop: 12 }} type="info" showIcon
                            message="Scraping via Apify — this may take 1-3 minutes depending on volume" />
                    )}
                </Col>

                {/* RIGHT: Results */}
                <Col xs={24} lg={14}>
                    {!result && !loading && (
                        <div style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                            padding: '60px 40px', textAlign: 'center', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 400
                        }}>
                            <div style={{ fontSize: 52 }}>📥</div>
                            <Text style={{ fontSize: 16, color: 'var(--text-muted)' }}>Configure settings on the left and click <strong>Run Scraper</strong></Text>
                            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {[['📷', 'Instagram Posts'], ['🎵', 'TikTok Videos'], ['💬', 'Comments'], ['📤', 'Excel Export']].map(([emoji, label]) => (
                                    <Tag key={label} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                        {emoji} {label}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    )}

                    {result?.mode === 'specific' && renderSpecific()}
                    {result?.mode === 'general' && renderGeneral()}
                </Col>
            </Row>
        </div>
    );
};

export default SocmedScraping;
