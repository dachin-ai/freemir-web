import React, { useMemo } from 'react';
import { Table, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    buildSnapshotHistoryRows,
    formatDelta,
    formatFetchedAt,
    formatNum,
} from '../../utils/smaHelpers';

const { Text } = Typography;

function DeltaBadge({ delta, isPct }) {
    if (delta == null) return null;
    let label = formatDelta(delta);
    if (label == null) return null;
    if (isPct) label = `${label}%`;
    const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
    return <span className={`sma-metric-delta ${cls}`}>{label}</span>;
}

function MetricCell({ value, delta, isPct }) {
    const display = isPct
        ? (value != null && value !== '' ? `${Number(value).toFixed(2)}%` : '—')
        : formatNum(value);
    return (
        <span className="sma-metric-cell">
            <span className="sma-metric-val">{display}</span>
            <DeltaBadge delta={delta} isPct={isPct} />
        </span>
    );
}

export default function VideoPerformanceHistoryTable({ snapshots, showShares = true }) {
    const { t } = useTranslation();
    const rows = useMemo(() => buildSnapshotHistoryRows(snapshots), [snapshots]);

    const columns = useMemo(() => {
        const metricCol = (title, dataIndex, deltaKey, isPct = false) => ({
            title,
            dataIndex,
            align: 'center',
            className: 'sma-col-num',
            render: (v, row) => (
                <MetricCell value={v} delta={row[deltaKey]} isPct={isPct} />
            ),
        });

        const cols = [
            {
                title: '#',
                dataIndex: '_index',
                width: 44,
                align: 'center',
                className: 'sma-col-rank',
            },
            {
                title: t('socialMediaAnalytics.colFetchedAt'),
                dataIndex: 'fetched_at',
                width: 150,
                render: (v) => (
                    <Text className="sma-fetched-at-cell">{formatFetchedAt(v)}</Text>
                ),
            },
            metricCol(t('socialMediaAnalytics.colViews'), 'views', 'views_delta'),
            metricCol(t('socialMediaAnalytics.colLikes'), 'likes', 'likes_delta'),
            metricCol(t('socialMediaAnalytics.colComments'), 'comments', 'comments_delta'),
        ];

        if (showShares) {
            cols.push(metricCol(t('socialMediaAnalytics.colShares'), 'shares', 'shares_delta'));
        }
        cols.push(
            metricCol(t('socialMediaAnalytics.colSaves'), 'saves', 'saves_delta'),
            metricCol(t('socialMediaAnalytics.colER'), 'engagement_rate', 'engagement_rate_delta', true),
        );
        return cols;
    }, [t, showShares]);

    if (!rows.length) return null;

    return (
        <div className="sma-perf-history-table">
            <div className="sma-perf-history-head">
                <Text strong>{t('socialMediaAnalytics.perfHistoryTableTitle')}</Text>
                <Text type="secondary" className="sma-perf-history-hint">
                    {t('socialMediaAnalytics.perfHistoryTableHint')}
                </Text>
            </div>
            <Table
                className="sma-data-table sma-perf-history-grid"
                columns={columns}
                dataSource={rows}
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
            />
        </div>
    );
}
