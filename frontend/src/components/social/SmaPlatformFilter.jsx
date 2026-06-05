import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';

export default function SmaPlatformFilter({ value, onChange, style }) {
    const { t } = useTranslation();
    return (
        <Select
            allowClear
            placeholder={t('socialMediaAnalytics.filterPlatform')}
            style={{ width: 140, ...style }}
            value={value}
            onChange={onChange}
            options={[
                { value: 'tiktok', label: 'TikTok' },
                { value: 'instagram', label: 'Instagram' },
            ]}
        />
    );
}
