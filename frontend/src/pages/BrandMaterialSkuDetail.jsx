import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button, Card, Checkbox, Empty, Flex, Segmented, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
    ArrowLeftOutlined, CloudUploadOutlined, DownloadOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/PageHeader';
import MaterialThumb from '../components/brandMaterial/MaterialThumb';
import MaterialPreviewModal from '../components/brandMaterial/MaterialPreviewModal';
import { listBrandMaterialBySku } from '../utils/brandMaterialStore';
import { isVideoMime } from '../utils/brandMaterialMedia';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Text } = Typography;

function itemIsVideo(item) {
    return item.mediaType === 'video' || isVideoMime(item.mimeType);
}

function formatUploadedAt(iso) {
    if (!iso) return '—';
    const d = dayjs(iso).tz('Asia/Jakarta');
    return d.isValid() ? `${d.format('DD MMM YYYY, HH:mm')} WIB` : '—';
}

export default function BrandMaterialSkuDetail({
    sku,
    typeFilter,
    onTypeFilterChange,
    onBack,
    onUpload,
    skuInfoImageUrl,
    selectedIds,
    onSelect,
    onDownload,
    onEdit,
    reloadToken,
    toolbarExtras,
}) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewItem, setPreviewItem] = useState(null);
    const loadGenRef = useRef(0);

    const loadSku = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        try {
            const result = await listBrandMaterialBySku(sku, { mediaType: typeFilter });
            if (gen !== loadGenRef.current) return;
            setItems(result.items);
        } catch {
            if (gen === loadGenRef.current) setItems([]);
        } finally {
            if (gen === loadGenRef.current) setLoading(false);
        }
    }, [sku, typeFilter]);

    useEffect(() => {
        loadSku();
    }, [loadSku, reloadToken]);

    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    const someSelected = items.some((i) => selectedIds.has(i.id));

    const toggleSelectAll = (checked) => {
        items.forEach((item) => onSelect(item.id, checked, item));
    };

    const thumbFallback = skuInfoImageUrl || null;

    const openPreview = useCallback((row) => setPreviewItem(row), []);
    const closePreview = useCallback(() => setPreviewItem(null), []);

    const columns = useMemo(() => [
        {
            title: (
                <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                />
            ),
            width: 48,
            render: (_, row) => (
                <Checkbox
                    checked={selectedIds.has(row.id)}
                    onChange={(e) => onSelect(row.id, e.target.checked, row)}
                />
            ),
        },
        {
            title: t('brandMaterial.tableColThumb'),
            width: 72,
            render: (_, row) => (
                <MaterialThumb
                    item={row}
                    fallbackUrl={
                        row.category === 'main' && !itemIsVideo(row)
                            ? thumbFallback
                            : null
                    }
                    onPreview={openPreview}
                />
            ),
        },
        {
            title: t('brandMaterial.fieldSku'),
            dataIndex: 'sku',
            width: 132,
            render: (val) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{val}</Text>,
        },
        {
            title: t('brandMaterial.fieldNote'),
            dataIndex: 'note',
            width: 180,
            ellipsis: true,
            render: (val) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {(val || '').trim() || '—'}
                </Text>
            ),
        },
        {
            title: t('brandMaterial.filterType'),
            width: 88,
            render: (_, row) => (
                <Tag color={itemIsVideo(row) ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                    {itemIsVideo(row) ? t('brandMaterial.typeVideo') : t('brandMaterial.typePhoto')}
                </Tag>
            ),
        },
        {
            title: t('brandMaterial.fieldCategory'),
            dataIndex: 'category',
            width: 88,
            render: (cat) => (
                <Tag color={cat === 'main' ? 'green' : 'blue'} style={{ margin: 0 }}>
                    {cat === 'main' ? t('brandMaterial.catMain') : t('brandMaterial.catSub')}
                </Tag>
            ),
        },
        {
            title: t('brandMaterial.metaUploadedAt'),
            dataIndex: 'uploadedAt',
            width: 180,
            render: (val) => (
                <Text type="secondary" style={{ fontSize: 12 }}>{formatUploadedAt(val)}</Text>
            ),
        },
        {
            title: t('brandMaterial.metaUploadedBy'),
            dataIndex: 'uploadedBy',
            width: 120,
            ellipsis: true,
            render: (val) => val || '—',
        },
        {
            title: t('brandMaterial.tableColActions'),
            width: 88,
            fixed: 'right',
            render: (_, row) => (
                <Space size={4}>
                    <Tooltip title={t('brandMaterial.download')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => onDownload(row)}
                            aria-label={t('brandMaterial.download')}
                        />
                    </Tooltip>
                    <Tooltip title={t('brandMaterial.edit')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => onEdit(row)}
                            aria-label={t('brandMaterial.edit')}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ], [
        t, allSelected, someSelected, selectedIds, thumbFallback,
        onSelect, onDownload, onEdit, items, openPreview,
    ]);

    return (
        <div>
            <PageHeader
                title={sku}
                subtitle={t('brandMaterial.skuDetailSubtitle')}
                accent="#0ea5e9"
                actions={(
                    <Space wrap>
                        {onUpload && (
                            <Button type="primary" icon={<CloudUploadOutlined />} onClick={onUpload}>
                                {t('brandMaterial.upload')}
                            </Button>
                        )}
                        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                            {t('brandMaterial.skuDetailBack')}
                        </Button>
                    </Space>
                )}
            />

            <Card
                style={{
                    marginBottom: 20,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                }}
                styles={{ body: { padding: '16px 18px' } }}
            >
                <Flex wrap gap={12} align="center" justify="space-between">
                    <Flex vertical gap={6}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('brandMaterial.filterType')}
                        </Text>
                        <Segmented
                            value={typeFilter}
                            onChange={onTypeFilterChange}
                            options={[
                                { value: 'all', label: t('brandMaterial.filterAll') },
                                { value: 'photo', label: t('brandMaterial.typePhoto') },
                                { value: 'video', label: t('brandMaterial.typeVideo') },
                            ]}
                        />
                    </Flex>
                    {toolbarExtras}
                </Flex>
            </Card>

            <Card
                style={{ borderRadius: 12, border: '1px solid var(--border)' }}
                styles={{ body: { padding: 0 } }}
            >
                <Table
                    className="material-coverage-table"
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={items}
                    sticky
                    pagination={false}
                    locale={{ emptyText: <Empty description={t('brandMaterial.skuDetailEmpty')} /> }}
                    scroll={{ x: 1200, y: 'calc(100vh - 320px)' }}
                />
            </Card>

            <MaterialPreviewModal
                item={previewItem}
                open={Boolean(previewItem)}
                onClose={closePreview}
            />
        </div>
    );
}
