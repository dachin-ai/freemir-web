import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Pagination, Spin, Typography } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MaterialSkuFolderCard from '../components/brandMaterial/MaterialSkuFolderCard';
import { listBrandMaterialCoverage } from '../utils/brandMaterialStore';
import './brand-material-catalog.css';

const { Text } = Typography;
const PAGE_SIZE = 64;

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

export default function BrandMaterialSkuList({ onOpenSku, reloadToken = 0 }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch((searchQuery || '').trim());
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const loadList = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const result = await listBrandMaterialCoverage({
                page,
                pageSize: PAGE_SIZE,
                sku: debouncedSearch,
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
    }, [page, debouncedSearch]);

    useEffect(() => {
        loadList();
    }, [loadList, reloadToken]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

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

    return (
        <div className="bm-sku-list">
            <div className="bm-catalog-search-area">
                <label className="bm-sku-note-search bm-catalog-search" htmlFor="bm-catalog-search">
                    <div className="bm-sku-note-search-field bm-catalog-search-field">
                        <SearchOutlined className="bm-sku-note-search-icon" aria-hidden />
                        <input
                            id="bm-catalog-search"
                            type="search"
                            className="bm-sku-note-search-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('landing.catalogSearchPlaceholder')}
                            autoComplete="off"
                            aria-label={t('landing.catalogSearchPlaceholder')}
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
                    </div>
                </label>
                {debouncedSearch && !loading && (
                    <Text type="secondary" className="bm-catalog-search-meta">
                        {total > 0
                            ? t('landing.catalogSearchCount', { count: total })
                            : t('landing.learnNoResults')}
                    </Text>
                )}
            </div>

            {loadError && (
                <Text type="danger" className="bm-sku-list-error">
                    {t('brandMaterial.skuListLoadFail')}
                </Text>
            )}

            {loading ? (
                <div className="bm-sku-folder-loading">
                    <Spin />
                </div>
            ) : items.length === 0 ? (
                <Empty description={t('brandMaterial.skuListEmpty')} className="bm-sku-folder-empty" />
            ) : (
                <>
                    <div className="bm-sku-folder-grid">
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
                                        t={t}
                                    />
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                    {total > PAGE_SIZE && (
                        <div className="bm-sku-folder-pagination">
                            <Pagination
                                current={page}
                                pageSize={PAGE_SIZE}
                                total={total}
                                onChange={setPage}
                                showSizeChanger={false}
                                showTotal={(count, range) => t('brandMaterial.pageTotalSkus', {
                                    from: range[0],
                                    to: range[1],
                                    total: count,
                                })}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
