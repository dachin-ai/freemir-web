import React, { useMemo } from 'react';
import { Button, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    buildReportContext,
    buildSectionGroups,
    renderAggregate,
    weekdayLabel,
} from '../../utils/adsMonitorReport';

function renderCell(row, metrics) {
    if (!metrics) return '';
    const picked = row.pick(metrics);
    if (!picked && picked !== 0) return '';
    if (row.kind === 'amount') {
        const n = Number(picked || 0);
        if (!n) return '';
        return Math.round(n).toLocaleString('id-ID');
    }
    if (row.kind === 'roi') {
        const g = Number(picked[0] || 0);
        const c = Number(picked[1] || 0);
        if (!g || !c) return '';
        return (g / c).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (row.kind === 'ratio') {
        const c = Number(picked[0] || 0);
        const g = Number(picked[1] || 0);
        if (!g || !c) return '';
        return `${((c / g) * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    }
    return '';
}

function DataRow({
    row, group, rowIndex, dateCols, metricsByDate, filledMetrics,
}) {
    return (
        <tr
            className={[
                'ads-monitor-report-row',
                `ads-monitor-report-row--${row.section}`,
                `ads-monitor-report-row--palette-${group.palette}`,
                row.strong ? 'is-strong' : '',
            ].filter(Boolean).join(' ')}
        >
            {rowIndex === 0 && (
                <th
                    rowSpan={group.rows.length}
                    className={`ads-monitor-report-row-part ads-monitor-report-row-part--${group.palette}`}
                >
                    {group.title}
                </th>
            )}
            <th className="ads-monitor-report-row-label">{row.label}</th>
            <td className="ads-monitor-report-cell ads-monitor-report-cell--aggregate">
                {renderAggregate(row, filledMetrics, 'avg')}
            </td>
            <td className="ads-monitor-report-cell ads-monitor-report-cell--aggregate">
                {renderAggregate(row, filledMetrics, 'sum')}
            </td>
            {dateCols.map((col) => (
                <td key={`${row.key}-${col.date}`} className="ads-monitor-report-cell">
                    {renderCell(row, metricsByDate.get(col.date))}
                </td>
            ))}
        </tr>
    );
}

export default function AdsMonitorMonthlyGrid({ report, t, onDeleteDate, deletingDate }) {
    const { i18n } = useTranslation();
    const sectionGroups = useMemo(() => buildSectionGroups(t), [t]);
    const { metricsByDate, dateCols, filledMetrics } = useMemo(
        () => buildReportContext(report),
        [report],
    );

    const hasAnyData = filledMetrics.length > 0;

    if (!report) {
        return null;
    }

    if (!dateCols.length || !hasAnyData) {
        return (
            <div className="ads-monitor-report-empty">
                {t('adsMonitor.report.noDataMonth')}
            </div>
        );
    }

    return (
        <div className="ads-monitor-report-scroll">
            <table className="ads-monitor-report-table">
                <thead>
                    <tr>
                        <th className="ads-monitor-report-head ads-monitor-report-head--part">
                            {t('adsMonitor.report.part')}
                        </th>
                        <th className="ads-monitor-report-head ads-monitor-report-head--detail">
                            {t('adsMonitor.report.detail')}
                        </th>
                        <th className="ads-monitor-report-head ads-monitor-report-head--aggregate">
                            {t('adsMonitor.report.average')}
                        </th>
                        <th className="ads-monitor-report-head ads-monitor-report-head--aggregate">
                            {t('adsMonitor.report.sum')}
                        </th>
                        {dateCols.map((col) => (
                            <th key={col.date} className="ads-monitor-report-head ads-monitor-report-head--date">
                                <div className="ads-monitor-report-date-head">
                                    <div className="ads-monitor-report-date-text">
                                        <span className="ads-monitor-report-date-label">{col.label}</span>
                                        <span className="ads-monitor-report-weekday">
                                            {weekdayLabel(col.date, i18n.language)}
                                        </span>
                                    </div>
                                    {col.hasData && onDeleteDate && (
                                        <Popconfirm
                                            title={t('adsMonitor.delete.dayTitle')}
                                            description={t('adsMonitor.delete.dayConfirm', { date: col.label })}
                                            okText={t('adsMonitor.delete.dayConfirmBtn')}
                                            cancelText={t('adsMonitor.cancel')}
                                            okButtonProps={{ danger: true, loading: deletingDate === col.date }}
                                            onConfirm={() => onDeleteDate(col.date)}
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                className="ads-monitor-date-delete-btn"
                                                icon={<DeleteOutlined />}
                                                aria-label={t('adsMonitor.delete.dayBtn')}
                                                loading={deletingDate === col.date}
                                            />
                                        </Popconfirm>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sectionGroups.map((group) => (
                        group.rows.map((row, rowIndex) => (
                            <DataRow
                                key={row.key}
                                row={row}
                                group={group}
                                rowIndex={rowIndex}
                                dateCols={dateCols}
                                metricsByDate={metricsByDate}
                                filledMetrics={filledMetrics}
                            />
                        ))
                    ))}
                </tbody>
            </table>
        </div>
    );
}
