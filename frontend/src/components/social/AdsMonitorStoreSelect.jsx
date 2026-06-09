import React from 'react';
import { Button, Select, Spin, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export default function AdsMonitorStoreSelect({
    value,
    onChange,
    stores,
    loading,
    error,
    warning,
    onRetry,
    className,
    placeholder,
    showError = true,
}) {
    const { t } = useTranslation();
    const options = (stores || []).map((s) => ({
        value: s.code,
        label: `${s.code} — ${s.name}`,
    }));

    return (
        <div className="ads-monitor-store-select-wrap">
            <Select
                showSearch
                allowClear
                className={className}
                placeholder={placeholder || t('adsMonitor.storePh')}
                value={value}
                onChange={onChange}
                loading={loading}
                optionFilterProp="label"
                options={options}
                notFoundContent={loading ? (
                    <div className="ads-monitor-stores-not-found">
                        <Spin size="small" />
                    </div>
                ) : (
                    <div className="ads-monitor-stores-not-found">
                        <Text type="secondary">{t('adsMonitor.stores.notFound')}</Text>
                        {onRetry && (
                            <Button
                                type="link"
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={onRetry}
                            >
                                {t('adsMonitor.stores.retry')}
                            </Button>
                        )}
                    </div>
                )}
                dropdownRender={(menu) => (
                    <>
                        {menu}
                        {onRetry && (
                            <div className="ads-monitor-stores-dropdown-footer">
                                <Button
                                    type="link"
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    loading={loading}
                                    onClick={onRetry}
                                >
                                    {t('adsMonitor.stores.refresh')}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            />
            {warning && !error && (
                <Text type="warning" className="ads-monitor-stores-hint">
                    {warning}
                </Text>
            )}
            {showError && error && (
                <div className="ads-monitor-stores-error">
                    <Text type="danger" className="ads-monitor-stores-error-text">
                        {error}
                    </Text>
                    {onRetry && (
                        <Button
                            type="link"
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={loading}
                            onClick={onRetry}
                        >
                            {t('adsMonitor.stores.retry')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
