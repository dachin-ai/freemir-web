import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Space } from 'antd';
import {
    ArrowLeftOutlined, CloudUploadOutlined, CloseOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import PageHeader from '../components/PageHeader';
import MaterialCatalogGrid from '../components/brandMaterial/MaterialCatalogGrid';
import MaterialPreviewModal from '../components/brandMaterial/MaterialPreviewModal';
import MaterialTypeSwitch from '../components/brandMaterial/MaterialTypeSwitch';
import { listBrandMaterialBySku } from '../utils/brandMaterialStore';
import './brand-material-catalog.css';

function catalogLangKey(i18nLanguage) {
    const key = (i18nLanguage || 'id').slice(0, 2).toLowerCase();
    return ['id', 'en', 'zh'].includes(key) ? key : 'id';
}

export default function BrandMaterialSkuDetail({
    sku,
    typeFilter,
    onTypeFilterChange,
    onBack,
    onUpload,
    skuInfoImageUrl,
    productNameFallback = '',
    selectedIds,
    onSelect,
    onSelectMany,
    onDownload,
    onEdit,
    reloadToken,
    toolbarExtras,
}) {
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState([]);
    const [noteQuery, setNoteQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [previewItem, setPreviewItem] = useState(null);
    const [productSubtitle, setProductSubtitle] = useState(productNameFallback || '');
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

    useEffect(() => {
        let cancelled = false;
        const lang = catalogLangKey(i18n.language);

        api.get(`/public/landing-products/${encodeURIComponent(sku)}`, {
            params: { currency: 'IDR', lang },
            timeout: 30000,
        })
            .then((res) => {
                if (cancelled) return;
                const name = String(res.data?.name || '').trim();
                setProductSubtitle(name || productNameFallback || '');
            })
            .catch(() => {
                if (!cancelled) setProductSubtitle(productNameFallback || '');
            });

        return () => { cancelled = true; };
    }, [sku, i18n.language, productNameFallback]);

    const thumbFallback = skuInfoImageUrl || null;

    const filteredItems = useMemo(() => {
        const q = noteQuery.trim().toLowerCase();
        if (!q) return items;
        return items.filter((item) => (item.note || '').toLowerCase().includes(q));
    }, [items, noteQuery]);

    const openPreview = useCallback((row) => setPreviewItem(row), []);
    const closePreview = useCallback(() => setPreviewItem(null), []);

    return (
        <div>
            <PageHeader
                title={sku}
                subtitle={productSubtitle || undefined}
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
                className="bm-sku-toolbar-card"
                styles={{ body: { padding: '14px 16px' } }}
            >
                <div className="bm-sku-toolbar">
                    <div className="bm-sku-filter-group">
                        <span className="bm-sku-filter-label">{t('brandMaterial.filterType')}</span>
                        <MaterialTypeSwitch
                            value={typeFilter}
                            onChange={onTypeFilterChange}
                            t={t}
                        />
                    </div>
                    <div className="bm-sku-filter-group bm-sku-filter-group--search">
                        <label className="bm-sku-note-search" htmlFor="bm-note-search">
                            <span className="bm-sku-filter-label">{t('brandMaterial.filterNote')}</span>
                            <div className="bm-sku-note-search-field">
                                <SearchOutlined className="bm-sku-note-search-icon" aria-hidden />
                                <input
                                    id="bm-note-search"
                                    type="search"
                                    className="bm-sku-note-search-input"
                                    value={noteQuery}
                                    onChange={(e) => setNoteQuery(e.target.value)}
                                    placeholder={t('brandMaterial.filterNotePh')}
                                    autoComplete="off"
                                />
                                {noteQuery ? (
                                    <button
                                        type="button"
                                        className="bm-sku-note-search-clear"
                                        onClick={() => setNoteQuery('')}
                                        aria-label={t('brandMaterial.filterNoteClear')}
                                    >
                                        <CloseOutlined />
                                    </button>
                                ) : null}
                            </div>
                        </label>
                    </div>
                    {toolbarExtras ? (
                        <div className="bm-sku-toolbar-actions">
                            {toolbarExtras}
                        </div>
                    ) : null}
                </div>
            </Card>

            <Card
                style={{ borderRadius: 12, border: '1px solid var(--border)' }}
                styles={{ body: { padding: '16px 18px' } }}
            >
                <MaterialCatalogGrid
                    sku={sku}
                    items={filteredItems}
                    loading={loading}
                    typeFilter={typeFilter}
                    thumbFallback={thumbFallback}
                    selectedIds={selectedIds}
                    onSelect={onSelect}
                    onSelectMany={onSelectMany}
                    onPreview={openPreview}
                    onDownload={onDownload}
                    onEdit={onEdit}
                    onItemsChange={setItems}
                    noteQuery={noteQuery}
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
