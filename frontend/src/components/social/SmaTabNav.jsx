import React from 'react';

import { useTranslation } from 'react-i18next';

import { PlayCircleOutlined, UserOutlined } from '@ant-design/icons';

import SmaSlideToggle from './SmaSlideToggle';



const TABS = [

    { key: 'videos', icon: PlayCircleOutlined, labelKey: 'socialMediaAnalytics.tabVideos' },

    { key: 'profile', icon: UserOutlined, labelKey: 'socialMediaAnalytics.tabProfile' },

];



export default function SmaTabNav({ activeKey, onChange }) {

    const { t } = useTranslation();



    return (

        <SmaSlideToggle

            className="sma-tab-nav"

            value={activeKey}

            onChange={onChange}

            options={TABS.map((tab) => ({

                key: tab.key,

                icon: tab.icon,

                label: t(tab.labelKey),

            }))}

        />

    );

}

