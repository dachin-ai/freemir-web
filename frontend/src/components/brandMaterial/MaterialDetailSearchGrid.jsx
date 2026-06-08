import React from 'react';
import { Empty, Pagination, Spin } from 'antd';
import MaterialSearchResultCard from './MaterialSearchResultCard';

export default function MaterialDetailSearchGrid({
    items,
    loading,
    refreshing,
    total,
    page,
    pageSize,
    onPageChange,
    onPreview,
    onOpenSku,
    query,
    t,
}) {
    const showInitialLoading = loading && items.length === 0;

    if (showInitialLoading) {
        return (
            <div className="bm-sku-folder-loading">
                <Spin />
            </div>
        );
    }

    if (!items.length) {
        return (
            <Empty
                description={t('brandMaterial.detailSearchEmpty')}
                className="bm-sku-folder-empty"
            />
        );
    }

    return (
        <>
            <div className={`bm-detail-search-grid${refreshing ? ' is-refreshing' : ''}`}>
                {items.map((item, index) => (
                    <MaterialSearchResultCard
                        key={item.id}
                        item={item}
                        cardIndex={index}
                        onPreview={onPreview}
                        onOpenSku={onOpenSku}
                        t={t}
                    />
                ))}
            </div>
            {total > pageSize && (
                <div className="bm-sku-folder-pagination">
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={total}
                        onChange={onPageChange}
                        showSizeChanger={false}
                        showTotal={(count, range) => t('brandMaterial.detailSearchPageTotal', {
                            from: range[0],
                            to: range[1],
                            total: count,
                            query,
                        })}
                    />
                </div>
            )}
        </>
    );
}
