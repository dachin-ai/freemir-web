import React, { useMemo } from 'react';
import { Pagination } from 'antd';

function buildLabelSegments(groups, pageStart, pageEnd) {
    let globalIdx = 0;
    const segments = [];

    groups.forEach((group) => {
        let span = 0;
        (group.products || []).forEach(() => {
            if (globalIdx >= pageStart && globalIdx < pageEnd) span += 1;
            globalIdx += 1;
        });
        if (span > 0) {
            segments.push({
                key: group.name,
                title: group.title,
                count: group.countLabel,
                span,
            });
        }
    });

    return segments;
}

export default function LandingMergedSeriesBlock({
    groups = [],
    pageSize,
    currentPage,
    onPageChange,
    renderProductCard,
}) {
    const products = useMemo(
        () => groups.flatMap((g) => g.products || []),
        [groups],
    );

    const totalInSeries = products.length;
    const totalPages = Math.max(1, Math.ceil(totalInSeries / pageSize));
    const page = Math.min(Math.max(1, currentPage), totalPages);
    const pageStart = (page - 1) * pageSize;
    const pageEnd = pageStart + pageSize;

    const labelSegments = useMemo(
        () => buildLabelSegments(groups, pageStart, pageEnd),
        [groups, pageStart, pageEnd],
    );

    const productRow = (rowProducts) => (
        <div
            className="landing-product-row landing-series-product-row landing-series-product-row--merged"
            style={{ '--series-cols': pageSize }}
        >
            {rowProducts.map((p) => renderProductCard(p))}
        </div>
    );

    return (
        <div className="landing-series-merged-body">
            {labelSegments.length > 0 && (
                <div
                    className="landing-series-merged-labels"
                    style={{ '--series-cols': pageSize }}
                >
                    {labelSegments.map((seg) => (
                        <div
                            key={seg.key}
                            className="landing-series-merged-label"
                            style={{ gridColumn: `span ${seg.span}` }}
                        >
                            <span className="landing-series-merged-label-title">{seg.title}</span>
                            <span className="landing-series-merged-label-count">{seg.count}</span>
                        </div>
                    ))}
                </div>
            )}

            {totalInSeries <= pageSize ? (
                productRow(products)
            ) : (
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
                                        {productRow(slice)}
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
            )}
        </div>
    );
}
