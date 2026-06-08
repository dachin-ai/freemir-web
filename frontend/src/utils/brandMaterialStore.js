/**
 * Product Gallery catalog — PostgreSQL metadata + Google Cloud Storage (via API).
 */

import axios from 'axios';
import api from '../api';
import {
    UPLOAD_PHASE,
    shouldUseDirectGcsUpload,
    willCompressVideo,
} from './brandMaterialUploadQueue';
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
        compression: row.compression ?? null,
    };
}

function apiErrorCode(err) {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail[0]?.msg || 'REQUEST_FAILED';
    if (err?.response?.status === 413) return 'UPLOAD_PAYLOAD_TOO_LARGE';
    const msg = String(err?.message || '');
    if (!err?.response && /network error/i.test(msg)) {
        return 'GCS_DIRECT_UPLOAD_FAILED';
    }
    return msg || 'REQUEST_FAILED';
}

export async function searchBrandMaterialDetail({
    q = '',
    page = 1,
    pageSize = 24,
} = {}) {
    const { data } = await api.get('/brand-material/search-detail', {
        params: { q, page, page_size: pageSize },
    });
    return {
        items: (data.items || []).map((row) => ({
            ...mapItem(row),
            productName: row.productName ?? row.product_name ?? '',
        })),
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
    };
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
            category: row.category ?? row.category_l2 ?? row.category_l1 ?? 'Other',
            skuInfoImageUrl: row.skuInfoImageUrl ?? row.sku_info_image_url ?? '',
            mainPhotoMaterialId: row.mainPhotoMaterialId ?? row.main_photo_material_id ?? null,
            videoMain: row.videoMain ?? row.video_main ?? 0,
            videoSub: row.videoSub ?? row.video_sub ?? 0,
            photoMain: row.photoMain ?? row.photo_main ?? 0,
            photoSub: row.photoSub ?? row.photo_sub ?? 0,
            hasMaterials: Boolean(row.hasMaterials ?? row.has_materials),
            isDiscontinued: Boolean(row.isDiscontinued ?? row.is_discontinued),
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
const previewUrlCache = new Map();

/** Cached blob URL for grid/folder thumbnails — avoids duplicate preview API calls. */
export async function getBrandMaterialPreviewUrl(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const cached = previewUrlCache.get(key);
    if (cached) return cached;

    const blob = await getBrandMaterialPreviewBlob(key);
    if (!blob?.size) return null;
    const url = URL.createObjectURL(blob);
    previewUrlCache.set(key, url);
    return url;
}

export function invalidateBrandMaterialPreviewCache(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const url = previewUrlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    previewUrlCache.delete(key);
}

export function clearBrandMaterialPreviewCache() {
    previewUrlCache.forEach((url) => URL.revokeObjectURL(url));
    previewUrlCache.clear();
}

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
                const url = await getBrandMaterialPreviewUrl(row.id);
                if (isCancelled?.() || !url) return;
                onPreview(row.id, url);
            } catch {
                /* skip broken preview */
            }
        }
    };

    const n = Math.min(PREVIEW_CONCURRENCY, items.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
}

async function uploadBrandMaterialDirect({
    sku, category, mediaType, file, note = '', onProgress, onPhase,
}) {
    const skuNorm = normalizeSku(sku).toUpperCase();
    const mime = file.type || 'application/octet-stream';
    const mt = mediaType || (isVideoMime(mime) ? 'video' : 'photo');
    const cat = category || 'sub';
    const needsCompress = willCompressVideo(file);
    const setPhase = (phase) => onPhase?.(phase);

    setPhase(UPLOAD_PHASE.PREPARING);
    const { data: init } = await api.post('/brand-material/upload/direct/init', {
        sku: skuNorm,
        category: cat,
        mediaType: mt,
        mimeType: mime,
        sizeBytes: file.size,
    });

    setPhase(UPLOAD_PHASE.UPLOADING);
    await axios.put(init.signedUrl, file, {
        headers: { 'Content-Type': init.contentType || mime },
        timeout: 600000,
        onUploadProgress: onProgress
            ? (evt) => {
                if (!evt.total) return;
                onProgress(Math.min(92, Math.round((evt.loaded / evt.total) * 92)));
            }
            : undefined,
    });

    const form = new FormData();
    form.append('materialId', init.materialId);
    form.append('objectPath', init.objectPath);
    form.append('sku', skuNorm);
    form.append('category', cat);
    form.append('mediaType', mt);
    form.append('mimeType', mime);
    form.append('note', (note || '').trim().slice(0, 500));

    if (isVideoMime(mime)) {
        setPhase(UPLOAD_PHASE.POSTER);
        if (onProgress) onProgress(93);
        const poster = await videoFramePosterBlob(file);
        if (poster) form.append('poster', poster, 'poster.jpg');
    }

    setPhase(needsCompress ? UPLOAD_PHASE.COMPRESSING : UPLOAD_PHASE.FINALIZING);
    if (onProgress) onProgress(needsCompress ? 94 : 97);

    const { data } = await api.post('/brand-material/upload/direct/complete', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
    });

    if (onProgress) onProgress(100);
    return mapItem(data.item);
}

export async function uploadBrandMaterial({
    sku, category, mediaType, file, note = '', onProgress, onPhase,
}) {
    const skuNorm = normalizeSku(sku);
    if (!skuNorm) throw new Error('SKU_REQUIRED');
    if (!isMediaFile(file)) throw new Error('MEDIA_REQUIRED');

    try {
        if (shouldUseDirectGcsUpload(file)) {
            return await uploadBrandMaterialDirect({
                sku, category, mediaType, file, note, onProgress, onPhase,
            });
        }

        const needsCompress = willCompressVideo(file);
        onPhase?.(UPLOAD_PHASE.PREPARING);
        const form = new FormData();
        form.append('sku', skuNorm.toUpperCase());
        form.append('category', category || 'sub');
        form.append('mediaType', mediaType || 'photo');
        form.append('note', (note || '').trim().slice(0, 500));
        form.append('file', file);

        if (isVideoMime(file.type)) {
            onPhase?.(UPLOAD_PHASE.POSTER);
            const poster = await videoFramePosterBlob(file);
            if (poster) form.append('poster', poster, 'poster.jpg');
        }

        onPhase?.(UPLOAD_PHASE.UPLOADING);
        const { data } = await api.post('/brand-material/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 600000,
            onUploadProgress: onProgress
                ? (evt) => {
                    if (!evt.total) return;
                    const sent = evt.loaded >= evt.total;
                    const pct = sent
                        ? 82
                        : Math.min(82, Math.round((evt.loaded / evt.total) * 82));
                    onProgress(pct);
                    if (needsCompress && sent) {
                        onPhase?.(UPLOAD_PHASE.COMPRESSING);
                    } else if (!needsCompress && sent) {
                        onPhase?.(UPLOAD_PHASE.FINALIZING);
                    }
                }
                : undefined,
        });
        if (onProgress) onProgress(100);
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
