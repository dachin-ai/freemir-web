import React from 'react';
import { Link } from 'react-router-dom';
import { AppstoreOutlined, ArrowRightOutlined, LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { PATH_LOGIN, PATH_TOOLS } from '../../routes/paths';

const USER_KEY = 'fm_user';

function readCachedUser() {
    try {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.username ? parsed : null;
    } catch {
        return null;
    }
}

function getDisplayName(user) {
    if (!user) return '';
    return user.name || user.username || '';
}

function getInitial(name) {
    return name?.charAt(0)?.toUpperCase() || '?';
}

export default function LandingAuthNav({ variant = 'nav', className = '' }) {
    const { user, loading } = useAuth();
    const { t } = useTranslation();

    const activeUser = user || (loading ? readCachedUser() : null);
    if (!activeUser && loading) return null;

    const displayName = getDisplayName(activeUser);

    if (activeUser) {
        if (variant === 'outline') {
            return (
                <Link
                    to={PATH_TOOLS}
                    className={`landing-btn landing-btn-team landing-btn-team--signed-in${className ? ` ${className}` : ''}`}
                    title={t('landing.signedInAs', { name: displayName })}
                >
                    <span className="landing-auth-badge" aria-hidden>{getInitial(displayName)}</span>
                    <span className="landing-auth-name">{displayName}</span>
                    <ArrowRightOutlined />
                </Link>
            );
        }

        return (
            <Link
                to={PATH_TOOLS}
                className={`landing-btn landing-btn-team landing-btn-team--signed-in${className ? ` ${className}` : ''}`}
                title={t('landing.signedInAs', { name: displayName })}
            >
                <span className="landing-auth-badge" aria-hidden>{getInitial(displayName)}</span>
                <span className="landing-btn-team-label landing-auth-name">{displayName}</span>
                <AppstoreOutlined className="landing-auth-tools-icon" aria-hidden />
            </Link>
        );
    }

    if (variant === 'outline') {
        return (
            <Link to={PATH_LOGIN} className={`landing-btn landing-btn-outline${className ? ` ${className}` : ''}`}>
                {t('landing.teamAccess')}
                <ArrowRightOutlined />
            </Link>
        );
    }

    return (
        <Link to={PATH_LOGIN} className={`landing-btn landing-btn-team${className ? ` ${className}` : ''}`}>
            <LoginOutlined />
            <span className="landing-btn-team-label">{t('landing.navTeamLogin')}</span>
        </Link>
    );
}
