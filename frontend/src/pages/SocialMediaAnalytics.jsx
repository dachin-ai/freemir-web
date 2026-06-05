import React, { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import api from '../api';
import { BarChartOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import SmaApifyToken, { MODE_ENV, MODE_MANUAL, MODE_SAVED } from '../components/social/SmaApifyToken';
import SmaTabNav from '../components/social/SmaTabNav';
import SmaVideosTab from '../components/social/SmaVideosTab';
import SmaProfileTab from '../components/social/SmaProfileTab';
import './social-media-analytics.css';

export default function SocialMediaAnalytics() {
    const { t } = useTranslation();
    const { logActivity } = useAuth();
    const [tokenMode, setTokenMode] = useState(MODE_MANUAL);
    const [selectedTokenId, setSelectedTokenId] = useState(null);
    const [manualToken, setManualToken] = useState('');
    const [savedTokens, setSavedTokens] = useState([]);
    const [config, setConfig] = useState(null);
    const [activeTab, setActiveTab] = useState('videos');

    useEffect(() => {
        api.get('/social-media-analytics/config')
            .then((res) => setConfig(res.data))
            .catch(() => setConfig({ apify_configured: false }));
    }, []);

    const requireToken = useCallback(() => {
        if (tokenMode === MODE_SAVED && selectedTokenId) {
            return { apify_token_id: selectedTokenId };
        }
        if (tokenMode === MODE_MANUAL && manualToken.trim()) {
            return { apify_token: manualToken.trim() };
        }
        if (tokenMode === MODE_ENV && config?.apify_configured) {
            return {};
        }
        if (savedTokens.length > 0 && selectedTokenId) {
            return { apify_token_id: selectedTokenId };
        }
        if (config?.apify_configured) {
            return {};
        }
        message.warning(t('socialMediaAnalytics.tokenRequired'));
        return null;
    }, [tokenMode, selectedTokenId, manualToken, config, savedTokens, t]);

    return (
        <form className="sma-page" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <PageHeader
                title={t('socialMediaAnalytics.title')}
                subtitle={t('socialMediaAnalytics.subtitle')}
                icon={<BarChartOutlined />}
            />

            <div className="sma-token-wrap">
                <SmaApifyToken
                    config={config}
                    mode={tokenMode}
                    onModeChange={setTokenMode}
                    selectedTokenId={selectedTokenId}
                    onSelectedTokenIdChange={setSelectedTokenId}
                    manualValue={manualToken}
                    onManualChange={(e) => setManualToken(e.target.value)}
                    onTokensChange={setSavedTokens}
                />
            </div>

            <SmaTabNav activeKey={activeTab} onChange={setActiveTab} />

            <div className="sma-tab-content">
                {activeTab === 'videos' && (
                    <SmaVideosTab
                        requireToken={requireToken}
                        logActivity={logActivity}
                    />
                )}
                {activeTab === 'profile' && (
                    <SmaProfileTab requireToken={requireToken} />
                )}
            </div>
        </form>
    );
}
