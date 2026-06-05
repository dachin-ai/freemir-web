import React, { useMemo } from 'react';

import { Empty, Table } from 'antd';

import { useTranslation } from 'react-i18next';

import { formatNum } from '../../utils/smaHelpers';

import { PROFILE_TOP_VIDEOS_LIMIT } from '../../utils/smaConstants';



function buildPostColumns(t, platform) {

    return [

        {

            title: '#',

            width: 44,

            align: 'center',

            className: 'sma-col-rank',

            render: (_, __, i) => i + 1,

        },

        {

            title: t('socialMediaAnalytics.colViews'),

            dataIndex: 'views',

            width: 90,

            align: 'center',

            render: (v) => formatNum(v),

        },

        {

            title: t('socialMediaAnalytics.colLikes'),

            dataIndex: 'likes',

            width: 80,

            align: 'center',

            render: (v) => formatNum(v),

        },

        {

            title: t('socialMediaAnalytics.colComments'),

            dataIndex: 'comments',

            width: 90,

            align: 'center',

            render: (v) => formatNum(v),

        },

        ...(platform === 'tiktok' ? [{

            title: t('socialMediaAnalytics.colShares'),

            dataIndex: 'shares',

            width: 80,

            align: 'center',

            render: (v) => formatNum(v),

        }] : []),

        {

            title: t('socialMediaAnalytics.profileColCaption'),

            dataIndex: 'caption',

            ellipsis: true,

        },

        {

            title: t('socialMediaAnalytics.profileOpenLink'),

            dataIndex: 'url',

            width: 72,

            align: 'center',

            render: (url) => (url ? (

                <a href={url} target="_blank" rel="noopener noreferrer">

                    {t('socialMediaAnalytics.profileOpenLink')}

                </a>

            ) : '—'),

        },

    ];

}



export default function ProfileVideosTable({ posts, platform }) {

    const { t } = useTranslation();



    const columns = useMemo(

        () => buildPostColumns(t, platform),

        [t, platform],

    );

    const visiblePosts = useMemo(

        () => (posts || []).slice(0, PROFILE_TOP_VIDEOS_LIMIT),

        [posts],

    );



    if (!visiblePosts.length) {

        return (

            <Empty

                image={Empty.PRESENTED_IMAGE_SIMPLE}

                description={t('socialMediaAnalytics.profileNoVideosSaved')}

            />

        );

    }



    return (

        <Table

            className="sma-data-table sma-profile-recent-table"

            rowKey={(r, i) => r.url || `row-${i}`}

            size="small"

            bordered

            showHeader

            tableLayout="fixed"

            pagination={false}

            scroll={{ x: 820 }}

            columns={columns}

            dataSource={visiblePosts}

        />

    );

}


