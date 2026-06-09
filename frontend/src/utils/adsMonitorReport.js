import dayjs from 'dayjs';
import 'dayjs/locale/id';
import 'dayjs/locale/zh-cn';
import * as XLSX from 'xlsx';

export function fmtAmount(value) {
    const n = Number(value || 0);
    if (!n) return '';
    return Math.round(n).toLocaleString('id-ID');
}

export function fmtRoi(gmv, cost) {
    const g = Number(gmv || 0);
    const c = Number(cost || 0);
    if (!g || !c) return '';
    return (g / c).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRatio(cost, gmv) {
    const g = Number(gmv || 0);
    const c = Number(cost || 0);
    if (!g || !c) return '';
    return `${((c / g) * 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtRoiNumber(value) {
    if (!value) return '';
    return value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRatioNumber(value) {
    if (!value) return '';
    return `${value.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function weekdayLabel(dateIso, language) {
    const lang = (language || 'en').toLowerCase();
    const locale = lang.startsWith('zh') ? 'zh-cn' : lang.startsWith('id') ? 'id' : 'en';
    return dayjs(dateIso).locale(locale).format('dddd');
}

export function buildDayMetrics(segments) {
    if (!segments) {
        return null;
    }
    const pc = segments.productCard || {};
    const internal = segments.internalCreator || {};
    const external = segments.externalCreator || {};
    const pcGmv = pc.gmv || 0;
    const pcCost = pc.cost || 0;
    const inGmv = internal.gmv || 0;
    const inCost = internal.cost || 0;
    const exGmv = external.gmv || 0;
    const exCost = external.cost || 0;
    return {
        pcGmv, pcCost, inGmv, inCost, exGmv, exCost,
        totalGmv: pcGmv + inGmv + exGmv,
        totalCost: pcCost + inCost + exCost,
    };
}

export function buildSectionGroups(t) {
    const seg = {
        productCard: t('adsMonitor.report.segmentProductCard'),
        inhouse: t('adsMonitor.report.segmentInhouse'),
        external: t('adsMonitor.report.segmentExternal'),
    };
    const total = t('adsMonitor.report.totalLabel');

    return [
        {
            key: 'gmv',
            title: t('adsMonitor.report.sectionGmv'),
            palette: 'blue',
            rows: [
                { key: 'pc_gmv', section: 'gmv', label: seg.productCard, kind: 'amount', pick: (m) => m?.pcGmv },
                { key: 'in_gmv', section: 'gmv', label: seg.inhouse, kind: 'amount', pick: (m) => m?.inGmv },
                { key: 'ex_gmv', section: 'gmv', label: seg.external, kind: 'amount', pick: (m) => m?.exGmv },
                { key: 'total_gmv', section: 'gmv-total', label: total, kind: 'amount', pick: (m) => m?.totalGmv, strong: true },
            ],
        },
        {
            key: 'cost',
            title: t('adsMonitor.report.sectionCost'),
            palette: 'pink',
            rows: [
                { key: 'pc_cost', section: 'cost', label: seg.productCard, kind: 'amount', pick: (m) => m?.pcCost },
                { key: 'in_cost', section: 'cost', label: seg.inhouse, kind: 'amount', pick: (m) => m?.inCost },
                { key: 'ex_cost', section: 'cost', label: seg.external, kind: 'amount', pick: (m) => m?.exCost },
                { key: 'total_cost', section: 'cost-total', label: total, kind: 'amount', pick: (m) => m?.totalCost, strong: true },
            ],
        },
        {
            key: 'roi',
            title: t('adsMonitor.report.sectionRoi'),
            palette: 'blue',
            rows: [
                { key: 'pc_roi', section: 'roi', label: seg.productCard, kind: 'roi', pick: (m) => (m ? [m.pcGmv, m.pcCost] : null) },
                { key: 'in_roi', section: 'roi', label: seg.inhouse, kind: 'roi', pick: (m) => (m ? [m.inGmv, m.inCost] : null) },
                { key: 'ex_roi', section: 'roi', label: seg.external, kind: 'roi', pick: (m) => (m ? [m.exGmv, m.exCost] : null) },
                { key: 'total_roi', section: 'roi-total', label: total, kind: 'roi', pick: (m) => (m ? [m.totalGmv, m.totalCost] : null), strong: true },
            ],
        },
        {
            key: 'ratio',
            title: t('adsMonitor.report.sectionRatio'),
            palette: 'pink',
            rows: [
                { key: 'pc_ratio', section: 'ratio', label: seg.productCard, kind: 'ratio', pick: (m) => (m ? [m.pcCost, m.pcGmv] : null) },
                { key: 'in_ratio', section: 'ratio', label: seg.inhouse, kind: 'ratio', pick: (m) => (m ? [m.inCost, m.inGmv] : null) },
                { key: 'ex_ratio', section: 'ratio', label: seg.external, kind: 'ratio', pick: (m) => (m ? [m.exCost, m.exGmv] : null) },
                { key: 'total_ratio', section: 'ratio-total', label: total, kind: 'ratio', pick: (m) => (m ? [m.totalCost, m.totalGmv] : null), strong: true },
            ],
        },
    ];
}

export function buildReportContext(report) {
    const metricsByDate = new Map();
    (report?.dates || []).forEach((col) => {
        metricsByDate.set(col.date, buildDayMetrics(col.segments));
    });
    const dateCols = report?.dates || [];
    const filledMetrics = dateCols
        .filter((col) => col.hasData)
        .map((col) => metricsByDate.get(col.date))
        .filter(Boolean);
    return { metricsByDate, dateCols, filledMetrics };
}

function renderCell(row, metrics) {
    if (!metrics) return '';
    const picked = row.pick(metrics);
    if (!picked && picked !== 0) return '';
    if (row.kind === 'amount') return fmtAmount(picked);
    if (row.kind === 'roi') return fmtRoi(picked[0], picked[1]);
    if (row.kind === 'ratio') return fmtRatio(picked[0], picked[1]);
    return '';
}

export function renderAggregate(row, filledMetrics, mode) {
    if (!filledMetrics.length) return '';

    if (row.kind === 'amount') {
        const values = filledMetrics.map((m) => Number(row.pick(m) || 0));
        if (!values.length) return '';
        const sum = values.reduce((acc, v) => acc + v, 0);
        if (mode === 'sum') return fmtAmount(sum);
        return fmtAmount(sum / values.length);
    }

    if (row.kind === 'roi') {
        const pairs = filledMetrics
            .map((m) => row.pick(m))
            .filter((p) => p && p[0] > 0 && p[1] > 0);
        if (!pairs.length) return '';
        if (mode === 'sum') {
            const totalGmv = pairs.reduce((acc, [g]) => acc + g, 0);
            const totalCost = pairs.reduce((acc, [, c]) => acc + c, 0);
            return fmtRoi(totalGmv, totalCost);
        }
        const avg = pairs.reduce((acc, [g, c]) => acc + (g / c), 0) / pairs.length;
        return fmtRoiNumber(avg);
    }

    if (row.kind === 'ratio') {
        const pairs = filledMetrics
            .map((m) => row.pick(m))
            .filter((p) => p && p[0] > 0 && p[1] > 0);
        if (!pairs.length) return '';
        if (mode === 'sum') {
            const totalCost = pairs.reduce((acc, [c]) => acc + c, 0);
            const totalGmv = pairs.reduce((acc, [, g]) => acc + g, 0);
            return fmtRatio(totalCost, totalGmv);
        }
        const avg = pairs.reduce((acc, [c, g]) => acc + ((c / g) * 100), 0) / pairs.length;
        return fmtRatioNumber(avg);
    }

    return '';
}

export function exportMonthlyReportXlsx(report, t, language) {
    if (!report?.dates?.some((d) => d.hasData)) {
        return false;
    }
    const sectionGroups = buildSectionGroups(t);
    const { metricsByDate, dateCols, filledMetrics } = buildReportContext(report);

    const headers = [
        t('adsMonitor.report.part'),
        t('adsMonitor.report.detail'),
        t('adsMonitor.report.average'),
        t('adsMonitor.report.sum'),
        ...dateCols.map((col) => `${col.label} (${weekdayLabel(col.date, language)})`),
    ];

    const rows = [];
    sectionGroups.forEach((group) => {
        group.rows.forEach((row, rowIndex) => {
            rows.push([
                rowIndex === 0 ? group.title : '',
                row.label,
                renderAggregate(row, filledMetrics, 'avg'),
                renderAggregate(row, filledMetrics, 'sum'),
                ...dateCols.map((col) => renderCell(row, metricsByDate.get(col.date))),
            ]);
        });
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ads Monitor');
    const month = String(report.month).padStart(2, '0');
    XLSX.writeFile(wb, `ads-monitor_${report.storeCode}_${report.year}-${month}.xlsx`);
    return true;
}
