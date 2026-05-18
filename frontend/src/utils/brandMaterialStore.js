/**
 * Brand Material catalog — PostgreSQL metadata + Google Cloud Storage (via API).
 */

import api from '../api';
import { extFromMime, isMediaFile } from './brandMaterialMedia';

export function normalizeSku(sku) {
    return (sku || '').trim();
}

/** Download filename — not the original upload name. */
export function storageFileName(item) {
    const ext = extFromMime(item.mimeType);
    if (item.category === 'main') return `${item.sku}_Main.${ext}`;
    return `${item.sku}_Sub(${item.subIndex}).${ext}`;
}

function mapItem(row) {
    const mime = row.mimeType ?? row.mime_type;
    return {
        id: row.id,
        sku: row.sku,
        category: row.category,
        mediaType: row.mediaType ?? row.media_type ?? (mime?.startsWith('video/') ? 'video' : 'photo'),
        subIndex: row.subIndex ?? row.sub_index ?? null,
        mimeType: mime,
        sizeBytes: row.sizeBytes ?? row.size_bytes,
        uploadedAt: row.uploadedAt ?? row.uploaded_at,
        uploadedBy: row.uploadedBy ?? row.uploaded_by ?? '',
    };
}

function apiErrorCode(err) {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail[0]?.msg || 'REQUEST_FAILED';
    return err?.message || 'REQUEST_FAILED';
}

export async function listBrandMaterials({
    page = 1,
    pageSize = 30,
    sku = '',
    category = 'all',
    mediaType = 'all',
} = {}) {
    const { data } = await api.get('/brand-material', {
        params: {
            page,
            page_size: pageSize,
            sku,
            category,
            media_type: mediaType,
        },
    });
    return {
        items: (data.items || []).map(mapItem),
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
    };
}

export async function getBrandMaterialBlob(id) {
    const { data } = await api.get(`/brand-material/${id}/file`, { responseType: 'blob' });
    return data;
}

export async function uploadBrandMaterial({
    sku, category, mediaType, file,
}) {
    const skuNorm = normalizeSku(sku);
    if (!skuNorm) throw new Error('SKU_REQUIRED');
    if (!isMediaFile(file)) throw new Error('MEDIA_REQUIRED');

    const form = new FormData();
    form.append('sku', skuNorm.toUpperCase());
    form.append('category', category || 'sub');
    form.append('mediaType', mediaType || 'photo');
    form.append('file', file);

    try {
        const { data } = await api.post('/brand-material/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
        });
        return mapItem(data.item);
    } catch (err) {
        throw new Error(apiErrorCode(err));
    }
}

export async function updateBrandMaterial(id, { sku, category, mediaType }) {
    const skuNorm = normalizeSku(sku);
    if (!skuNorm) throw new Error('SKU_REQUIRED');

    try {
        const { data } = await api.patch(`/brand-material/${id}`, {
            sku: skuNorm.toUpperCase(),
            category,
            mediaType: mediaType || 'photo',
        });
        return mapItem(data.item);
    } catch (err) {
        throw new Error(apiErrorCode(err));
    }
}

export async function deleteBrandMaterial(id) {
    try {
        await api.delete(`/brand-material/${id}`);
    } catch (err) {
        throw new Error(apiErrorCode(err));
    }
}

export async function deleteBrandMaterialsBulk(ids) {
    try {
        const { data } = await api.post('/brand-material/bulk-delete', { ids });
        return {
            deleted: data.deleted ?? 0,
            notFound: data.notFound ?? [],
        };
    } catch (err) {
        throw new Error(apiErrorCode(err));
    }
}

export function displayLabel(item, t) {
    if (item.category === 'sub' && item.subIndex != null) {
        return `${t('brandMaterial.catSub')} (${item.subIndex})`;
    }
    return t('brandMaterial.catMain');
}

export { isMediaMime, isVideoMime, isImageMime } from './brandMaterialMedia';
