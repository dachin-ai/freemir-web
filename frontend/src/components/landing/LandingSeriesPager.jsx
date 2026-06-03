import React from 'react';
import { Pagination } from 'antd';

export default function LandingSeriesPager({
    products = [],
    pageSize,
    currentPage,
    onPageChange,
    renderProductCard,
}) {
    const totalInSeries = products.length;
    const totalPages = Math.max(1, Math.ceil(totalInSeries / pageSize));
    const page = Math.min(Math.max(1, currentPage), totalPages);

    if (totalInSeries <= pageSize) {
        return (
            <div
                className="landing-product-row landing-series-product-row"
                style={{ '--series-cols': pageSize }}
            >
                {products.map((p) => renderProductCard(p))}
            </div>
        );
    }

    return (
        <>
            <div className="landing-series-viewport" aria-live="polite">
                <div
                    className="landing-series-track"
                    style={{
                        '--series-pages': totalPages,
                        '--series-page': page,
                    }}
                >
                    {Array.from({ length: totalPages }, (_, pageIndex) => {
                        const slice = products.slice(
                            pageIndex * pageSize,
                            (pageIndex + 1) * pageSize,
                        );
                        return (
                            <div
                                key={pageIndex}
                                className="landing-series-page"
                                aria-hidden={pageIndex + 1 !== page}
                            >
                                <div
                                    className="landing-product-row landing-series-product-row"
                                    style={{ '--series-cols': pageSize }}
                                >
                                    {slice.map((p) => renderProductCard(p))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="landing-series-pagination">
                <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={totalInSeries}
                    onChange={onPageChange}
                    showSizeChanger={false}
                    size="small"
                    showLessItems
                />
            </div>
        </>
    );
}
