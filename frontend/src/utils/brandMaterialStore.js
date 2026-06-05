/**
 * Brand Material catalog — PostgreSQL metadata + Google Cloud Storage (via API).
 */

import api from '../api';
import { extFromMime, isMediaFile, isVideoMime, videoFramePosterBlob } from './brandMaterialMedia';

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
        note: row.note ?? '',
        gcsObjectPath: row.gcsObjectPath ?? row.gcs_object_path ?? '',
        hasPreview: Boolean(row.hasPreview ?? row.has_preview),
    };
}

function apiErrorCode(err) {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail[0]?.msg || 'REQUEST_FAILED';
    return err?.message || 'REQUEST_FAILED';
}

export async function listBrandMaterialCoverage({
    page = 1,
    pageSize = 50,
    sku = '',
} = {}) {
    const { data } = await api.get('/brand-material/coverage', {
        params: {
            page,
            page_size: pageSize,
            sku,
        },
    });
    return {
        items: (data.items || []).map((row) => ({
            sku: row.sku,
            productName: row.productName ?? row.product_name ?? '',
            skuInfoImageUrl: row.skuInfoImageUrl ?? row.sku_info_image_url ?? '',
            mainPhotoMaterialId: row.mainPhotoMaterialId ?? row.main_photo_material_id ?? null,
            videoMain: row.videoMain ?? row.video_main ?? 0,
            videoSub: row.videoSub ?? row.video_sub ?? 0,
            photoMain: row.photoMain ?? row.photo_main ?? 0,
            photoSub: row.photoSub ?? row.photo_sub ?? 0,
            hasMaterials: Boolean(row.hasMaterials ?? row.has_materials),
        })),
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
    };
}

export async function listBrandMaterialFolders({
    page = 1,
    pageSize = 24,
    sku = '',
    mediaType = 'all',
} = {}) {
    const { data } = await api.get('/brand-material/folders', {
        params: {
            page,
            page_size: pageSize,
            sku,
            media_type: mediaType,
        },
    });
    return {
        folders: (data.folders || []).map((f) => ({
            sku: f.sku,
            cover: f.cover ? mapItem(f.cover) : null,
            children: (f.children || []).map(mapItem),
            itemCount: f.itemCount ?? f.item_count ?? 0,
        })),
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
    };
}

export async function listBrandMaterialBySku(sku, { mediaType = 'all' } = {}) {
    const { data } = await api.get(`/brand-material/sku/${encodeURIComponent(sku)}`, {
        params: { media_type: mediaType },
    });
    return {
        sku: data.sku ?? sku,
        items: (data.items || []).map(mapItem),
    };
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

export async function getBrandMaterialPreviewBlob(id) {
    const { data } = await api.get(`/brand-material/${id}/preview`, { responseType: 'blob' });
    return data;
}

const PREVIEW_CONCURRENCY = 6;

/** Load grid thumbnails in background (limited parallelism). */
export async function prefetchBrandMaterialPreviews(items, { onPreview, isCancelled }) {
    if (!items.length) return;

    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            if (isCancelled?.()) return;
            const row = items[next];
            next += 1;
            try {
                const blob = await getBrandMaterialPreviewBlob(row.id);
                if (isCancelled?.() || !blob?.size) return;
                onPreview(row.id, blob);
            } catch {
                /* skip broken preview */
            }
        }
    };

    const n = Math.min(PREVIEW_CONCURRENCY, items.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
}

export async function uploadBrandMaterial({
    sku, category, mediaType, file, note = '',
}) {
    const skuNorm = normalizeSku(sku);
    if (!skuNorm) throw new Error('SKU_REQUIRED');
    if (!isMediaFile(file)) throw new Error('MEDIA_REQUIRED');

    const form = new FormData();
    form.append('sku', skuNorm.toUpperCase());
    form.append('category', category || 'sub');
    form.append('mediaType', mediaType || 'photo');
    form.append('note', (note || '').trim().slice(0, 500));
    form.append('file', file);

    if (isVideoMime(file.type)) {
        const poster = await videoFramePosterBlob(file);
        if (poster) form.append('poster', poster, 'poster.jpg');
    }

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

export async function updateBrandMaterial(id, { sku, category, mediaType, note }) {
    const skuNorm = normalizeSku(sku);
    if (!skuNorm) throw new Error('SKU_REQUIRED');

    try {
        const { data } = await api.patch(`/brand-material/${id}`, {
            sku: skuNorm.toUpperCase(),
            category,
            mediaType: mediaType || 'photo',
            note: note == null ? '' : String(note).trim().slice(0, 500),
        });
        return mapItem(data.item);
    } catch (err) {
        throw new Error(apiErrorCode(err));
    }
}

export async function reorderBrandMaterialSubs(sku, mediaType, orderedIds) {
    try {
        const { data } = await api.post('/brand-material/reorder', {
            sku: normalizeSku(sku).toUpperCase(),
            mediaType,
            orderedIds,
        });
        return data;
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

export function displayLabel(item, t, { compact = false } = {}) {
    if (item.category === 'sub' && item.subIndex != null) {
        if (compact) {
            return `${t('brandMaterial.catSubShort')}${item.subIndex}`;
        }
        return `${t('brandMaterial.catSub')} (${item.subIndex})`;
    }
    return compact ? t('brandMaterial.catMainShort') : t('brandMaterial.catMain');
}

export { isMediaMime, isVideoMime, isImageMime } from './brandMaterialMedia';
