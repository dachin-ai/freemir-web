import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Empty, Pagination, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import CatalogSearchModeSwitch from '../components/brandMaterial/CatalogSearchModeSwitch';
import MaterialDetailSearchGrid from '../components/brandMaterial/MaterialDetailSearchGrid';
import MaterialPreviewModal from '../components/brandMaterial/MaterialPreviewModal';
import MaterialSkuFolderCard from '../components/brandMaterial/MaterialSkuFolderCard';
import {
    listBrandMaterialCoverage,
    prefetchBrandMaterialPreviews,
    searchBrandMaterialDetail,
} from '../utils/brandMaterialStore';
import './brand-material-catalog.css';

const { Text } = Typography;
const PAGE_SIZE = 32; // 4 rows × 8 cols on desktop
const DETAIL_PAGE_SIZE = 24; // 3 rows × 8 cols on desktop
const SEARCH_DEBOUNCE_MS = 280;
const DETAIL_SEARCH_MIN = 2;

function groupItemsByCategory(items) {
    const sections = [];
    const indexByCategory = new Map();
    items.forEach((item) => {
        const category = item.category || 'Other';
        if (!indexByCategory.has(category)) {
            const section = { category, items: [] };
            indexByCategory.set(category, sections.length);
            sections.push(section);
        }
        sections[indexByCategory.get(category)].items.push(item);
    });
    return sections;
}

export default function BrandMaterialSkuList({ onOpenSku, reloadToken = 0, coverOverrides = {} }) {
    const { t } = useTranslation();
    const [searchMode, setSearchMode] = useState('product');
    const [includeDiscontinued, setIncludeDiscontinued] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [detailItems, setDetailItems] = useState([]);
    const [detailTotal, setDetailTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [previewItem, setPreviewItem] = useState(null);
    const loadGenRef = useRef(0);
    const debouncedSearchRef = useRef(debouncedSearch);
    const itemsRef = useRef(items);
    const detailItemsRef = useRef(detailItems);
    const [previewTick, setPreviewTick] = useState(0);

    const isDetailMode = searchMode === 'detail';
    const detailQueryReady = debouncedSearch.trim().length >= DETAIL_SEARCH_MIN;

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        detailItemsRef.current = detailItems;
    }, [detailItems]);

    useEffect(() => {
        debouncedSearchRef.current = debouncedSearch;
    }, [debouncedSearch]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch((searchQuery || '').trim());
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleModeChange = useCallback((mode) => {
        setSearchMode(mode);
        setPage(1);
    }, []);

    const searchPlaceholder = isDetailMode
        ? t('brandMaterial.catalogDetailSearchPh')
        : t('brandMaterial.catalogProductSearchPh');

    const prefetchCovers = useCallback((rows, gen) => {
        const previewIds = (rows || [])
            .map((row) => coverOverrides[row.sku]?.materialId ?? row.mainPhotoMaterialId ?? row.id)
            .filter(Boolean)
            .map((id) => ({ id }));

        if (previewIds.length === 0) return;

        prefetchBrandMaterialPreviews(previewIds, {
            isCancelled: () => gen !== loadGenRef.current,
            onPreview: () => {
                if (gen === loadGenRef.current) {
                    setPreviewTick((n) => n + 1);
                }
            },
        });
    }, [coverOverrides]);

    const loadResults = useCallback(async () => {
        const gen = ++loadGenRef.current;
        const query = debouncedSearchRef.current;
        const hasCached = isDetailMode
            ? detailItemsRef.current.length > 0
            : itemsRef.current.length > 0;

        if (isDetailMode && query.length < DETAIL_SEARCH_MIN) {
            setDetailItems([]);
            setDetailTotal(0);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (hasCached) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setLoadError(false);

        try {
            if (isDetailMode) {
                const result = await searchBrandMaterialDetail({
                    q: query,
                    page,
                    pageSize: DETAIL_PAGE_SIZE,
                    includeDiscontinued,
                });
                if (gen !== loadGenRef.current) return;
                setDetailItems(result.items);
                setDetailTotal(result.total);
                prefetchCovers(result.items, gen);
            } else {
                const result = await listBrandMaterialCoverage({
                    page,
                    pageSize: PAGE_SIZE,
                    sku: query,
                    includeDiscontinued,
                });
                if (gen !== loadGenRef.current) return;
                setItems(result.items);
                setTotal(result.total);
                prefetchCovers(result.items, gen);
            }
        } catch {
            if (gen !== loadGenRef.current) return;
            if (isDetailMode) {
                setDetailItems([]);
                setDetailTotal(0);
            } else {
                setItems([]);
                setTotal(0);
            }
            setLoadError(true);
        } finally {
            if (gen === loadGenRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [isDetailMode, page, debouncedSearch, includeDiscontinued, reloadToken, prefetchCovers]);

    useEffect(() => {
        loadResults();
    }, [loadResults]);

    const categorySections = useMemo(() => {
        const sections = groupItemsByCategory(items);
        let cardIndex = 0;
        return sections.map((section) => ({
            ...section,
            items: section.items.map((row) => {
                const entry = { row, cardIndex };
                cardIndex += 1;
                return entry;
            }),
        }));
    }, [items]);

    const showInitialLoading = loading && (
        isDetailMode
            ? (detailQueryReady ? detailItems.length === 0 : false)
            : items.length === 0
    );
    const showDetailHint = isDetailMode
        && searchQuery.trim().length > 0
        && searchQuery.trim().length < DETAIL_SEARCH_MIN;
    const showDetailIdle = isDetailMode && !searchQuery.trim();

    const openPreview = useCallback((item) => setPreviewItem(item), []);
    const closePreview = useCallback(() => setPreviewItem(null), []);

    const handleOpenSkuFromDetail = useCallback((sku) => {
        onOpenSku?.({ sku });
    }, [onOpenSku]);

    const activePageSize = isDetailMode ? DETAIL_PAGE_SIZE : PAGE_SIZE;
    const activeTotal = isDetailMode ? detailTotal : total;

    return (
        <div className="bm-sku-list">
            <div className="bm-catalog-search-area">
                <div className="bm-catalog-search-toolbar">
                    <CatalogSearchModeSwitch
                        value={searchMode}
                        onChange={handleModeChange}
                        t={t}
                    />
                    <label className="bm-sku-note-search bm-catalog-search" htmlFor="bm-catalog-search">
                        <div className="bm-sku-note-search-field bm-catalog-search-field">
                            <SearchOutlined className="bm-sku-note-search-icon" aria-hidden />
                            <input
                                id="bm-catalog-search"
                                type="search"
                                className="bm-sku-note-search-input"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                autoComplete="off"
                                aria-label={searchPlaceholder}
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    className="bm-sku-note-search-clear"
                                    onClick={() => setSearchQuery('')}
                                    aria-label={t('brandMaterial.searchClear')}
                                >
                                    <CloseOutlined />
                                </button>
                            ) : null}
                            {refreshing ? (
                                <Spin size="small" className="bm-catalog-search-spinner" aria-hidden />
                            ) : null}
                        </div>
                    </label>
                    <Tooltip title={t('brandMaterial.includeDiscontinuedHint')}>
                        <Checkbox
                            className="bm-catalog-include-discontinued"
                            checked={includeDiscontinued}
                            onChange={(e) => {
                                setIncludeDiscontinued(e.target.checked);
                                setPage(1);
                            }}
                        >
                            {t('brandMaterial.includeDiscontinued')}
                        </Checkbox>
                    </Tooltip>
                </div>

                {showDetailIdle && (
                    <Text type="secondary" className="bm-catalog-search-meta">
                        {t('brandMaterial.catalogDetailSearchIdle')}
                    </Text>
                )}
                {showDetailHint && (
                    <Text type="secondary" className="bm-catalog-search-meta">
                        {t('brandMaterial.catalogDetailSearchMin', { min: DETAIL_SEARCH_MIN })}
                    </Text>
                )}
                {isDetailMode && detailQueryReady && !loading && (
                    <Text type="secondary" className="bm-catalog-search-meta">
                        {detailTotal > 0
                            ? t('brandMaterial.catalogDetailSearchCount', { count: detailTotal })
                            : t('brandMaterial.detailSearchEmpty')}
                    </Text>
                )}
                {!isDetailMode && debouncedSearch && !showInitialLoading && (
                    <Text type="secondary" className="bm-catalog-search-meta">
                        {total > 0
                            ? t('brandMaterial.catalogProductSearchCount', { count: total })
                            : t('landing.learnNoResults')}
                    </Text>
                )}
            </div>

            {loadError && (
                <Text type="danger" className="bm-sku-list-error">
                    {isDetailMode
                        ? t('brandMaterial.detailSearchLoadFail')
                        : t('brandMaterial.skuListLoadFail')}
                </Text>
            )}

            {isDetailMode ? (
                showDetailIdle ? (
                    <Empty
                        description={t('brandMaterial.catalogDetailSearchIdle')}
                        className="bm-sku-folder-empty"
                    />
                ) : showDetailHint ? null : (
                    <MaterialDetailSearchGrid
                        items={detailItems}
                        loading={loading}
                        refreshing={refreshing}
                        total={detailTotal}
                        page={page}
                        pageSize={DETAIL_PAGE_SIZE}
                        onPageChange={setPage}
                        onPreview={openPreview}
                        onOpenSku={handleOpenSkuFromDetail}
                        query={debouncedSearch}
                        t={t}
                    />
                )
            ) : showInitialLoading ? (
                <div className="bm-sku-folder-loading">
                    <Spin />
                </div>
            ) : items.length === 0 ? (
                <Empty description={t('brandMaterial.skuListEmpty')} className="bm-sku-folder-empty" />
            ) : (
                <>
                    <div className={`bm-sku-folder-grid${refreshing ? ' is-refreshing' : ''}`}>
                        {categorySections.map((section, sectionIndex) => (
                            <React.Fragment key={section.category}>
                                <div
                                    className={`bm-sku-folder-section-head${sectionIndex === 0 ? ' is-first' : ''}`}
                                >
                                    <h3 className="bm-sku-folder-section-title">{section.category}</h3>
                                    <span className="bm-sku-folder-section-bar" aria-hidden />
                                    <span className="bm-sku-folder-section-count">
                                        {section.items.length}
                                    </span>
                                </div>
                                {section.items.map(({ row, cardIndex }) => (
                                    <MaterialSkuFolderCard
                                        key={row.sku}
                                        row={row}
                                        cardIndex={cardIndex}
                                        onOpen={onOpenSku}
                                        coverOverride={coverOverrides[row.sku]}
                                        previewTick={previewTick}
                                        t={t}
                                    />
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                    {activeTotal > activePageSize && (
                        <div className="bm-sku-folder-pagination">
                            <Pagination
                                current={page}
                                pageSize={activePageSize}
                                total={activeTotal}
                                onChange={setPage}
                                showSizeChanger={false}
                                showTotal={(count, range) => (
                                    isDetailMode
                                        ? t('brandMaterial.detailSearchPageTotal', {
                                            from: range[0],
                                            to: range[1],
                                            total: count,
                                            query: debouncedSearch,
                                        })
                                        : t('brandMaterial.pageTotalSkus', {
                                            from: range[0],
                                            to: range[1],
                                            total: count,
                                        })
                                )}
                            />
                        </div>
                    )}
                </>
            )}

            <MaterialPreviewModal
                item={previewItem}
                open={Boolean(previewItem)}
                onClose={closePreview}
            />
        </div>
    );
}
