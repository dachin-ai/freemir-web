import React, { useState } from 'react';
import { Layout, Menu, Typography, Button, message, Modal, Form, Input, Dropdown, Divider, Segmented } from 'antd';
import { LogoutOutlined, HomeOutlined, LockOutlined, AppstoreOutlined, ShoppingOutlined, PlaySquareOutlined, VideoCameraOutlined, SunOutlined, MoonOutlined, KeyOutlined, UnlockOutlined, TeamOutlined, BarChartOutlined, GlobalOutlined, DownOutlined, LinkOutlined, FileImageOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import Bi from '../components/Bi';
import { changePassword } from '../api';
import { PATH_TOOLS, toolsPath } from '../routes/paths';

/** Prevent DingTalk / AliDocs iframe from swallowing clicks inside the settings panel. */
const stopPanelEvent = (e) => {
  e.stopPropagation();
};

const { Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [pwdForm] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasAccess } = useAuth();
  const { isDark, setThemeMode } = useTheme();
  const { lang, setLanguage } = useLang();
  const { t } = useTranslation();

  /* Dark: indigo. Light: musim panas (langit & air, biru segar). */
  const ta = isDark
    ? {
        grad: 'var(--fm-gradient)',
        siderGlow: '0 4px 14px rgba(14,165,233,0.45)',
        keyIcon: '#38bdf8',
        toggleIcon: '#38bdf8',
        toggleBg: 'rgba(14,165,233,0.12)',
        toggleBorder: 'rgba(56,189,248,0.28)',
        wajanFill: 'rgba(14,165,233,0.18)',
        wajanStroke: 'rgba(56,189,248,0.95)',
        wajanInner: 'rgba(14,165,233,0.14)',
        wajanLine: 'rgba(56,189,248,0.32)',
        wajanDot: 'rgba(14,165,233,1)',
        wajanRing: 'rgba(56,189,248,0.85)',
        wajanRingStroke: 'rgba(14,165,233,0.4)',
      }
    : {
        grad: 'var(--fm-gradient)',
        siderGlow: '0 4px 18px rgba(14, 165, 233, 0.35)',
        keyIcon: '#0ea5e9',
        toggleIcon: '#0ea5e9',
        toggleBg: 'rgba(14, 165, 233, 0.12)',
        toggleBorder: 'rgba(2, 132, 199, 0.22)',
        wajanFill: 'rgba(14, 165, 233, 0.16)',
        wajanStroke: 'rgba(2, 132, 199, 0.92)',
        wajanInner: 'rgba(56, 189, 248, 0.18)',
        wajanLine: 'rgba(2, 132, 199, 0.38)',
        wajanDot: 'rgba(14, 165, 233, 1)',
        wajanRing: 'rgba(56, 189, 248, 0.88)',
        wajanRingStroke: 'rgba(2, 132, 199, 0.45)',
      };

  const lockedLabel = (label, toolKey) => {
    if (toolKey && !hasAccess(toolKey)) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 6 }}>
          <span style={{ opacity: 0.45 }}>{label}</span>
          <LockOutlined style={{ color: '#f87171', fontSize: 11, flexShrink: 0 }} />
        </span>
      );
    }
    return label;
  };

  const menuItems = [
    { key: PATH_TOOLS, icon: <HomeOutlined />, label: <Bi i18nKey="layout.lobby" /> },
    { key: toolsPath('quick-links'), icon: <LinkOutlined />, label: <Bi i18nKey="layout.quickLinks" /> },
    {
      key: 'group-freemir',
      label: <Bi i18nKey="layout.freemirSuite" />,
      icon: <AppstoreOutlined />,
      children: [
        { key: toolsPath('price-checker'), label: lockedLabel(<Bi i18nKey="layout.priceChecker" />, 'price_checker'), style: !hasAccess('price_checker') ? { opacity: 0.6 } : {} },
        { key: toolsPath('warehouse-order'), label: lockedLabel(<Bi i18nKey="layout.orderPlanner" />, 'order_planner'), style: !hasAccess('order_planner') ? { opacity: 0.6 } : {} },
        { key: toolsPath('product-performance'), label: lockedLabel(<Bi i18nKey="layout.productPerformance" />, 'product_performance'), style: !hasAccess('product_performance') ? { opacity: 0.6 } : {} },
        { key: toolsPath('photo-downloader'), label: lockedLabel(<Bi i18nKey="layout.photoDownloader" />, 'photo_downloader'), style: !hasAccess('photo_downloader') ? { opacity: 0.6 } : {} },
        { key: toolsPath('brand-material'), label: lockedLabel(<Bi i18nKey="layout.brandMaterial" />, 'brand_material'), style: !hasAccess('brand_material') ? { opacity: 0.6 } : {} },
        { key: toolsPath('sku-review'), label: <Bi i18nKey="layout.skuReviewAnalysis" /> },
      ]
    },
    {
      key: 'group-shopee',
      label: <Bi i18nKey="layout.shopeeSuite" />,
      icon: <ShoppingOutlined />,
      children: [
        { key: toolsPath('order-loss'), label: lockedLabel(<Bi i18nKey="layout.orderReview" />, 'order_review'), style: !hasAccess('order_review') ? { opacity: 0.6 } : {} },
        { key: toolsPath('shopee-affiliate'), label: lockedLabel(<Bi i18nKey="layout.affiliatePerformance" />, 'affiliate_performance'), style: !hasAccess('affiliate_performance') ? { opacity: 0.6 } : {} },
        { key: toolsPath('livestream-display'), label: lockedLabel(<Bi i18nKey="layout.livestreamDisplay" />, 'livestream_display'), style: !hasAccess('livestream_display') ? { opacity: 0.6 } : {} },
      ]
    },
    {
      key: 'group-tiktok',
      label: <Bi i18nKey="layout.tiktokSuite" />,
      icon: <PlaySquareOutlined />,
      children: [
        { key: toolsPath('pre-sales'), label: lockedLabel(<Bi i18nKey="layout.preSalesChecker" />, 'pre_sales'), style: !hasAccess('pre_sales') ? { opacity: 0.6 } : {} },
        { key: toolsPath('affiliate-analyzer'), label: lockedLabel(<Bi i18nKey="layout.affiliateAnalyzer" />, 'affiliate_analyzer'), style: !hasAccess('affiliate_analyzer') ? { opacity: 0.6 } : {} },
        { key: toolsPath('tiktok-ads'), label: lockedLabel(<Bi i18nKey="layout.adsAnalyzer" />, 'ads_analyzer'), style: !hasAccess('ads_analyzer') ? { opacity: 0.6 } : {} },
      ]
    },
    { key: toolsPath('request-access'), icon: <UnlockOutlined />, label: <Bi i18nKey="layout.requestAccess" /> },
    ...(hasAccess('admin') ? [{ key: toolsPath('access-management'), icon: <TeamOutlined />, label: <Bi i18nKey="layout.accessManagement" /> }] : []),
  ];

  // Map route → toolKey to determine if restricted
  const ROUTE_TOOL_MAP = {
    [toolsPath('price-checker')]: 'price_checker',
    [toolsPath('warehouse-order')]: 'order_planner',
    [toolsPath('order-loss')]: 'order_review',
    [toolsPath('shopee-affiliate')]: 'affiliate_performance',
    [toolsPath('pre-sales')]: 'pre_sales',
    [toolsPath('affiliate-analyzer')]: 'affiliate_analyzer',
    [toolsPath('tiktok-ads')]: 'ads_analyzer',
    [toolsPath('access-management')]: 'admin',
    [toolsPath('product-performance')]: 'product_performance',
    [toolsPath('livestream-display')]: 'livestream_display',
    [toolsPath('photo-downloader')]: 'photo_downloader',
    [toolsPath('brand-material')]: 'brand_material',
  };

  const handleMenuClick = ({ key }) => {
    const toolKey = ROUTE_TOOL_MAP[key];
    if (toolKey && !hasAccess(toolKey)) {
      message.warning({ content: t('layout.accessRestricted'), key: 'restricted-tool', duration: 3 });
      return;
    }
    navigate(key);
  };

  /* Automatically auto-expand all menus based on current location */
  const openKeys = menuItems.filter(i => i.children?.some(c => c.key === location.pathname)).map(i => i.key);

  const onChangePwd = async (values) => {
    if (values.new_password !== values.confirm_password) {
      message.error(t('layout.pwdMismatch'));
      return;
    }
    setChangePwdLoading(true);
    try {
      const res = await changePassword(values.current_password, values.new_password);
      message.success(res.data?.message || t('layout.pwdChanged'));
      setChangePwdOpen(false);
      pwdForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || t('layout.pwdFailed'));
    } finally {
      setChangePwdLoading(false);
    }
  };

  const renderWajanIcon = (size) => (
    <div className="wajan-container" aria-hidden style={{ width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 64 64" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible', width: '100%', height: '100%' }}>
        <circle cx="32" cy="32" r="20" fill={ta.wajanFill} stroke="none" />
        <circle cx="32" cy="32" r="18" stroke={isDark ? 'rgba(255,255,255,0.88)' : 'rgba(30,41,59,0.75)'} strokeWidth="2.2" />
        <circle cx="32" cy="32" r="12" stroke={isDark ? 'rgba(255,255,255,0.38)' : 'rgba(30,41,59,0.25)'} strokeWidth="1.4" fill={isDark ? 'rgba(255,255,255,0.025)' : 'rgba(30,41,59,0.03)'} />
        <circle cx="32" cy="32" r="6" stroke={ta.wajanStroke} strokeWidth="1.5" fill={ta.wajanInner} />
        <circle cx="32" cy="32" r="2" fill={ta.wajanDot} stroke="none" />
        <line x1="32" y1="20" x2="32" y2="44" stroke={ta.wajanLine} strokeWidth="0.8" strokeDasharray="2 3" />
        <line x1="20" y1="32" x2="44" y2="32" stroke={ta.wajanLine} strokeWidth="0.8" strokeDasharray="2 3" />
        <path d="M50 30.2 L62 29 L62 35 L50 33.8 Z" fill={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(30,41,59,0.05)'} stroke={isDark ? 'rgba(255,255,255,0.82)' : 'rgba(30,41,59,0.7)'} strokeWidth="1.7" strokeLinejoin="round" />
        <line x1="53.5" y1="30.6" x2="53.5" y2="33.4" stroke={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(30,41,59,0.35)'} strokeWidth="1" />
        <line x1="56.5" y1="30.3" x2="56.5" y2="33.7" stroke={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(30,41,59,0.35)'} strokeWidth="1" />
        <line x1="59.5" y1="29.9" x2="59.5" y2="34.1" stroke={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(30,41,59,0.35)'} strokeWidth="1" />
        <path d="M14 29.5 Q7.5 32 14 34.5" stroke={isDark ? 'rgba(255,255,255,0.75)' : 'rgba(30,41,59,0.65)'} strokeWidth="2.3" fill="none" />
        <circle cx="32" cy="14" r="1.8" fill={ta.wajanRing} stroke={ta.wajanRingStroke} strokeWidth="1" />
        <circle cx="32" cy="50" r="1.8" fill={ta.wajanRing} stroke={ta.wajanRingStroke} strokeWidth="1" />
        <circle className="wajan-ring" cx="32" cy="32" r="27" strokeDasharray="1.2 5" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>

      {/* ── DARK SIDEBAR ── */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={260}
        style={{
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          boxShadow: isDark ? '2px 0 16px rgba(0,0,0,0.5)' : '2px 0 12px rgba(0,0,0,0.08)',
          position: 'relative',
        }}
      >
        <div style={{
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 20px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 10,
          gap: 12,
        }}>
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/logo.png" alt="Freemir Logo" style={{ height: 44, objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: ta.grad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: ta.siderGlow,
            }}>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>F</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <Menu
          selectedKeys={[
            location.pathname.startsWith(`${PATH_TOOLS}/brand-material`)
              ? toolsPath('brand-material')
              : location.pathname,
          ]}
          defaultOpenKeys={openKeys}
          mode="inline"
          items={menuItems}
          onClick={handleMenuClick}
          style={{ background: 'transparent', border: 'none', padding: '0 8px' }}
          theme={isDark ? 'dark' : 'light'}
        />

      </Sider>

      {/* ── MAIN AREA ── */}
      <Layout style={{ background: 'var(--bg-app)' }}>

        {/* Top Bar — dark gradient */}
        <div style={{
          height: 64,
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 12px rgba(2, 132, 199, 0.1)',
        }}>
          <Text style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            <Bi i18nKey="layout.topBarTagline" />
          </Text>
          <div className="fm-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user ? (
              <>
              <Dropdown
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                trigger={['click']}
                placement="bottomRight"
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
                styles={{ root: { zIndex: 11000 } }}
                popupRender={() => (
                  <div
                    className="fm-settings-panel"
                    onClick={stopPanelEvent}
                    onMouseDown={stopPanelEvent}
                    onPointerDown={stopPanelEvent}
                    style={{
                      marginTop: 10,
                      width: 336,
                      maxWidth: 'calc(100vw - 24px)',
                      padding: 0,
                      borderRadius: 14,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      boxShadow: isDark ? '0 16px 48px rgba(0,0,0,0.5)' : '0 16px 40px rgba(15, 23, 42, 0.12)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '18px 20px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: isDark ? 'rgba(15,23,42,0.55)' : 'rgba(248,250,252,0.95)',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                        {t('layout.settingsTitle')}
                      </Text>
                      <Text strong style={{ fontSize: 16, display: 'block', lineHeight: 1.35, color: 'var(--text-main)' }}>
                        {user.name || user.username}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6, lineHeight: 1.45 }}>
                        {t('layout.settingsSubtitle')}
                      </Text>
                    </div>

                    <div style={{ padding: '6px 0 10px' }}>
                      <div style={{ padding: '16px 20px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                          <span
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(145deg, #22d3ee 0%, #06b6d4 48%, #0e7490 100%)',
                              color: '#fff',
                              flexShrink: 0,
                              marginTop: 1,
                              boxShadow: isDark ? '0 2px 10px rgba(6,182,212,0.45)' : '0 2px 10px rgba(6,182,212,0.35)',
                            }}
                          >
                            <GlobalOutlined style={{ fontSize: 22, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.2))' }} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text strong style={{ fontSize: 14, display: 'block', lineHeight: 1.4 }}>{t('layout.settingsLanguage')}</Text>
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.55, display: 'block', marginTop: 6 }}>
                              {t('layout.tabLanguageHint')}
                            </Text>
                          </div>
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <Segmented
                            block
                            size="large"
                            value={lang}
                            onChange={setLanguage}
                            onMouseDown={stopPanelEvent}
                            onPointerDown={stopPanelEvent}
                            onClick={stopPanelEvent}
                            options={[
                              { value: 'zh', label: <span style={{ fontWeight: 600 }}>中文</span> },
                              { value: 'en', label: <span style={{ fontWeight: 700, letterSpacing: '0.06em' }}>EN</span> },
                              { value: 'id', label: <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>ID</span> },
                            ]}
                          />
                        </div>
                      </div>

                      <Divider style={{ margin: '0 20px' }} />

                      <div style={{ padding: '16px 20px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                          <span
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(145deg, #fcd34d 0%, #f59e0b 45%, #ea580c 100%)',
                              color: '#fff',
                              flexShrink: 0,
                              marginTop: 1,
                              boxShadow: isDark ? '0 2px 10px rgba(245,158,11,0.45)' : '0 2px 10px rgba(234,88,12,0.3)',
                            }}
                          >
                            {isDark ? (
                              <MoonOutlined style={{ fontSize: 22, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.2))' }} />
                            ) : (
                              <SunOutlined style={{ fontSize: 22, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.15))' }} />
                            )}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text strong style={{ fontSize: 14, display: 'block', lineHeight: 1.4 }}>{t('layout.settingsTheme')}</Text>
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.55, display: 'block', marginTop: 6 }}>
                              {t('layout.tabAppearanceHint')}
                            </Text>
                          </div>
                        </div>
                        <Segmented
                          block
                          size="large"
                          value={isDark ? 'dark' : 'light'}
                          onChange={(v) => setThemeMode(v === 'dark')}
                          onMouseDown={stopPanelEvent}
                          onPointerDown={stopPanelEvent}
                          onClick={stopPanelEvent}
                          options={[
                            {
                              value: 'light',
                              label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '2px 0' }}>
                                  <SunOutlined />
                                  <span>{t('layout.themeModeLight')}</span>
                                </span>
                              ),
                            },
                            {
                              value: 'dark',
                              label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '2px 0' }}>
                                  <MoonOutlined />
                                  <span>{t('layout.themeModeDark')}</span>
                                </span>
                              ),
                            },
                          ]}
                        />
                      </div>

                      <Divider style={{ margin: '0 20px' }} />

                      <div style={{ padding: '14px 20px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                          <span
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'var(--fm-gradient)',
                              color: '#fff',
                              flexShrink: 0,
                              marginTop: 1,
                              boxShadow: isDark ? '0 2px 10px rgba(14,165,233,0.45)' : '0 2px 10px rgba(2,132,199,0.35)',
                            }}
                          >
                            <KeyOutlined style={{ fontSize: 22, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.2))' }} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text strong style={{ fontSize: 14, display: 'block', lineHeight: 1.4 }}>{t('layout.settingsSecurity')}</Text>
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.55, display: 'block', marginTop: 6 }}>
                              {t('layout.settingsSecurityHint')}
                            </Text>
                          </div>
                        </div>
                        <Button
                          type="default"
                          block
                          size="large"
                          icon={<KeyOutlined style={{ fontSize: 18 }} />}
                          onClick={() => { setSettingsOpen(false); setChangePwdOpen(true); }}
                          style={{ height: 44, borderRadius: 10, fontWeight: 600, borderColor: isDark ? 'rgba(56,189,248,0.45)' : 'rgba(2,132,199,0.35)', color: ta.keyIcon }}
                        >
                          {t('layout.changePassword')}
                        </Button>
                      </div>

                      <Divider style={{ margin: '0 20px' }} />

                      <div style={{ padding: '12px 20px 18px' }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {t('layout.settingsSession')}
                        </Text>
                        <Button
                          danger
                          block
                          size="large"
                          icon={<LogoutOutlined />}
                          onClick={() => { setSettingsOpen(false); logout(); }}
                          style={{ height: 44, borderRadius: 10, fontWeight: 600 }}
                        >
                          {t('layout.logout')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              >
                <button
                  type="button"
                  className="fm-header-profile-trigger"
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 16px 8px 10px',
                    borderRadius: 12,
                    border: `1px solid ${isDark ? 'rgba(56,189,248,0.32)' : 'rgba(2,132,199,0.22)'}`,
                    background: isDark
                      ? 'linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(30,41,59,0.85) 100%)'
                      : 'linear-gradient(135deg, rgba(56,189,248,0.16) 0%, rgba(255,255,255,1) 100%)',
                    cursor: 'pointer',
                    boxShadow: isDark
                      ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 10px rgba(14,165,233,0.22)'
                      : '0 2px 10px rgba(2,132,199,0.12)',
                    transition: 'transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                    maxWidth: 340,
                  }}
                >
                  {renderWajanIcon(34)}
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {user.name || user.username}
                  </span>
                  <DownOutlined style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, opacity: 0.85 }} />
                </button>
              </Dropdown>
              </>
            ) : null}
          </div>
        </div>

        {/* Page Content */}
        <Content style={{ padding: '32px', overflowY: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* ── CHANGE PASSWORD MODAL ── */}
      <Modal
        open={changePwdOpen}
        onCancel={() => { setChangePwdOpen(false); pwdForm.resetFields(); }}
        footer={null}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><KeyOutlined style={{ color: ta.keyIcon, fontSize: 20 }} /> {t('layout.modalChangePassword')}</span>}
        width={400}
        styles={{ content: { background: isDark ? '#1e293b' : '#ffffff', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }, header: { background: isDark ? '#1e293b' : '#ffffff' } }}
      >
        <Form form={pwdForm} onFinish={onChangePwd} layout="vertical" requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item name="current_password" label={t('layout.currentPassword')} rules={[{ required: true, message: t('layout.pwdEnterCurrent') }]}>
            <Input.Password placeholder={t('layout.phCurrentPwd')} />
          </Form.Item>
          <Form.Item name="new_password" label={t('layout.newPassword')} rules={[{ required: true, min: 6, message: t('layout.pwdEnterNew') }]}>
            <Input.Password placeholder={t('layout.phNewPwd')} />
          </Form.Item>
          <Form.Item name="confirm_password" label={t('layout.confirmNewPassword')} rules={[{ required: true, message: t('layout.pwdConfirm') }]}>
            <Input.Password placeholder={t('layout.phRepeatPwd')} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button htmlType="submit" type="primary" loading={changePwdLoading} block
              style={{ background: ta.grad, border: 'none', height: 42, fontWeight: 600 }}>
              {changePwdLoading ? t('layout.saving') : t('layout.saveNewPassword')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default MainLayout;
