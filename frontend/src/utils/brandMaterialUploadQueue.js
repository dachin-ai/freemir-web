import { isVideoMime } from './brandMaterialMedia';

export const BM_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** Above Cloud Run HTTP/1 body cap (~32 MiB) — use signed GCS PUT instead of multipart API. */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 28 * 1024 * 1024;
/** Server-side ffmpeg compression kicks in at this size (must match backend). */
export const VIDEO_COMPRESS_MIN_BYTES = 32 * 1024 * 1024;

export const UPLOAD_STATUS = {
    READY: 'ready',
    UPLOADING: 'uploading',
    DONE: 'done',
    ERROR: 'error',
};

export const UPLOAD_PHASE = {
    PREPARING: 'preparing',
    UPLOADING: 'uploading',
    POSTER: 'poster',
    COMPRESSING: 'compressing',
    FINALIZING: 'finalizing',
};

export function willCompressVideo(file) {
    return isVideoMime(file?.type) && Number(file?.size || 0) >= VIDEO_COMPRESS_MIN_BYTES;
}

/** Direct GCS PUT bypasses Cloud Run body limit — only on production (needs bucket CORS). */
export function shouldUseDirectGcsUpload(file) {
    if (!file || Number(file.size || 0) < DIRECT_UPLOAD_THRESHOLD_BYTES) {
        return false;
    }
    // Local API accepts the full body; signed GCS PUT often fails without bucket CORS.
    if (import.meta.env.MODE === 'development') {
        return false;
    }
    return true;
}

export function uploadPhaseLabel(phase, t) {
    const key = String(phase || '').trim();
    if (key === UPLOAD_PHASE.PREPARING) return t('brandMaterial.uploadPhasePreparing');
    if (key === UPLOAD_PHASE.UPLOADING) return t('brandMaterial.uploadPhaseUploading');
    if (key === UPLOAD_PHASE.POSTER) return t('brandMaterial.uploadPhasePoster');
    if (key === UPLOAD_PHASE.COMPRESSING) return t('brandMaterial.uploadPhaseCompressing');
    if (key === UPLOAD_PHASE.FINALIZING) return t('brandMaterial.uploadPhaseFinalizing');
    return t('brandMaterial.uploadStatusUploading');
}

export function formatUploadBytes(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '—';
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
}

export function isUploadFileTooLarge(file) {
    return Number(file?.size || 0) > BM_UPLOAD_MAX_BYTES;
}

export function uploadErrorLabel(code, t) {
    const key = String(code || '').trim();
    if (key === 'FILE_TOO_LARGE') return t('brandMaterial.uploadFileTooLarge');
    if (key === 'UPLOAD_PAYLOAD_TOO_LARGE') return t('brandMaterial.uploadPayloadTooLarge');
    if (key === 'GCS_OBJECT_MISSING') return t('brandMaterial.uploadGcsMissing');
    if (key === 'SIGNED_URL_FAILED') return t('brandMaterial.uploadSignedUrlFail');
    if (key === 'GCS_DIRECT_UPLOAD_FAILED') return t('brandMaterial.uploadGcsDirectFailed');
    if (key === 'INVALID_SKU') return t('brandMaterial.msgSkuFormat');
    if (key === 'SKU_REQUIRED') return t('brandMaterial.msgSkuRequired');
    if (key === 'MEDIA_REQUIRED' || key === 'IMAGE_REQUIRED') return t('brandMaterial.msgPickMedia');
    if (key === 'TYPE_MIME_MISMATCH') return t('brandMaterial.msgTypeMismatch');
    if (key === 'REQUEST_FAILED' || !key) return t('brandMaterial.msgUploadFail');
    return `${t('brandMaterial.msgUploadFail')}: ${key}`;
}
