import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Form, Input, Button, message, Typography, Segmented } from 'antd';
import {
    UserOutlined,
    LockOutlined,
    MailOutlined,
    SyncOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ThunderboltOutlined,
    SunOutlined,
    MoonOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLang } from '../context/LangContext';
import Bi from '../components/Bi';
import api, { syncUsers, forgotPassword } from '../api';

const { Text } = Typography;

const LoginPage = () => {
    const { t } = useTranslation();
    const { login, signup } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { lang, setLanguage } = useLang();
    const [loadingLogin, setLoadingLogin] = useState(false);
    const [loadingSignup, setLoadingSignup] = useState(false);
    const [loadingSync, setLoadingSync] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);
    const [activeTab, setActiveTab] = useState('login');
    const [signupDone, setSignupDone] = useState(false);
    const [resetDone, setResetDone] = useState(false);
    const [warmingUp, setWarmingUp] = useState(false);
    const warmingTimerRef = useRef(null);

    const tc = (d, l) => (isDark ? d : l);

    const pageBg = tc('#020617', '#f0f9ff');
    const cardBg = tc('rgba(10,18,35,0.85)', 'rgba(255,255,255,0.96)');
    const cardBorder = tc('rgba(148,163,184,0.1)', 'rgba(2,132,199,0.12)');
    const cardShadow = tc(
        '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(56,189,248,0.04)',
        '0 24px 48px rgba(15,23,42,0.08), 0 0 0 1px rgba(2,132,199,0.06)',
    );
    const titleC = tc('#f1f5f9', '#0f172a');
    const mutedC = tc('#94a3b8', '#64748b');
    const tabBarBg = tc('rgba(255,255,255,0.04)', 'rgba(15,23,42,0.04)');
    const tabBarBorder = tc('rgba(148,163,184,0.08)', 'rgba(148,163,184,0.15)');
    const tabInactive = tc('#64748b', '#64748b');
    const tabActive = tc('#38bdf8', '#0ea5e9');
    const tabActiveBg = tc('rgba(56,189,248,0.15)', 'rgba(2,132,199,0.1)');
    const tabActiveRing = tc('inset 0 0 0 1px rgba(56,189,248,0.25)', 'inset 0 0 0 1px rgba(2,132,199,0.22)');
    const borderSubtle = tc('rgba(148,163,184,0.08)', 'rgba(148,163,184,0.14)');
    const linkC = tc('#38bdf8', '#0ea5e9');
    const prefixIco = tc('#475569', '#94a3b8');

    const inputStyle = {
        background: tc('rgba(15, 23, 42, 0.8)', '#ffffff'),
        border: tc('1px solid rgba(148,163,184,0.2)', '1px solid #cbd5e1'),
        borderRadius: 10,
        color: tc('#f1f5f9', '#0f172a'),
        height: 46,
    };

    useEffect(() => {
        api.get('/health', { timeout: 60000 }).catch(() => {});
    }, []);

    const onSyncUsers = async () => {
        setLoadingSync(true);
        try {
            const res = await syncUsers();
            message.success(res.data?.message || t('login.usersSynced'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('login.syncFailed'));
        } finally {
            setLoadingSync(false);
        }
    };

    const onLogin = async (values) => {
        setLoadingLogin(true);
        warmingTimerRef.current = setTimeout(() => setWarmingUp(true), 5000);
        try {
            await login(values.username, values.password);
            message.success(t('login.welcomeToast'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('login.loginFailed'));
        } finally {
            clearTimeout(warmingTimerRef.current);
            setLoadingLogin(false);
            setWarmingUp(false);
        }
    };

    const onForgotPassword = async (values) => {
        setLoadingReset(true);
        try {
            const res = await forgotPassword(values.username, values.email);
            setResetDone(true);
            message.success(res.data?.message || t('login.resetOk'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('login.resetFail'));
        } finally {
            setLoadingReset(false);
        }
    };

    const onSignup = async (values) => {
        if (values.password !== values.confirm) {
            message.error(t('login.pwdMismatchForm'));
            return;
        }
        setLoadingSignup(true);
        try {
            const msg = await signup(values.email, values.username, values.password);
            setSignupDone(true);
            message.success(msg);
        } catch (err) {
            message.error(err.response?.data?.detail || t('login.registrationFailed'));
        } finally {
            setLoadingSignup(false);
        }
    };

    const glowTop = tc('rgba(56,189,248,0.07)', 'rgba(56,189,248,0.12)');
    const glowBot = tc('rgba(14,165,233,0.1)', 'rgba(2,132,199,0.1)');

    return (
        <div
            style={{
                minHeight: '100vh',
                background: pageBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Inter', sans-serif",
                position: 'relative',
                overflow: 'hidden',
                padding: '40px 20px',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: '-10%',
                    left: '10%',
                    width: 600,
                    height: 600,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${glowTop} 0%, transparent 65%)`,
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: '-10%',
                    right: '10%',
                    width: 500,
                    height: 500,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${glowBot} 0%, transparent 65%)`,
                    pointerEvents: 'none',
                }}
            />

            <div
                className="fm-login-card"
                style={{
                    width: '100%',
                    maxWidth: 440,
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 20,
                    padding: '44px 40px 36px',
                    backdropFilter: 'blur(16px)',
                    boxShadow: cardShadow,
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div className="fm-login-toolbar">
                    <div className="fm-login-toolbar-start">
                        <Segmented
                            size="large"
                            value={lang}
                            onChange={setLanguage}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            options={[
                                { value: 'zh', label: <span style={{ fontWeight: 600 }}>中文</span> },
                                { value: 'en', label: <span style={{ fontWeight: 700, letterSpacing: '0.06em' }}>EN</span> },
                                { value: 'id', label: <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>ID</span> },
                            ]}
                        />
                    </div>
                    <div className="fm-login-toolbar-end">
                        <Segmented
                            size="large"
                            value={isDark ? 'dark' : 'light'}
                            onChange={(v) => {
                                if ((v === 'dark') !== isDark) toggleTheme();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
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
                </div>

                <div style={{ marginBottom: 20 }}>
                    <Link
                        to="/"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            color: linkC,
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'none',
                        }}
                    >
                        <ArrowLeftOutlined />
                        {t('landing.backToHome')}
                    </Link>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <img
                        src="/logo.png"
                        alt="Freemir"
                        style={{
                            height: 34,
                            filter: isDark ? 'brightness(0) invert(1) opacity(0.9)' : 'none',
                            opacity: isDark ? 1 : 0.92,
                            marginBottom: 16,
                        }}
                    />
                    <div
                        style={{
                            color: mutedC,
                            fontSize: 12,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 500,
                        }}
                    >
                        {t('login.internalPlatform')}
                    </div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        background: tabBarBg,
                        borderRadius: 12,
                        padding: 4,
                        marginBottom: 36,
                        gap: 4,
                        border: `1px solid ${tabBarBorder}`,
                    }}
                >
                    {['login', 'signup'].map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab);
                                setSignupDone(false);
                                setResetDone(false);
                            }}
                            style={{
                                flex: 1,
                                padding: '9px 0',
                                borderRadius: 9,
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 13,
                                transition: 'all 0.2s',
                                background: activeTab === tab ? tabActiveBg : 'transparent',
                                color: activeTab === tab ? tabActive : tabInactive,
                                boxShadow: activeTab === tab ? tabActiveRing : 'none',
                            }}
                        >
                            {tab === 'login' ? <Bi i18nKey="login.signIn" /> : <Bi i18nKey="login.createAccount" />}
                        </button>
                    ))}
                </div>

                {!signupDone && (
                    <div style={{ marginBottom: 28 }}>
                        <div
                            style={{
                                color: titleC,
                                margin: '0 0 4px',
                                fontFamily: "'Outfit', sans-serif",
                                fontWeight: 700,
                                fontSize: 18,
                            }}
                        >
                            {activeTab === 'login' ? t('login.welcomeBack') : t('login.requestAccessTitle')}
                        </div>
                        <Text style={{ color: mutedC, fontSize: 13 }}>
                            {activeTab === 'login' ? <Bi i18nKey="login.signInContinue" /> : <Bi i18nKey="login.requestAccessBlurb" />}
                        </Text>
                    </div>
                )}

                {activeTab === 'login' && (
                    <Form onFinish={onLogin} layout="vertical" requiredMark={false}>
                        <Form.Item name="username" rules={[{ required: true, message: t('login.enterUsernameOrEmail') }]} style={{ marginBottom: 16 }}>
                            <Input prefix={<UserOutlined style={{ color: prefixIco }} />} placeholder={t('login.usernameOrEmail')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item name="password" rules={[{ required: true, message: t('login.enterPassword') }]} style={{ marginBottom: 24 }}>
                            <Input.Password prefix={<LockOutlined style={{ color: prefixIco }} />} placeholder={t('login.password')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button
                                htmlType="submit"
                                loading={loadingLogin}
                                block
                                style={{
                                    height: 48,
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: 15,
                                    background: 'var(--fm-gradient)',
                                    color: '#fff',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(14,165,233,0.25)',
                                }}
                            >
                                {loadingLogin ? t('login.signingIn') : t('login.signInBtn')}
                            </Button>
                        </Form.Item>
                        {warmingUp && (
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    background: tc('rgba(251,191,36,0.08)', 'rgba(251,191,36,0.12)'),
                                    border: tc('1px solid rgba(251,191,36,0.25)', '1px solid rgba(245,158,11,0.35)'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                <ThunderboltOutlined style={{ color: '#f59e0b', fontSize: 14 }} />
                                <span style={{ color: tc('#fbbf24', '#b45309'), fontSize: 12 }}>{t('login.serverWaking')}</span>
                            </div>
                        )}
                    </Form>
                )}

                {activeTab === 'login' && (
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('forgot');
                                setResetDone(false);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedC, fontSize: 12, padding: 0 }}
                        >
                            {t('login.forgotPassword')}
                        </button>
                    </div>
                )}

                {activeTab === 'forgot' && !resetDone && (
                    <Form onFinish={onForgotPassword} layout="vertical" requiredMark={false}>
                        <div style={{ color: mutedC, fontSize: 13, marginBottom: 20 }}>{t('login.forgotIntro')}</div>
                        <Form.Item name="username" rules={[{ required: true, message: t('login.enterUsername') }]} style={{ marginBottom: 14 }}>
                            <Input prefix={<UserOutlined style={{ color: prefixIco }} />} placeholder={t('login.username')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item name="email" rules={[{ required: true, type: 'email', message: t('login.emailValid') }]} style={{ marginBottom: 24 }}>
                            <Input prefix={<MailOutlined style={{ color: prefixIco }} />} placeholder={t('login.email')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 12 }}>
                            <Button
                                htmlType="submit"
                                loading={loadingReset}
                                block
                                style={{
                                    height: 48,
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: 15,
                                    background: 'var(--fm-gradient)',
                                    color: '#fff',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(2,132,199,0.28)',
                                }}
                            >
                                {loadingReset ? t('login.sending') : t('login.resetPassword')}
                            </Button>
                        </Form.Item>
                        <div style={{ textAlign: 'center' }}>
                            <button type="button" onClick={() => setActiveTab('login')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: mutedC, fontSize: 12, padding: 0 }}>
                                {t('login.backToSignIn')}
                            </button>
                        </div>
                    </Form>
                )}

                {activeTab === 'forgot' && resetDone && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div
                            style={{
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                background: tc('rgba(14,165,233,0.12)', 'rgba(2,132,199,0.08)'),
                                border: tc('1px solid rgba(56,189,248,0.3)', '1px solid rgba(2,132,199,0.22)'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}
                        >
                            <CheckCircleOutlined style={{ fontSize: 28, color: '#38bdf8' }} />
                        </div>
                        <div style={{ color: titleC, fontWeight: 700, fontSize: 18, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>{t('login.checkEmail')}</div>
                        <Text style={{ color: mutedC, fontSize: 13, lineHeight: 1.6, display: 'block' }}>{t('login.newPasswordSent')}</Text>
                        <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: linkC, marginTop: 24, fontSize: 13 }} onClick={() => { setActiveTab('login'); setResetDone(false); }}>
                            {t('login.backToSignIn')}
                        </Button>
                    </div>
                )}

                {activeTab === 'signup' && !signupDone && (
                    <Form onFinish={onSignup} layout="vertical" requiredMark={false}>
                        <Form.Item name="email" rules={[{ required: true, type: 'email', message: t('login.emailValid') }]} style={{ marginBottom: 14 }}>
                            <Input prefix={<MailOutlined style={{ color: prefixIco }} />} placeholder={t('login.registerEmail')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item name="username" rules={[{ required: true, message: t('login.chooseUsername') }]} style={{ marginBottom: 14 }}>
                            <Input prefix={<UserOutlined style={{ color: prefixIco }} />} placeholder={t('login.username')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item name="password" rules={[{ required: true, min: 6, message: t('login.pwdMin6') }]} style={{ marginBottom: 14 }}>
                            <Input.Password prefix={<LockOutlined style={{ color: prefixIco }} />} placeholder={t('login.password')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item name="confirm" rules={[{ required: true, message: t('login.confirmPwdRequired') }]} style={{ marginBottom: 24 }}>
                            <Input.Password prefix={<LockOutlined style={{ color: prefixIco }} />} placeholder={t('login.confirmPwd')} style={inputStyle} />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 0 }}>
                            <Button
                                htmlType="submit"
                                loading={loadingSignup}
                                block
                                style={{
                                    height: 48,
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: 15,
                                    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    boxShadow: '0 4px 20px rgba(16,185,129,0.2)',
                                }}
                            >
                                {loadingSignup ? t('login.submitting') : t('login.requestAccessBtn')}
                            </Button>
                        </Form.Item>
                    </Form>
                )}

                {activeTab === 'signup' && signupDone && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div
                            style={{
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                background: tc('rgba(16,185,129,0.1)', 'rgba(16,185,129,0.08)'),
                                border: tc('1px solid rgba(16,185,129,0.3)', '1px solid rgba(16,185,129,0.22)'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                            }}
                        >
                            <CheckCircleOutlined style={{ fontSize: 28, color: '#10b981' }} />
                        </div>
                        <div style={{ color: titleC, margin: '0 0 8px', fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18 }}>{t('login.awaitingApproval')}</div>
                        <Text style={{ color: mutedC, fontSize: 13, lineHeight: 1.6, display: 'block' }}>{t('login.awaitingApprovalBlurb')}</Text>
                        <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: linkC, marginTop: 24, fontSize: 13 }} onClick={() => { setActiveTab('login'); setSignupDone(false); }}>
                            {t('login.backToSignIn')}
                        </Button>
                    </div>
                )}

                <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${borderSubtle}`, textAlign: 'center' }}>
                    <Button
                        icon={<SyncOutlined spin={loadingSync} />}
                        loading={loadingSync}
                        onClick={onSyncUsers}
                        size="small"
                        style={{
                            background: tc('rgba(14,165,233,0.08)', 'rgba(2,132,199,0.06)'),
                            border: tc('1px solid rgba(56,189,248,0.2)', '1px solid rgba(2,132,199,0.18)'),
                            color: mutedC,
                            borderRadius: 8,
                            fontSize: 11,
                            height: 30,
                            paddingInline: 12,
                        }}
                    >
                        {t('login.refreshUsers')}
                    </Button>
                    <div style={{ color: mutedC, fontSize: 10, marginTop: 6 }}>{t('login.adminSyncHint')}</div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
