import { useEffect, useState } from 'react';

/** Product cards per row in series section (single-row layout). */
export function getSeriesRowPageSize(width = typeof window !== 'undefined' ? window.innerWidth : 1200) {
    if (width < 480) return 2;
    if (width < 768) return 3;
    if (width < 1100) return 4;
    return 6;
}

export function useSeriesRowPageSize() {
    const [pageSize, setPageSize] = useState(() => getSeriesRowPageSize());

    useEffect(() => {
        const onResize = () => setPageSize(getSeriesRowPageSize(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return pageSize;
}
