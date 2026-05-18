import React, { useCallback, useEffect, useState } from 'react';
import {
    Button, Card, Empty, Flex, Input, Table, Typography, Image, Space,
} from 'antd';

const { Title } = Typography;
import { FolderOpenOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    getBrandMaterialPreviewBlob,
    listBrandMaterialCoverage,
} from '../utils/brandMaterialStore';
import { parseSkuFilterInput } from '../utils/skuIndex';

const { Text } = Typography;
const PAGE_SIZE = 50;

const thumbPlaceholderStyle = {
    width: 48,
    height: 48,
    borderRadius: 8,
    background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

function SkuListThumb({ row }) {
    const [src, setSrc] = useState(row.skuInfoImageUrl || null);

    useEffect(() => {
        let blobUrl;
        let cancelled = false;

        const load = async () => {
            if (row.mainPhotoMaterialId) {
                try {
                    const blob = await getBrandMaterialPreviewBlob(row.mainPhotoMaterialId);
                    if (cancelled) return;
                    if (blob?.size) {
                        const url = URL.createObjectURL(blob);
                        blobUrl = url;
                        setSrc(url);
                        return;
                    }
                } catch {
                    /* fallback to SKU_Info */
                }
            }
            if (!cancelled) setSrc(row.skuInfoImageUrl || null);
        };

        load();
        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [row.mainPhotoMaterialId, row.skuInfoImageUrl]);

    if (!src) {
        return (
            <div style={thumbPlaceholderStyle}>
                <Text type="secondary" style={{ fontSize: 10 }}>—</Text>
            </div>
        );
    }

    return (
        <Image
            src={src}
            alt={row.sku}
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 8 }}
            preview={false}
            fallback="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        />
    );
}

function CountCell({ main, sub, t }) {
    return (
        <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>
                {t('brandMaterial.catMain')}: <Text strong>{main}</Text>
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
                {t('brandMaterial.catSub')}: <Text strong>{sub}</Text>
            </Text>
        </Space>
    );
}

export default function BrandMaterialSkuList({ onOpenSku, reloadToken = 0 }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [skuFilter, setSkuFilter] = useState('');
    const [debouncedSku, setDebouncedSku] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loadError, setLoadError] = useState(false);

    const filterTokens = parseSkuFilterInput(skuFilter);

    useEffect(() => {
        const timer = setTimeout(() => {
            const tokens = parseSkuFilterInput(skuFilter);
            setDebouncedSku(tokens.length ? tokens.join(' ') : (skuFilter || '').trim().toUpperCase());
        }, 400);
        return () => clearTimeout(timer);
    }, [skuFilter]);

    const loadList = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        const tokens = parseSkuFilterInput(debouncedSku);
        const requestPageSize = tokens.length > 1
            ? Math.min(Math.max(tokens.length, PAGE_SIZE), 200)
            : PAGE_SIZE;
        try {
            const result = await listBrandMaterialCoverage({
                page: tokens.length > 1 ? 1 : page,
                pageSize: requestPageSize,
                sku: debouncedSku,
            });
            setItems(result.items);
            setTotal(result.total);
        } catch {
            setItems([]);
            setTotal(0);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSku]);

    useEffect(() => {
        loadList();
    }, [loadList, reloadToken]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSku]);

    const columns = [
        {
            title: t('brandMaterial.skuListColPhoto'),
            width: 72,
            render: (_, row) => <SkuListThumb row={row} />,
        },
        {
            title: '#',
            width: 56,
            render: (_, __, idx) => (page - 1) * PAGE_SIZE + idx + 1,
        },
        {
            title: t('brandMaterial.fieldSku'),
            dataIndex: 'sku',
            width: 140,
            render: (sku) => <Text strong style={{ fontFamily: 'monospace' }}>{sku}</Text>,
        },
        {
            title: t('brandMaterial.skuListColName'),
            dataIndex: 'productName',
            ellipsis: true,
            render: (name) => name || '—',
        },
        {
            title: t('brandMaterial.typeVideo'),
            width: 120,
            render: (_, row) => (
                <CountCell main={row.videoMain} sub={row.videoSub} t={t} />
            ),
        },
        {
            title: t('brandMaterial.typePhoto'),
            width: 120,
            render: (_, row) => (
                <CountCell main={row.photoMain} sub={row.photoSub} t={t} />
            ),
        },
        {
            title: t('brandMaterial.skuListColOpen'),
            width: 148,
            render: (_, row) => (
                row.hasMaterials ? (
                    <Button
                        type="primary"
                        size="middle"
                        icon={<FolderOpenOutlined />}
                        onClick={() => onOpenSku(row)}
                        style={{
                            fontWeight: 600,
                            minWidth: 108,
                            height: 36,
                            borderRadius: 8,
                            boxShadow: '0 1px 4px rgba(14, 165, 233, 0.35)',
                        }}
                    >
                        {t('brandMaterial.skuListOpen')}
                    </Button>
                ) : (
                    <Text type="secondary">—</Text>
                )
            ),
        },
    ];

    return (
        <>
            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                {t('brandMaterial.skuListHeading')}
            </Title>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                {t('brandMaterial.skuListSubtitle')}
            </Text>
            <Card
                style={{
                    marginBottom: 20,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                }}
                styles={{ body: { padding: '16px 18px' } }}
            >
                <div style={{ flex: '1 1 320px', maxWidth: 480 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        {t('brandMaterial.filterSku')}
                    </Text>
                    <Input.TextArea
                        allowClear
                        value={skuFilter}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        placeholder={t('brandMaterial.filterSkuPh')}
                        onChange={(e) => setSkuFilter((e.target.value || '').toUpperCase())}
                        onPaste={(e) => {
                            const pasted = e.clipboardData?.getData('text') || '';
                            const tokens = parseSkuFilterInput(pasted);
                            if (tokens.length === 0) return;
                            e.preventDefault();
                            const merged = [...new Set([
                                ...parseSkuFilterInput(skuFilter),
                                ...tokens,
                            ])];
                            setSkuFilter(merged.join(' '));
                        }}
                        onBlur={() => {
                            const tokens = parseSkuFilterInput(skuFilter);
                            if (tokens.length > 0) setSkuFilter(tokens.join(' '));
                        }}
                    />
                    {filterTokens.length > 1 && (
                        <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                            {t('brandMaterial.filterSkuMulti', { count: filterTokens.length })}
                        </Text>
                    )}
                </div>
            </Card>

            {loadError && (
                <Card style={{ marginBottom: 16, borderColor: '#f87171' }}>
                    <Text type="danger">{t('brandMaterial.skuListLoadFail')}</Text>
                </Card>
            )}

            <Card
                style={{ borderRadius: 12, border: '1px solid var(--border)' }}
                styles={{ body: { padding: 0 } }}
            >
                <Table
                    className="material-coverage-table"
                    rowKey="sku"
                    loading={loading}
                    columns={columns}
                    dataSource={items}
                    sticky
                    pagination={{
                        current: page,
                        pageSize: PAGE_SIZE,
                        total,
                        showSizeChanger: false,
                        onChange: (p) => setPage(p),
                        showTotal: (count, range) => t('brandMaterial.pageTotalSkus', {
                            from: range[0],
                            to: range[1],
                            total: count,
                        }),
                    }}
                    locale={{ emptyText: <Empty description={t('brandMaterial.skuListEmpty')} /> }}
                    scroll={{ x: 1000, y: 'calc(100vh - 380px)' }}
                />
            </Card>
        </>
    );
}
