import React, { useEffect } from 'react';
import { Typography, Row, Col, Card, Tag, Tooltip, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowRightOutlined, LockOutlined, TagOutlined, InboxOutlined, FileSearchOutlined, BarChartOutlined, FundProjectionScreenOutlined, RiseOutlined, PieChartOutlined, VideoCameraOutlined, UnlockOutlined, PictureOutlined, LinkOutlined, FileImageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { toolsPath } from '../routes/paths';

const { Title, Text } = Typography;

const SUITE_ACCENTS = {
    freemir: '#0ea5e9',
    shopee: '#f97316',
    tiktok: '#ec4899',
};

const CATEGORY_ORDER = ['freemir', 'shopee', 'tiktok'];

const TOOL_ITEMS = [
    { toolKey: 'price_checker', icon: <TagOutlined />, path: toolsPath('price-checker'), active: true, category: 'freemir' },
    { toolKey: 'order_planner', icon: <InboxOutlined />, path: toolsPath('warehouse-order'), active: true, category: 'freemir' },
    { toolKey: 'product_performance', icon: <BarChartOutlined />, path: toolsPath('product-performance'), active: true, category: 'freemir' },
    { toolKey: 'photo_downloader', icon: <PictureOutlined />, path: toolsPath('photo-downloader'), active: true, category: 'freemir' },
    { toolKey: 'brand_material', icon: <FileImageOutlined />, path: toolsPath('brand-material'), active: true, category: 'freemir' },
    { toolKey: 'sku_review', icon: <FileSearchOutlined />, path: toolsPath('sku-review'), active: true, category: 'freemir' },
    { toolKey: 'order_review', icon: <FileSearchOutlined />, path: toolsPath('order-loss'), active: true, category: 'shopee' },
    { toolKey: 'affiliate_performance', icon: <BarChartOutlined />, path: toolsPath('shopee-affiliate'), active: true, category: 'shopee' },
    { toolKey: 'livestream_display', icon: <VideoCameraOutlined />, path: toolsPath('livestream-display'), active: true, category: 'shopee' },
    { toolKey: 'pre_sales', icon: <FundProjectionScreenOutlined />, path: toolsPath('pre-sales'), active: true, category: 'tiktok' },
    { toolKey: 'affiliate_analyzer', icon: <RiseOutlined />, path: toolsPath('affiliate-analyzer'), active: true, category: 'tiktok' },
    { toolKey: 'ads_analyzer', icon: <PieChartOutlined />, path: toolsPath('tiktok-ads'), active: true, category: 'tiktok' },
];

const Dashboard = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { hasAccess, logActivity } = useAuth();
    const { isDark } = useTheme();

    const handleLaunchTool = (tool) => {
        if (!tool.active || !hasAccess(tool.toolKey)) return;
        const tk = `lobbyPage.tools.${tool.toolKey}.name`;
        const toolName = t(tk, { defaultValue: tool.toolKey });
        logActivity(`Lobby Launch (${toolName})`);
        navigate(tool.path);
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes float {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-20px) rotate(5deg); }
            }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    return (
        <div>
            <div style={{
                position: 'relative', overflow: 'hidden',
                background: isDark
                    ? 'linear-gradient(135deg, rgba(14,165,233,0.15) 0%, rgba(14,165,233,0.05) 50%, rgba(236,72,153,0.03) 100%)'
                    : 'linear-gradient(135deg, rgba(2,132,199,0.08) 0%, rgba(2,132,199,0.02) 50%, transparent 100%)',
                border: `1px solid ${isDark ? 'rgba(56,189,248,0.25)' : 'rgba(2,132,199,0.15)'}`,
                borderRadius: 20, padding: '48px 56px', marginBottom: 64,
                boxShadow: isDark
                    ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
                    : '0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}>
                <div style={{
                    position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(14,165,233,0.25) 0%, transparent 70%)',
                    pointerEvents: 'none', animation: 'float 6s ease-in-out infinite'
                }} />
                <div style={{
                    position: 'absolute', bottom: -40, right: 200, width: 180, height: 180, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)',
                    pointerEvents: 'none', animation: 'float 8s ease-in-out infinite reverse'
                }} />
                <div style={{
                    position: 'absolute', top: 30, right: 320, width: 100, height: 100, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)',
                    pointerEvents: 'none', animation: 'float 4s ease-in-out infinite'
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                            <Title level={1} style={{
                                fontSize: 42, margin: '0 0 16px 0', fontWeight: 900,
                                color: isDark ? '#f1f5f9' : '#1e293b',
                                letterSpacing: '-1px',
                                lineHeight: 1.2,
                            }}>
                                {t('lobbyPage.heroTitle')}
                            </Title>
                            <Text style={{
                                fontSize: 16, color: isDark ? '#cbd5e1' : '#475569',
                                fontWeight: 400, lineHeight: 1.6,
                                display: 'block', maxWidth: 600
                            }}>
                                {t('lobbyPage.heroSubtitle')}
                            </Text>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                            <Button
                                icon={<UnlockOutlined />}
                                size="small"
                                onClick={() => navigate(toolsPath('request-access'))}
                                style={{
                                    flexShrink: 0,
                                    marginTop: 6,
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    height: 30,
                                    padding: '0 12px',
                                    background: isDark ? 'rgba(14,165,233,0.15)' : '#0ea5e9',
                                    border: isDark ? '1px solid rgba(56,189,248,0.4)' : 'none',
                                    color: isDark ? '#7dd3fc' : '#ffffff',
                                }}
                            >
                                {t('lobbyPage.requestAccessTop')}
                            </Button>
                            <Button
                                icon={<LinkOutlined />}
                                size="small"
                                onClick={() => navigate(toolsPath('quick-links'))}
                                style={{
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    height: 30,
                                    padding: '0 12px',
                                }}
                            >
                                {t('lobbyPage.quickLinks.title')}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {CATEGORY_ORDER.map((catKey) => {
                const accent = SUITE_ACCENTS[catKey];
                const catTools = TOOL_ITEMS.filter((x) => x.category === catKey);
                if (catTools.length === 0) return null;

                return (
                    <div key={catKey} style={{ marginBottom: 52 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 4, height: 20, borderRadius: 2, background: accent, flexShrink: 0, boxShadow: `0 0 8px ${accent}80` }} />
                            <Text style={{ fontSize: 13, fontWeight: 700, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                {t(`lobbyPage.suites.${catKey}`)}
                            </Text>
                            <div style={{ flexGrow: 1, height: 1, background: `linear-gradient(90deg, ${accent}40 0%, transparent 100%)` }} />
                        </div>

                        <Row gutter={[20, 20]}>
                            {catTools.map((tool, idx) => {
                                const accessible = !tool.toolKey || hasAccess(tool.toolKey);
                                const isClickable = tool.active && accessible;
                                const tk = `lobbyPage.tools.${tool.toolKey}`;

                                return (
                                    <Col xs={24} md={12} lg={8} key={idx}>
                                        <Tooltip title={!accessible ? t('lobbyPage.lockedTooltip') : ''} placement="top">
                                            <Card
                                                hoverable={isClickable}
                                                onClick={() => isClickable && handleLaunchTool(tool)}
                                                className={`lobby-card card-${catKey}`}
                                                style={{
                                                    background: isDark ? '#0f172a' : '#ffffff',
                                                    border: `1px solid ${accessible ? `${accent}20` : 'rgba(239,68,68,0.2)'}`,
                                                    borderTop: accessible ? `4px solid ${accent}` : '4px solid rgba(239,68,68,0.5)',
                                                    borderRadius: 16,
                                                    height: '100%',
                                                    cursor: isClickable ? 'pointer' : 'default',
                                                    opacity: accessible ? 1 : 0.82,
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    boxShadow: isDark
                                                        ? '0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)'
                                                        : '0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                }}
                                                styles={{ body: { padding: '20px 24px', display: 'flex', flexDirection: 'column', height: '100%' } }}
                                                onMouseEnter={(e) => {
                                                    if (isClickable) {
                                                        e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                                                        e.currentTarget.style.boxShadow = isDark
                                                            ? `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${accent}30`
                                                            : `0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px ${accent}20`;
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                                    e.currentTarget.style.boxShadow = isDark
                                                        ? '0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)'
                                                        : '0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                                                    <div style={{
                                                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                                                        background: accessible
                                                            ? `linear-gradient(135deg, ${accent}25, ${accent}15)`
                                                            : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))',
                                                        border: accessible ? `2px solid ${accent}40` : '2px solid rgba(239,68,68,0.3)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 20, color: accessible ? accent : '#f87171',
                                                        boxShadow: accessible
                                                            ? `0 4px 16px ${accent}30, inset 0 1px 0 rgba(255,255,255,0.2)`
                                                            : '0 4px 16px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
                                                        position: 'relative',
                                                    }}>
                                                        {tool.icon}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <Text style={{
                                                            fontSize: 16, fontWeight: 800,
                                                            color: accessible ? (isDark ? '#f1f5f9' : '#1e293b') : '#64748b',
                                                            display: 'block', lineHeight: 1.3, marginBottom: 8
                                                        }}>
                                                            {t(`${tk}.name`)}
                                                        </Text>
                                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                            <Tag style={{
                                                                background: `${accent}15`,
                                                                border: `1px solid ${accent}35`,
                                                                color: accent, fontSize: 11, borderRadius: 6,
                                                                lineHeight: '18px', padding: '0 8px', margin: 0,
                                                                fontWeight: 600
                                                            }}>
                                                                {t(`${tk}.platform`)}
                                                            </Tag>
                                                            <Tag style={{
                                                                background: isDark ? 'rgba(51,65,85,0.3)' : 'rgba(241,245,249,0.8)',
                                                                border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                                                                color: isDark ? '#94a3b8' : '#64748b', fontSize: 11,
                                                                borderRadius: 6, lineHeight: '18px', padding: '0 8px', margin: 0,
                                                                fontWeight: 500
                                                            }}>
                                                                {t(`${tk}.mainUser`)}
                                                            </Tag>
                                                        </div>
                                                    </div>
                                                    {!accessible && <LockOutlined style={{ color: '#f87171', fontSize: 16, flexShrink: 0, marginTop: 4 }} />}
                                                </div>

                                                <Text style={{
                                                    color: isDark ? '#94a3b8' : '#64748b', fontSize: 13,
                                                    lineHeight: 1.7, flexGrow: 1, marginBottom: 16, display: 'block',
                                                    fontWeight: 400
                                                }}>
                                                    {t(`${tk}.desc`)}
                                                </Text>

                                                {accessible ? (
                                                    <Button
                                                        type="primary"
                                                        size="middle"
                                                        style={{
                                                            background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
                                                            border: 'none',
                                                            borderRadius: 8,
                                                            fontSize: 13,
                                                            fontWeight: 700,
                                                            height: 36,
                                                            boxShadow: `0 4px 12px ${accent}40`,
                                                            transition: 'all 0.3s ease',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                            e.currentTarget.style.boxShadow = `0 6px 20px ${accent}60`;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.transform = 'translateY(0)';
                                                            e.currentTarget.style.boxShadow = `0 4px 12px ${accent}40`;
                                                        }}
                                                    >
                                                        {t('lobbyPage.launch')} <ArrowRightOutlined style={{ fontSize: 12, marginLeft: 6 }} />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="middle"
                                                        icon={<LockOutlined />}
                                                        onClick={(e) => { e.stopPropagation(); navigate(toolsPath('request-access')); }}
                                                        style={{
                                                            borderRadius: 8,
                                                            fontSize: 13,
                                                            fontWeight: 600,
                                                            height: 36,
                                                            background: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)',
                                                            border: '1px solid rgba(239,68,68,0.3)',
                                                            color: isDark ? '#fca5a5' : '#dc2626',
                                                        }}
                                                    >
                                                        {t('lobbyPage.requestAccessCta')}
                                                    </Button>
                                                )}
                                            </Card>
                                        </Tooltip>
                                    </Col>
                                );
                            })}
                        </Row>
                    </div>
                );
            })}
        </div>
    );
};

export default Dashboard;
