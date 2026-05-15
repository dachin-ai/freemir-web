import JSZip from 'jszip';
import { getBrandMaterialBlob, storageFileName } from './brandMaterialStore';

function uniqueZipEntryName(name, used) {
    if (!used.has(name)) {
        used.add(name);
        return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    while (used.has(`${base}_${n}${ext}`)) n += 1;
    const finalName = `${base}_${n}${ext}`;
    used.add(finalName);
    return finalName;
}

/** Download catalog items as one .zip file. */
export async function downloadMaterialsAsZip(items, zipBaseName = 'brand_material') {
    if (!items?.length) return 0;
    const zip = new JSZip();
    const used = new Set();
    let added = 0;

    for (const item of items) {
        const blob = await getBrandMaterialBlob(item.id);
        if (!blob) continue;
        const entry = uniqueZipEntryName(storageFileName(item), used);
        zip.file(entry, blob);
        added += 1;
    }

    if (!added) return 0;

    const stamp = new Date().toISOString().slice(0, 10);
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${zipBaseName}_${stamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    return added;
}
