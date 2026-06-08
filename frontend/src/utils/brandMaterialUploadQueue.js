export const BM_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export const UPLOAD_STATUS = {
    READY: 'ready',
    UPLOADING: 'uploading',
    DONE: 'done',
    ERROR: 'error',
};

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
    if (key === 'INVALID_SKU') return t('brandMaterial.msgSkuFormat');
    if (key === 'SKU_REQUIRED') return t('brandMaterial.msgSkuRequired');
    if (key === 'MEDIA_REQUIRED' || key === 'IMAGE_REQUIRED') return t('brandMaterial.msgPickMedia');
    if (key === 'TYPE_MIME_MISMATCH') return t('brandMaterial.msgTypeMismatch');
    if (key === 'REQUEST_FAILED' || !key) return t('brandMaterial.msgUploadFail');
    return `${t('brandMaterial.msgUploadFail')}: ${key}`;
}
