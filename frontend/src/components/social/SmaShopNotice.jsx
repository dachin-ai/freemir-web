import React from 'react';
import { Alert } from 'antd';
import { ShoppingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export default function SmaShopNotice() {
    const { t } = useTranslation();

    return (
        <Alert
            className="sma-shop-notice"
            type="warning"
            showIcon
            icon={<ShoppingOutlined />}
            message={t('socialMediaAnalytics.shopNoticeShort')}
        />
    );
}
