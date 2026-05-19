import React, { useState, useMemo, useCallback } from 'react';
import {
    Typography, Button, Row, Col, Upload, message, Table, Tabs, Tag,
    Spin, List, Alert,
} from 'antd';
import {
    InboxOutlined, CloudUploadOutlined, FileExcelOutlined, BarChartOutlined,
    SmileOutlined, FrownOutlined, MehOutlined, PictureOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;
const { Dragger } = Upload;

// Navy headers + blue issue tags + yellow top-3 highlights
const COLOR_NAVY = '#1e3a5f';
const COLOR_NAVY_LIGHT = '#334155';
const COLOR_TOP3 = '#fef9c3';
const COLOR_ISSUE = '#3b82f6';
const COLOR_TYPE = '#ca8a04';
// ─────────────────────────────────────────────────────────────
// Reusable cards
// ─────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, suffix }) => (
    <div
        style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderLeft: `4px solid ${color}`, borderRadius: 12,
            padding: '16px 18px',
        }}
    >
        <Text style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {label}
        </Text>
        <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'Outfit', sans-serif", marginTop: 4 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span style={{ fontSize: 13, marginLeft: 4, color: 'var(--text-muted)', fontWeight: 600 }}>{suffix}</span>}
        </div>
    </div>
);

const fmtPct = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10) / 10;
};

const SentimentBar = ({ pct }) => {
    const neg = fmtPct(pct?.negative);
    const pos = fmtPct(pct?.positive);
    const neu = fmtPct(pct?.neutral ?? Math.max(0, 100 - neg - pos));
    return (
        <div>
            <div style={{
                display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden',
                border: '1px solid var(--border)', background: 'var(--bg-panel)',
            }}>
                <div style={{ width: `${neg}%`, background: '#ef4444' }} title={`Negative ${neg}%`} />
                <div style={{ width: `${neu}%`, background: '#94a3b8' }} title={`Neutral ${neu}%`} />
                <div style={{ width: `${pos}%`, background: '#10b981' }} title={`Positive ${pos}%`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
                    <FrownOutlined /> {neg}%
                </span>
                <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 13 }}>
                    <MehOutlined /> {neu}%
                </span>
                <span style={{ color: '#10b981', fontWeight: 700, fontSize: 13 }}>
                    <SmileOutlined /> {pos}%
                </span>
            </div>
        </div>
    );
};

const headerCell = (label, bgColor = COLOR_NAVY) => (
    <div style={{
        background: bgColor,
        color: '#ffffff',
        border: '1px solid rgba(255,255,255,0.12)',
        padding: '6px 10px',
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 12,
        textAlign: 'center',
        letterSpacing: '0.3px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
    }}>
        {label}
    </div>
);

const top3Style = (row, key) => (
    (row?.highlight_issues || []).includes(key) ? { background: COLOR_TOP3 } : undefined
);

const SENTIMENT_COMPARE_TAGS = ['design', 'material', 'lid'];

const buildSentimentMentionRows = (block) => {
    if (!block) return [];
    const rows = [];
    (block.parts || []).forEach((item) => {
        rows.push({ ...item, mention_type: 'part', rowKey: `p-${item.tag}` });
    });
    (block.issues || []).forEach((item) => {
        rows.push({ ...item, mention_type: 'issue', rowKey: `i-${item.tag}` });
    });
    return rows;
};

const buildSentimentMentionColumns = (t) => [
    {
        title: t('skuReviewAnalysis.colMentionType'),
        dataIndex: 'mention_type',
        key: 'mention_type',
        width: 90,
        render: (v) => (
            <Tag color={v === 'part' ? 'purple' : 'geekblue'}>
                {v === 'part' ? t('skuReviewAnalysis.mentionTypePart') : t('skuReviewAnalysis.mentionTypeIssue')}
            </Tag>
        ),
    },
    {
        title: t('skuReviewAnalysis.colMentionTag'),
        dataIndex: 'tag',
        key: 'tag',
        width: 130,
        render: (name) => {
            const issueLabel = t(`skuReviewAnalysis.issueLabels.${name}`, { defaultValue: '' });
            const partLabel = t(`skuReviewAnalysis.partLabels.${name}`, { defaultValue: '' });
            const display = issueLabel || partLabel || name;
            return <Tag>{display}</Tag>;
        },
    },
    { title: t('skuReviewAnalysis.colMentions'), dataIndex: 'mentions', key: 'mentions', width: 90, align: 'center' },
    {
        title: t('skuReviewAnalysis.sentiment.negative'),
        dataIndex: 'negative',
        key: 'negative',
        width: 100,
        align: 'center',
        render: (v, row) => <Text style={{ color: '#ef4444', fontWeight: 700 }}>{v} ({row.negative_pct}%)</Text>,
    },
    {
        title: t('skuReviewAnalysis.sentiment.positive'),
        dataIndex: 'positive',
        key: 'positive',
        width: 100,
        align: 'center',
        render: (v, row) => <Text style={{ color: '#10b981', fontWeight: 700 }}>{v} ({row.positive_pct}%)</Text>,
    },
    {
        title: t('skuReviewAnalysis.sentiment.neutral'),
        dataIndex: 'neutral',
        key: 'neutral',
        width: 100,
        align: 'center',
        render: (v, row) => <Text style={{ color: '#64748b', fontWeight: 700 }}>{v} ({row.neutral_pct}%)</Text>,
    },
];

const MentionCompareChip = ({ item, t }) => {
    const issueLabel = t(`skuReviewAnalysis.issueLabels.${item.tag}`, { defaultValue: '' });
    const partLabel = t(`skuReviewAnalysis.partLabels.${item.tag}`, { defaultValue: '' });
    const label = issueLabel || partLabel || item.tag;
    const neg = Number(item.negative_pct) || 0;
    const pos = Number(item.positive_pct) || 0;
    const neu = Number(item.neutral_pct) || 0;
    return (
        <div
            style={{
                flex: '1 1 160px',
                minWidth: 140,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
            }}
        >
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{label}</Text>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${neg}%`, background: '#ef4444' }} />
                <div style={{ width: `${neu}%`, background: '#94a3b8' }} />
                <div style={{ width: `${pos}%`, background: '#10b981' }} />
            </div>
            <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                {t('skuReviewAnalysis.sentiment.negative')} {neg}% · {t('skuReviewAnalysis.sentiment.positive')} {pos}%
            </Text>
        </div>
    );
};

const SentimentMentionPanel = ({ sentimentBlock, t, compact = false }) => {
    const rows = useMemo(() => buildSentimentMentionRows(sentimentBlock), [sentimentBlock]);
    const columns = useMemo(() => buildSentimentMentionColumns(t), [t]);
    const hasData = rows.length > 0;
    const compareItems = useMemo(() => {
        const byTag = new Map(rows.map((r) => [r.tag, r]));
        return SENTIMENT_COMPARE_TAGS.map((tag) => byTag.get(tag)).filter(Boolean);
    }, [rows]);

    return (
        <div>
            {!hasData && (
                <Alert
                    type="info"
                    showIcon
                    message={t('skuReviewAnalysis.sentimentMentionEmptyTitle')}
                    description={t('skuReviewAnalysis.sentimentMentionEmptyDesc')}
                    style={{ marginBottom: 12 }}
                />
            )}
            {compareItems.length > 0 && !compact && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    {compareItems.map((item) => (
                        <MentionCompareChip key={item.tag} item={item} t={t} />
                    ))}
                </div>
            )}
            <Table
                dataSource={rows}
                columns={columns}
                rowKey="rowKey"
                size="small"
                pagination={compact ? { pageSize: 10 } : { pageSize: 25, showSizeChanger: true }}
                scroll={{ x: 'max-content' }}
            />
        </div>
    );
};

const SkuReviewAiPanel = ({ aiSummary, aiLoading, onGenerate, t }) => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
                <ThunderboltOutlined style={{ color: '#8b5cf6', fontSize: 18 }} />
                <div>
                    <Text strong>{t('skuReviewAnalysis.aiTitle')}</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        {t('skuReviewAnalysis.aiHint')}
                    </Text>
                </div>
            </div>
            <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                loading={aiLoading}
                onClick={onGenerate}
                style={{ background: '#7c3aed', border: 'none' }}
            >
                {aiLoading ? t('skuReviewAnalysis.aiGenerating') : t('skuReviewAnalysis.aiGenerateBtn')}
            </Button>
        </div>
        {aiLoading && (
            <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin />
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    {t('skuReviewAnalysis.aiGenerating')}
                </Text>
            </div>
        )}
        {aiSummary && !aiLoading && (
            <div>
                <Text style={{ display: 'block', marginBottom: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {aiSummary.executive_summary}
                </Text>
                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Text strong style={{ fontSize: 12, color: COLOR_NAVY }}>
                            {t('skuReviewAnalysis.aiFindings')}
                        </Text>
                        <List
                            size="small"
                            dataSource={aiSummary.key_findings || []}
                            renderItem={(item) => <List.Item style={{ padding: '4px 0', border: 'none' }}>• {item}</List.Item>}
                        />
                    </Col>
                    <Col xs={24} md={12}>
                        <Text strong style={{ fontSize: 12, color: COLOR_NAVY }}>
                            {t('skuReviewAnalysis.aiRecommendations')}
                        </Text>
                        <List
                            size="small"
                            dataSource={aiSummary.recommendations || []}
                            renderItem={(item) => <List.Item style={{ padding: '4px 0', border: 'none' }}>• {item}</List.Item>}
                        />
                    </Col>
                </Row>
                {(aiSummary.priority_skus?.length > 0 || aiSummary.priority_stores?.length > 0) && (
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {aiSummary.priority_skus?.map((s) => (
                            <Tag key={`sku-${s}`} color="blue">{s}</Tag>
                        ))}
                        {aiSummary.priority_stores?.map((s) => (
                            <Tag key={`store-${s}`}>{s}</Tag>
                        ))}
                    </div>
                )}
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 12 }}>
                    {aiSummary.disclaimer} ({aiSummary.model})
                </Text>
            </div>
        )}
    </div>
);

const SkuReviewAnalysis = () => {
    const { t, i18n } = useTranslation();
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [aiSummary, setAiSummary] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const { logActivity } = useAuth();

    const summariesForApi = useCallback((data) => ({
        stats: data?.stats,
        top_issues: data?.top_issues,
        top_parts: data?.top_parts,
        sku_matrix: data?.sku_matrix,
        store_matrix: data?.store_matrix,
        business_types: data?.business_types,
        after_sales_types: data?.after_sales_types,
        sentiment_by_mention: data?.sentiment_by_mention,
    }), []);

    const emptyCell = t('skuReviewAnalysis.emptyCell');
    const labelIssue = useCallback(
        (key) => t(`skuReviewAnalysis.issueLabels.${key}`, { defaultValue: key.replace(/_/g, ' ') }),
        [t],
    );
    const labelPart = useCallback(
        (key) => t(`skuReviewAnalysis.partLabels.${key}`, { defaultValue: key.replace(/_/g, ' ') }),
        [t],
    );
    const labelMeta = useCallback(
        (key) => t(`skuReviewAnalysis.matrixHeaders.${key}`, { defaultValue: key }),
        [t],
    );

    const buildMatrixColumns = useCallback((matrix, idKey) => {
        const issueKeys = matrix?.issue_keys || [];
        if (!matrix?.columns?.length) return [];

        const cols = [];
        const idLabel = idKey === 'store' ? t('skuReviewAnalysis.colStore') : t('skuReviewAnalysis.colSku');
        cols.push({
            title: headerCell(idLabel),
            dataIndex: idKey,
            key: idKey,
            width: 200,
            align: 'left',
            fixed: 'left',
            render: (val) => (
                <Text strong style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{val}</Text>
            ),
        });

        const metaKeys = idKey === 'store'
            ? ['total_orders', 'problem_orders', 'problem_pct']
            : ['orders', 'mentions'];
        metaKeys.forEach((mk) => {
            const isPct = mk.endsWith('_pct');
            cols.push({
                title: headerCell(
                    isPct ? `${labelMeta(mk.replace('_pct', ''))} %` : labelMeta(mk),
                    COLOR_NAVY_LIGHT,
                ),
                dataIndex: mk,
                key: mk,
                width: isPct ? 72 : 88,
                align: 'center',
                sorter: (a, b) => (a[mk] || 0) - (b[mk] || 0),
                render: (v) => {
                    if (isPct) {
                        const n = Number(v) || 0;
                        if (!n) return <Text type="secondary">{emptyCell}</Text>;
                        return <Text style={{ fontWeight: 600 }}>{n}%</Text>;
                    }
                    return <Text strong>{Number(v || 0).toLocaleString()}</Text>;
                },
            });
        });

        const renderIssueCell = (ik, v, row, isPct) => {
            const n = Number(v) || 0;
            const style = top3Style(row, ik);
            if (!n) return <Text type="secondary">{emptyCell}</Text>;
            if (isPct) return <Text style={{ fontWeight: 600, ...style, display: 'block', padding: 4 }}>{n}%</Text>;
            return (
                <Tag color={COLOR_ISSUE} style={{ margin: 0, ...style }}>
                    {n}
                </Tag>
            );
        };

        issueKeys.forEach((ik) => {
            cols.push({
                title: headerCell(`${labelIssue(ik)} #`),
                dataIndex: ik,
                key: ik,
                width: 72,
                align: 'center',
                sorter: (a, b) => (a[ik] || 0) - (b[ik] || 0),
                onCell: (row) => ({ style: top3Style(row, ik) }),
                render: (v, row) => renderIssueCell(ik, v, row, false),
            });
        });

        issueKeys.forEach((ik) => {
            const pctKey = `${ik}_pct`;
            cols.push({
                title: headerCell(`${labelIssue(ik)} %`, COLOR_NAVY_LIGHT),
                dataIndex: pctKey,
                key: pctKey,
                width: 72,
                align: 'center',
                sorter: (a, b) => (a[pctKey] || 0) - (b[pctKey] || 0),
                onCell: (row) => ({ style: top3Style(row, ik) }),
                render: (v, row) => renderIssueCell(ik, v, row, true),
            });
        });

        return cols;
    }, [t, labelIssue, labelMeta, emptyCell]);

    const handleAnalyze = async () => {
        if (!fileList.length) {
            message.warning(t('skuReviewAnalysis.msgUploadFirst'));
            return;
        }
        const formData = new FormData();
        formData.append('file', fileList[0]);
        setLoading(true);
        setResult(null);
        setAiSummary(null);
        try {
            const res = await api.post('/sku-review/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 180000,
            });
            setResult(res.data);
            message.success(t('skuReviewAnalysis.msgSuccess'));
            logActivity(t('skuReviewAnalysis.title'));
        } catch (err) {
            message.error(err.response?.data?.detail || t('skuReviewAnalysis.msgFail'));
        } finally {
            setLoading(false);
        }
    };

    const saveBase64Xlsx = (b64, suffix = '') => {
        const bytes = atob(b64);
        const buf = new Uint8Array(bytes.length).map((_, i) => bytes.charCodeAt(i));
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        Object.assign(document.createElement('a'), {
            href: url,
            download: `SKU_Review_Analysis${suffix}_${date}.xlsx`,
        }).click();
        URL.revokeObjectURL(url);
    };

    const handleGenerateAi = async () => {
        if (!result) return;
        setAiLoading(true);
        try {
            const locale = (i18n.language || 'id').slice(0, 2);
            const res = await api.post('/sku-review/ai-summary', {
                summaries: summariesForApi(result),
                locale,
            });
            setAiSummary(res.data);
            message.success(t('skuReviewAnalysis.msgAiOk'));
            logActivity('SKU Review (AI Summary)');
        } catch (err) {
            message.error(err.response?.data?.detail || t('skuReviewAnalysis.msgAiFail'));
        } finally {
            setAiLoading(false);
        }
    };

    const handleDownload = async (withPhotos = false) => {
        if (!fileList.length) {
            message.warning(t('skuReviewAnalysis.msgUploadFirst'));
            return;
        }
        const needsExport = withPhotos || aiSummary;
        if (!needsExport && result?.file_base64) {
            saveBase64Xlsx(result.file_base64);
            logActivity('SKU Review (Download)');
            return;
        }
        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('include_photos', withPhotos ? 'true' : 'false');
        if (aiSummary) {
            formData.append('ai_summary_json', JSON.stringify(aiSummary));
        }
        setDownloading(true);
        try {
            const res = await api.post('/sku-review/export', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: withPhotos ? 300000 : 120000,
            });
            if (!res.data?.file_base64) throw new Error('empty');
            const suffix = [withPhotos && 'photos', aiSummary && 'ai'].filter(Boolean).join('_');
            saveBase64Xlsx(res.data.file_base64, suffix ? `_${suffix}` : '');
            message.success(
                withPhotos
                    ? t('skuReviewAnalysis.msgDownloadPhotosOk')
                    : t('skuReviewAnalysis.msgDownloadOk'),
            );
            logActivity(withPhotos ? 'SKU Review (Download + Photos)' : 'SKU Review (Download)');
        } catch (err) {
            message.error(err.response?.data?.detail || t('skuReviewAnalysis.msgDownloadFail'));
        } finally {
            setDownloading(false);
        }
    };

    // ─────────────────────────────────────────────────────────
    // Tables
    // ─────────────────────────────────────────────────────────
    const matrixColumns = useMemo(
        () => buildMatrixColumns(result?.sku_matrix, 'sku'),
        [result, buildMatrixColumns],
    );
    const storeMatrixColumns = useMemo(
        () => buildMatrixColumns(result?.store_matrix, 'store'),
        [result, buildMatrixColumns],
    );
    const previewColumns = useMemo(() => [
        { title: t('skuReviewAnalysis.colSku'), dataIndex: 'sku', key: 'sku', width: 130, fixed: 'left' },
        {
            title: t('skuReviewAnalysis.colIssue1'), dataIndex: 'issue_1', key: 'issue_1', width: 120,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelIssue(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colIssue2'), dataIndex: 'issue_2', key: 'issue_2', width: 120,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelIssue(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colIssue3'), dataIndex: 'issue_3', key: 'issue_3', width: 120,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelIssue(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colPart1'), dataIndex: 'part_1', key: 'part_1', width: 110,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelPart(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colPart2'), dataIndex: 'part_2', key: 'part_2', width: 110,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelPart(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colPart3'), dataIndex: 'part_3', key: 'part_3', width: 110,
            render: (v) => (v ? <Tag color={COLOR_ISSUE}>{labelPart(v)}</Tag> : emptyCell),
        },
        {
            title: t('skuReviewAnalysis.colSentiment'), dataIndex: 'sentiment', key: 'sentiment', width: 100,
            render: (v) => {
                const colorMap = { negative: '#ef4444', positive: '#10b981', neutral: '#94a3b8' };
                return <Tag color={colorMap[v]}>{t(`skuReviewAnalysis.sentiment.${v}`, { defaultValue: v })}</Tag>;
            },
        },
        { title: t('skuReviewAnalysis.colDetail'), dataIndex: 'detail', key: 'detail', ellipsis: true },
    ], [t, labelIssue, labelPart, emptyCell]);

    const makeRankColumns = useCallback((tagColor, barColor) => [
        {
            title: t('skuReviewAnalysis.colKeyword'),
            dataIndex: 'name',
            key: 'name',
            render: (name) => {
                const issueLabel = t(`skuReviewAnalysis.issueLabels.${name}`, { defaultValue: '' });
                const partLabel = t(`skuReviewAnalysis.partLabels.${name}`, { defaultValue: '' });
                const display = issueLabel || partLabel || name;
                return <Tag color={tagColor} style={{ fontWeight: 700 }}>{display}</Tag>;
            },
        },
        {
            title: t('skuReviewAnalysis.colCount'), dataIndex: 'count', key: 'count', align: 'center', width: 100,
            render: (v) => <Text strong>{Number(v).toLocaleString()}</Text>,
        },
        {
            title: t('skuReviewAnalysis.colPct'), dataIndex: 'pct', key: 'pct', width: 180, align: 'center',
            render: (pct) => (
                <Progress percent={Number(pct) || 0} size="small" strokeColor={barColor} format={(p) => `${p}%`} />
            ),
        },
    ], [t]);

    const issueRankColumns = useMemo(() => makeRankColumns(COLOR_ISSUE, COLOR_ISSUE), [makeRankColumns]);
    const typeRankColumns = useMemo(() => makeRankColumns(COLOR_TYPE, COLOR_TYPE), [makeRankColumns]);

    const tabItems = result ? [
        {
            key: 'matrix',
            label: t('skuReviewAnalysis.tabMatrix'),
            children: (
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                        {t('skuReviewAnalysis.matrixHint')}
                    </Text>
                    <Table
                        dataSource={result.sku_matrix?.rows || []}
                        columns={matrixColumns}
                        rowKey="sku"
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
                        scroll={{ x: 'max-content' }}
                    />
                </div>
            ),
        },
        {
            key: 'store',
            label: t('skuReviewAnalysis.tabStore'),
            children: (
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                        {t('skuReviewAnalysis.storeHint')}
                    </Text>
                    <Table
                        className="sku-store-matrix"
                        bordered={false}
                        dataSource={result.store_matrix?.rows || []}
                        columns={storeMatrixColumns}
                        rowKey="store"
                        size="small"
                        pagination={{ pageSize: 15, showSizeChanger: true }}
                        scroll={{ x: 'max-content' }}
                    />
                </div>
            ),
        },
        {
            key: 'sentimentMention',
            label: t('skuReviewAnalysis.tabSentimentMention'),
            children: (
                <div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                        {t('skuReviewAnalysis.sentimentMentionHint')}
                    </Text>
                    <SentimentMentionPanel sentimentBlock={result.sentiment_by_mention} t={t} compact />
                </div>
            ),
        },
        {
            key: 'issues',
            label: t('skuReviewAnalysis.tabIssues'),
            children: (
                <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('skuReviewAnalysis.tabIssues')}</Text>
                        <Table dataSource={result.top_issues} columns={issueRankColumns} rowKey="name" pagination={false} size="small" />
                    </Col>
                    <Col xs={24} lg={12}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('skuReviewAnalysis.tabBusinessType')}</Text>
                        <Table dataSource={result.business_types || []} columns={typeRankColumns} rowKey="name" pagination={false} size="small" />
                    </Col>
                </Row>
            ),
        },
        {
            key: 'parts',
            label: t('skuReviewAnalysis.tabParts'),
            children: (
                <Row gutter={[16, 16]}>
                    <Col xs={24} lg={12}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('skuReviewAnalysis.tabParts')}</Text>
                        <Table dataSource={result.top_parts} columns={issueRankColumns} rowKey="name" pagination={false} size="small" />
                    </Col>
                    <Col xs={24} lg={12}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('skuReviewAnalysis.tabAfterSalesType')}</Text>
                        <Table dataSource={result.after_sales_types || []} columns={typeRankColumns} rowKey="name" pagination={false} size="small" />
                    </Col>
                </Row>
            ),
        },
        {
            key: 'preview',
            label: t('skuReviewAnalysis.tabPreview'),
            children: (
                <Table
                    dataSource={result.preview}
                    columns={previewColumns}
                    rowKey={(_, i) => i}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1300 }}
                />
            ),
        },
    ] : [];

    return (
        <div style={{ display: 'block' }}>
            <PageHeader
                title={t('skuReviewAnalysis.title')}
                subtitle={t('skuReviewAnalysis.subtitle')}
                accent="#6366f1"
            />

            <div
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${COLOR_NAVY}`,
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 16,
                }}
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 10px' }}>
                    <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {t('skuReviewAnalysis.expectedColumnsTitle')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
                        {t('skuReviewAnalysis.expectedColumnsDesc')}
                    </Text>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {[
                        t('skuReviewAnalysis.hintBundle'),
                        t('skuReviewAnalysis.hintIssue'),
                        t('skuReviewAnalysis.hintPart'),
                        t('skuReviewAnalysis.hintNegation'),
                        t('skuReviewAnalysis.hintMacro'),
                    ].map((hint) => (
                        <Tag
                            key={hint}
                            style={{
                                margin: 0,
                                fontSize: 11,
                                lineHeight: '20px',
                                padding: '0 8px',
                                borderRadius: 6,
                                background: 'var(--bg-panel)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-muted)',
                            }}
                        >
                            {hint}
                        </Tag>
                    ))}
                </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} lg={result ? 24 : 18}>
                        <Dragger
                            maxCount={1}
                            accept=".xlsx,.xls,.csv"
                            beforeUpload={(file) => { setFileList([file]); return false; }}
                            onRemove={() => setFileList([])}
                            fileList={fileList}
                            style={{ marginBottom: 0 }}
                        >
                            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                                <InboxOutlined style={{ color: COLOR_NAVY, fontSize: 36 }} />
                            </p>
                            <p className="ant-upload-text" style={{ margin: 0 }}>{t('skuReviewAnalysis.uploadText')}</p>
                            <p className="ant-upload-hint" style={{ margin: '4px 0 0' }}>{t('skuReviewAnalysis.uploadHint')}</p>
                        </Dragger>
                    </Col>
                    <Col xs={24} lg={result ? 24 : 6}>
                        <Button
                            block
                            loading={loading}
                            onClick={handleAnalyze}
                            icon={<CloudUploadOutlined />}
                            style={{
                                height: result ? 48 : 100,
                                fontWeight: 700,
                                background: COLOR_NAVY,
                                color: '#fff',
                                border: 'none',
                            }}
                        >
                            {loading ? t('skuReviewAnalysis.analyzingBtn') : t('skuReviewAnalysis.analyzeBtn')}
                        </Button>
                    </Col>
                </Row>
            </div>

            {result && !loading && (
                <div>
                    {/* Top stat row */}
                    <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                        <Col xs={12} sm={8}><StatCard label={t('skuReviewAnalysis.statSourceRows')} value={result.stats.source_rows} color="#6366f1" /></Col>
                        <Col xs={12} sm={8}><StatCard label={t('skuReviewAnalysis.statExpandedRows')} value={result.stats.expanded_rows} color="#06b6d4" /></Col>
                        <Col xs={12} sm={8}><StatCard label={t('skuReviewAnalysis.statUniqueSkus')} value={result.stats.unique_skus} color="#10b981" /></Col>
                        <Col xs={12} sm={8}><StatCard label={t('skuReviewAnalysis.statUniqueOrders')} value={result.stats.unique_orders} color="#0ea5e9" /></Col>
                        <Col xs={12} sm={8}><StatCard label={t('skuReviewAnalysis.statBundleSplits')} value={result.stats.bundle_splits} color="#f59e0b" /></Col>
                        <Col xs={12} sm={8}>
                            <StatCard
                                label={t('skuReviewAnalysis.statCategorized')}
                                value={result.stats.categorized_pct}
                                color="#22c55e"
                                suffix="%"
                            />
                        </Col>
                    </Row>

                    {/* Sentiment block */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <SmileOutlined style={{ color: '#10b981' }} />
                            <Text strong>{t('skuReviewAnalysis.sentimentTitle')}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('skuReviewAnalysis.sentimentHint', {
                                    n: result.stats.sentiment_counts.negative,
                                    p: result.stats.sentiment_counts.positive,
                                    x: result.stats.sentiment_counts.neutral,
                                })}
                            </Text>
                        </div>
                        <SentimentBar pct={result.stats.sentiment_pct} />
                    </div>

                    <SkuReviewAiPanel
                        aiSummary={aiSummary}
                        aiLoading={aiLoading}
                        onGenerate={handleGenerateAi}
                        t={t}
                    />

                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <BarChartOutlined style={{ color: '#6366f1' }} />
                            <Text strong>{t('skuReviewAnalysis.summaryTitle')}</Text>
                        </div>
                        <Tabs items={tabItems} />
                    </div>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Button
                                size="large"
                                block
                                loading={downloading}
                                icon={<FileExcelOutlined />}
                                onClick={() => handleDownload(false)}
                                style={{ height: 52, fontWeight: 700, background: '#10b981', color: '#fff', border: 'none' }}
                            >
                                {t('skuReviewAnalysis.downloadBtn')}
                            </Button>
                        </Col>
                        <Col span={12}>
                            <Button
                                size="large"
                                block
                                loading={downloading}
                                icon={<PictureOutlined />}
                                onClick={() => handleDownload(true)}
                                style={{ height: 52, fontWeight: 700, background: '#0ea5e9', color: '#fff', border: 'none' }}
                            >
                                {t('skuReviewAnalysis.downloadWithPhotosBtn')}
                            </Button>
                        </Col>
                    </Row>
                </div>
            )}
        </div>
    );
};

export default SkuReviewAnalysis;
