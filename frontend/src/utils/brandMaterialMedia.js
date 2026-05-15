const MIME_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
};

export function isImageMime(mime) {
    return (mime || '').startsWith('image/');
}

export function isVideoMime(mime) {
    return (mime || '').startsWith('video/');
}

export function isMediaMime(mime) {
    return isImageMime(mime) || isVideoMime(mime);
}

export function isMediaFile(file) {
    return file && isMediaMime(file.type);
}

export function mediaTypeFromFile(file) {
    return isVideoMime(file?.type) ? 'video' : 'photo';
}

export function extFromMime(mime) {
    return MIME_EXT[(mime || '').toLowerCase()] || (isVideoMime(mime) ? 'mp4' : 'jpg');
}
