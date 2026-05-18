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

const GCS_BUCKET = import.meta.env.VITE_GCS_BUCKET || 'dachin-ai-picture';

/** Public bucket URL — used for video grid preview (preload=metadata, first frame only). */
export function brandMaterialPublicMediaUrl(gcsObjectPath) {
    if (!gcsObjectPath) return null;
    const encoded = gcsObjectPath.split('/').map(encodeURIComponent).join('/');
    return `https://storage.googleapis.com/${GCS_BUCKET}/${encoded}`;
}

/** Capture first video frame in browser for upload poster (lightweight grid thumbnail). */
export function videoFramePosterBlob(file) {
    return new Promise((resolve) => {
        if (!file || !isVideoMime(file.type)) {
            resolve(null);
            return;
        }
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';

        const cleanup = () => {
            URL.revokeObjectURL(url);
            video.removeAttribute('src');
            video.load();
        };

        video.onloadeddata = () => {
            video.currentTime = Math.min(0.1, video.duration || 0.1);
        };
        video.onseeked = () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 320;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    cleanup();
                    resolve(blob);
                }, 'image/jpeg', 0.82);
            } catch {
                cleanup();
                resolve(null);
            }
        };
        video.onerror = () => {
            cleanup();
            resolve(null);
        };
        video.src = url;
    });
}

/** Capture first frame from a remote video URL (public GCS). Falls back if CORS blocks canvas. */
export function videoFramePosterFromUrl(videoUrl) {
    return new Promise((resolve) => {
        if (!videoUrl) {
            resolve(null);
            return;
        }
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';

        const cleanup = () => {
            video.removeAttribute('src');
            video.load();
        };

        const fail = () => {
            cleanup();
            resolve(null);
        };

        video.onloadeddata = () => {
            const t = Math.min(0.5, (video.duration || 1) * 0.05);
            video.currentTime = t;
        };
        video.onseeked = () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 320;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    cleanup();
                    resolve(blob);
                }, 'image/jpeg', 0.82);
            } catch {
                fail();
            }
        };
        video.onerror = fail;
        video.src = videoUrl.includes('#') ? videoUrl : `${videoUrl}#t=0.1`;
    });
}
