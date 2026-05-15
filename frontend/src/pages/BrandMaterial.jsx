import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AutoComplete, Button, Card, Checkbox, Col, Empty, Flex, Modal, Row, Segmented, Select, Space,
    Tag, Typography, Upload, message, Popconfirm, Table, Tooltip,
} from 'antd';
import {
    CloudUploadOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined,
    SearchOutlined, ReloadOutlined, MinusCircleOutlined, InboxOutlined,
    EditOutlined, FileZipOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
    listBrandMaterials,
    uploadBrandMaterial,
    updateBrandMaterial,
    deleteBrandMaterial,
    getBrandMaterialBlob,
    displayLabel,
    storageFileName,
    normalizeSku,
} from '../utils/brandMaterialStore';
import { isMediaFile, isVideoMime, mediaTypeFromFile } from '../utils/brandMaterialMedia';
import { downloadMaterialsAsZip } from '../utils/brandMaterialDownload';

function itemIsVideo(item) {
    return item.mediaType === 'video' || isVideoMime(item.mimeType);
}
import {
    buildSkuIndex,
    searchSkuIndex,
    normalizeSkuInput,
    isValidFreemirSku,
    parseBrandMaterialFileName,
    parseSkuFilterInput,
    SKU_LENGTH,
} from '../utils/skuIndex';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

function newRowId() {
    return `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function MediaPreview({ previewUrl, mimeType, alt, style = {} }) {
    const boxStyle = {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        ...style,
    };
    if (!previewUrl) return null;
    if (mimeType && (mimeType.startsWith('video/') || mimeType === 'video')) {
        return (
            <video
                src={previewUrl}
                controls
                muted
                playsInline
                preload="metadata"
                style={boxStyle}
            />
        );
    }
    return <img src={previewUrl} alt={alt} style={boxStyle} />;
}

function MaterialCard({
    item, previewUrl, selected, onSelect, onDownload, onEdit, t,
}) {
    const { isDark } = useTheme();
    const selectChipBg = isDark ? 'rgba(71, 85, 105, 0.92)' : 'rgba(226, 232, 240, 0.96)';
    const previewBg = isDark ? 'rgba(30, 41, 59, 0.55)' : 'rgba(241, 245, 249, 0.95)';

    return (
        <Card
            hoverable
            style={{
                borderRadius: 12,
                border: selected
                    ? `2px solid ${isDark ? '#38bdf8' : '#0284c7'}`
                    : '1px solid var(--border)',
                background: 'var(--bg-card)',
                overflow: 'hidden',
            }}
            styles={{ body: { padding: 12 } }}
            cover={(
                <div style={{ position: 'relative' }}>
                    <Checkbox
                        checked={selected}
                        onChange={(e) => onSelect(item.id, e.target.checked)}
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 2,
                            padding: 4,
                            background: selectChipBg,
                            borderRadius: 4,
                            border: isDark ? 'none' : '1px solid rgba(148, 163, 184, 0.35)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        background: previewBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                    }}>
                        {previewUrl ? (
                            <MediaPreview
                                previewUrl={previewUrl}
                                mimeType={itemIsVideo(item) ? 'video/mp4' : item.mimeType}
                                alt={displayLabel(item, t)}
                            />
                        ) : (
                            <Text type="secondary">{t('brandMaterial.noPreview')}</Text>
                        )}
                    </div>
                </div>
            )}
        >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap size={4}>
                    <Tag color="geekblue" style={{ margin: 0 }}>{item.sku}</Tag>
                    <Tag color={item.category === 'main' ? 'green' : 'blue'} style={{ margin: 0 }}>
                        {displayLabel(item, t)}
                    </Tag>
                    <Tag
                        color={itemIsVideo(item) ? 'purple' : 'cyan'}
                        style={{ margin: 0 }}
                    >
                        {itemIsVideo(item) ? t('brandMaterial.typeVideo') : t('brandMaterial.typePhoto')}
                    </Tag>
                </Space>
                <Space wrap>
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => onDownload(item)}>
                        {t('brandMaterial.download')}
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
                        {t('brandMaterial.edit')}
                    </Button>
                </Space>
            </Space>
        </Card>
    );
}

function SkuField({ value, onChange, skuIndex, placeholder }) {
    const [search, setSearch] = useState(value || '');
    useEffect(() => {
        setSearch(value || '');
    }, [value]);

    const options = useMemo(
        () => searchSkuIndex(skuIndex, search).map((sku) => ({ value: sku })),
        [skuIndex, search],
    );

    return (
        <AutoComplete
            value={search}
            options={options}
            style={{ width: '100%' }}
            maxLength={SKU_LENGTH}
            placeholder={placeholder}
            onSearch={(v) => {
                const n = normalizeSkuInput(v);
                setSearch(n);
                onChange(n);
            }}
            onSelect={(v) => {
                const n = normalizeSkuInput(v);
                setSearch(n);
                onChange(n);
            }}
            onBlur={() => {
                const n = normalizeSkuInput(search);
                setSearch(n);
                onChange(n);
            }}
            filterOption={false}
            status={search && !isValidFreemirSku(search) ? 'warning' : undefined}
        />
    );
}

export default function BrandMaterial() {
    const { t } = useTranslation();
    const { user, logActivity } = useAuth();
    const { isDark } = useTheme();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewMap, setPreviewMap] = useState({});
    const [skuFilter, setSkuFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadRows, setUploadRows] = useState([]);
    const [rowPreviews, setRowPreviews] = useState({});
    const bucketSeenUids = useRef(new Set());
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [editSku, setEditSku] = useState('');
    const [editCategory, setEditCategory] = useState('sub');
    const [editMediaType, setEditMediaType] = useState('photo');
    const [editSaving, setEditSaving] = useState(false);

    const skuIndex = useMemo(() => buildSkuIndex(items), [items]);

    const skuFilterTokens = useMemo(() => parseSkuFilterInput(skuFilter), [skuFilter]);

    const filterSkuSearchQuery = useMemo(() => {
        const parts = skuFilter.trim().split(/\s+/).filter(Boolean);
        return parts[parts.length - 1] || '';
    }, [skuFilter]);

    const filterSkuOptions = useMemo(
        () => searchSkuIndex(skuIndex, filterSkuSearchQuery).map((s) => ({ value: s })),
        [skuIndex, filterSkuSearchQuery],
    );

    const applySkuFilterValue = useCallback((raw) => {
        const tokens = parseSkuFilterInput(raw);
        if (tokens.length > 0) return tokens.join(' ');
        return (raw || '').toUpperCase();
    }, []);

    const handleSkuFilterPaste = useCallback((e) => {
        const pasted = e.clipboardData?.getData('text') || '';
        const tokens = parseSkuFilterInput(pasted);
        if (tokens.length === 0) return;
        e.preventDefault();
        const merged = [...new Set([...parseSkuFilterInput(skuFilter), ...tokens])];
        setSkuFilter(merged.join(' '));
    }, [skuFilter]);

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await listBrandMaterials();
            setItems(rows);
            const urls = {};
            await Promise.all(rows.map(async (row) => {
                const blob = await getBrandMaterialBlob(row.id);
                if (blob) urls[row.id] = URL.createObjectURL(blob);
            }));
            setPreviewMap((prev) => {
                Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
                return urls;
            });
        } catch {
            message.error(t('brandMaterial.msgLoadFail'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadCatalog();
        return () => {
            setPreviewMap((prev) => {
                Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
                return {};
            });
        };
    }, [loadCatalog]);

    const filtered = useMemo(() => {
        const tokenSet = skuFilterTokens.length > 0
            ? new Set(skuFilterTokens.map((s) => s.toLowerCase()))
            : null;
        const q = skuFilter.trim().toLowerCase();
        return items.filter((item) => {
            if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
            if (typeFilter !== 'all' && item.mediaType !== typeFilter) return false;
            const sku = normalizeSku(item.sku).toLowerCase();
            if (tokenSet) {
                if (!tokenSet.has(sku)) return false;
            } else if (q && !sku.includes(q)) {
                return false;
            }
            return true;
        });
    }, [items, skuFilter, skuFilterTokens, categoryFilter, typeFilter]);

    const selectedItems = useMemo(
        () => items.filter((i) => selectedIds.has(i.id)),
        [items, selectedIds],
    );

    const allFilteredSelected = filtered.length > 0
        && filtered.every((i) => selectedIds.has(i.id));
    const someFilteredSelected = filtered.some((i) => selectedIds.has(i.id));

    useEffect(() => {
        const valid = new Set(items.map((i) => i.id));
        setSelectedIds((prev) => {
            const next = new Set([...prev].filter((id) => valid.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [items]);

    const toggleSelect = (id, checked) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const toggleSelectAllFiltered = (checked) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) filtered.forEach((i) => next.add(i.id));
            else filtered.forEach((i) => next.delete(i.id));
            return next;
        });
    };

    const handleDownloadList = async (list, zipLabel) => {
        if (!list.length) {
            message.warning(t('brandMaterial.msgNothingToDownload'));
            return;
        }
        setBulkDownloading(true);
        try {
            const count = await downloadMaterialsAsZip(list, `brand_material_${zipLabel}`);
            if (!count) {
                message.error(t('brandMaterial.msgDownloadFail'));
                return;
            }
            message.success(t('brandMaterial.msgZipOk', { count }));
            logActivity(`Material Library (Download ${zipLabel})`);
        } catch {
            message.error(t('brandMaterial.msgDownloadFail'));
        } finally {
            setBulkDownloading(false);
        }
    };

    const openEdit = (item) => {
        setEditItem(item);
        setEditSku(item.sku);
        setEditCategory(item.category);
        setEditMediaType(item.mediaType || 'photo');
        setEditOpen(true);
    };

    const closeEdit = () => {
        setEditOpen(false);
        setEditItem(null);
        setEditSku('');
        setEditCategory('sub');
        setEditMediaType('photo');
    };

    const handleSaveEdit = async () => {
        if (!editItem) return;
        const sku = normalizeSkuInput(editSku);
        if (!sku) {
            message.error(t('brandMaterial.msgSkuRequired'));
            return;
        }
        if (!isValidFreemirSku(sku)) {
            message.warning(t('brandMaterial.msgSkuFormat'));
            return;
        }
        setEditSaving(true);
        try {
            await updateBrandMaterial(editItem.id, {
                sku,
                category: editCategory,
                mediaType: editMediaType,
            });
            message.success(t('brandMaterial.msgEditOk'));
            closeEdit();
            await loadCatalog();
            logActivity('Material Library (Edit)');
        } catch (e) {
            const code = e?.message;
            if (code === 'TYPE_MIME_MISMATCH') message.error(t('brandMaterial.msgTypeMismatch'));
            else if (code === 'NOT_FOUND') message.error(t('brandMaterial.msgEditFail'));
            else message.error(t('brandMaterial.msgEditFail'));
        } finally {
            setEditSaving(false);
        }
    };

    const revokeRowPreviews = useCallback((map) => {
        Object.values(map).forEach((u) => URL.revokeObjectURL(u));
    }, []);

    const openUploadModal = () => {
        setUploadRows([]);
        revokeRowPreviews(rowPreviews);
        setRowPreviews({});
        bucketSeenUids.current = new Set();
        setUploadOpen(true);
    };

    const closeUploadModal = () => {
        setUploadOpen(false);
        setUploadRows([]);
        revokeRowPreviews(rowPreviews);
        setRowPreviews({});
    };

    const appendFilesToRows = (files) => {
        const mediaFiles = files.filter((f) => isMediaFile(f));
        if (!mediaFiles.length) {
            message.warning(t('brandMaterial.msgPickMedia'));
            return;
        }
        let autoSkuCount = 0;
        const newRows = mediaFiles.map((file) => {
            const parsed = parseBrandMaterialFileName(file.name);
            if (parsed.sku) autoSkuCount += 1;
            return {
                id: newRowId(),
                sku: parsed.sku,
                category: parsed.category,
                mediaType: mediaTypeFromFile(file),
                file,
            };
        });
        const previews = {};
        newRows.forEach((row) => {
            previews[row.id] = URL.createObjectURL(row.file);
        });
        if (autoSkuCount > 0) {
            message.info(t('brandMaterial.msgSkuFromFile', { count: autoSkuCount }));
        } else if (mediaFiles.length > 0) {
            message.warning(t('brandMaterial.msgSkuFromFileNone'));
        }
        setUploadRows((prev) => [...prev, ...newRows]);
        setRowPreviews((prev) => {
            const next = { ...prev, ...previews };
            return next;
        });
    };

    const updateRow = (id, patch) => {
        setUploadRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    const removeRow = (id) => {
        setUploadRows((prev) => prev.filter((r) => r.id !== id));
        setRowPreviews((prev) => {
            if (prev[id]) URL.revokeObjectURL(prev[id]);
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleDownload = async (item) => {
        try {
            const blob = await getBrandMaterialBlob(item.id);
            if (!blob) {
                message.error(t('brandMaterial.msgDownloadFail'));
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = storageFileName(item);
            a.click();
            URL.revokeObjectURL(url);
            logActivity('Brand Material (Download)');
        } catch {
            message.error(t('brandMaterial.msgDownloadFail'));
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteBrandMaterial(id);
            message.success(t('brandMaterial.msgDeleted'));
            closeEdit();
            await loadCatalog();
        } catch {
            message.error(t('brandMaterial.msgDeleteFail'));
        }
    };

    const handleBatchUpload = async () => {
        const tasks = uploadRows.filter((r) => r.file && normalizeSku(r.sku));
        if (!tasks.length) {
            message.warning(t('brandMaterial.msgBatchEmpty'));
            return;
        }

        const incomplete = uploadRows.filter((r) => (r.sku && !r.file) || (!r.sku && r.file));
        if (incomplete.length) {
            message.warning(t('brandMaterial.msgBatchIncomplete'));
            return;
        }

        const invalidSku = tasks.filter((r) => !isValidFreemirSku(r.sku));
        if (invalidSku.length) {
            message.warning(t('brandMaterial.msgSkuFormat'));
            return;
        }

        setUploading(true);
        let ok = 0;
        try {
            for (const row of tasks) {
                await uploadBrandMaterial({
                    sku: row.sku,
                    category: row.category,
                    mediaType: row.mediaType || mediaTypeFromFile(row.file),
                    file: row.file,
                    uploadedBy: user?.username || '',
                });
                ok += 1;
            }
            message.success(t('brandMaterial.msgBatchOk', { count: ok }));
            closeUploadModal();
            await loadCatalog();
            logActivity('Material Library (Upload)');
        } catch (e) {
            const code = e?.message;
            if (code === 'SKU_REQUIRED') message.error(t('brandMaterial.msgSkuRequired'));
            else if (code === 'MEDIA_REQUIRED' || code === 'IMAGE_REQUIRED') {
                message.error(t('brandMaterial.msgPickMedia'));
            } else if (code === 'TYPE_MIME_MISMATCH') {
                message.error(t('brandMaterial.msgTypeMismatch'));
            }
            else message.error(t('brandMaterial.msgUploadFail'));
        } finally {
            setUploading(false);
        }
    };

    const uploadTableColumns = [
        {
            title: '#',
            width: 40,
            render: (_, __, idx) => idx + 1,
        },
        {
            title: t('brandMaterial.colPreview'),
            width: 72,
            render: (_, row) => (
                rowPreviews[row.id] ? (
                    <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden' }}>
                        <MediaPreview
                            previewUrl={rowPreviews[row.id]}
                            mimeType={row.file?.type}
                            alt=""
                            style={{ width: 48, height: 48, objectFit: 'cover' }}
                        />
                    </div>
                ) : (
                    <Text type="secondary">—</Text>
                )
            ),
        },
        {
            title: t('brandMaterial.fieldSku'),
            width: 200,
            render: (_, row) => (
                <SkuField
                    value={row.sku}
                    skuIndex={skuIndex}
                    placeholder={t('brandMaterial.fieldSkuPh')}
                    onChange={(sku) => updateRow(row.id, { sku })}
                />
            ),
        },
        {
            title: t('brandMaterial.fieldType'),
            width: 118,
            render: (_, row) => (
                <Select
                    size="small"
                    value={row.mediaType || 'photo'}
                    onChange={(mediaType) => updateRow(row.id, { mediaType })}
                    options={[
                        { value: 'photo', label: t('brandMaterial.typePhoto') },
                        { value: 'video', label: t('brandMaterial.typeVideo') },
                    ]}
                    style={{ width: '100%', minWidth: 100 }}
                />
            ),
        },
        {
            title: t('brandMaterial.fieldCategory'),
            width: 118,
            render: (_, row) => (
                <Select
                    size="small"
                    value={row.category}
                    onChange={(category) => updateRow(row.id, { category })}
                    options={[
                        { value: 'sub', label: t('brandMaterial.catSub') },
                        { value: 'main', label: t('brandMaterial.catMain') },
                    ]}
                    style={{ width: '100%', minWidth: 100 }}
                />
            ),
        },
        {
            title: '',
            width: 44,
            render: (_, row) => (
                <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => removeRow(row.id)}
                />
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                title={t('brandMaterial.title')}
                subtitle={t('brandMaterial.subtitle')}
                accent="#0ea5e9"
            />

            <Card
                style={{
                    marginBottom: 24,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                }}
                styles={{ body: { padding: '16px 18px' } }}
            >
                <Flex vertical gap={12}>
                    <Flex
                        wrap="wrap"
                        gap={12}
                        align="flex-end"
                        justify="space-between"
                    >
                        <Flex wrap gap={12} align="flex-end" style={{ flex: 1, minWidth: 0 }}>
                            <Flex vertical style={{ flex: '1 1 220px', maxWidth: 300, minWidth: 160 }}>
                                <Text type="secondary" style={{ fontSize: 12, marginBottom: 6 }}>
                                    {t('brandMaterial.filterSku')}
                                </Text>
                                <AutoComplete
                                    allowClear
                                    style={{ width: '100%' }}
                                    value={skuFilter}
                                    options={filterSkuOptions}
                                    onChange={(v) => setSkuFilter((v || '').toUpperCase())}
                                    onSelect={(value) => {
                                        const parts = skuFilter.trim().split(/\s+/).filter(Boolean);
                                        if (parts.length > 1) {
                                            parts[parts.length - 1] = value;
                                            setSkuFilter(parts.join(' '));
                                        } else {
                                            setSkuFilter(value);
                                        }
                                    }}
                                    onPaste={handleSkuFilterPaste}
                                    onBlur={() => {
                                        const normalized = applySkuFilterValue(skuFilter);
                                        if (normalized !== skuFilter) setSkuFilter(normalized);
                                    }}
                                    placeholder={t('brandMaterial.filterSkuPh')}
                                    filterOption={false}
                                />
                            </Flex>
                            <Flex vertical style={{ flex: '0 1 200px', minWidth: 168 }}>
                                <Text type="secondary" style={{ fontSize: 12, marginBottom: 6 }}>
                                    {t('brandMaterial.filterCategory')}
                                </Text>
                                <Segmented
                                    block
                                    value={categoryFilter}
                                    onChange={setCategoryFilter}
                                    options={[
                                        { value: 'all', label: t('brandMaterial.filterAll') },
                                        { value: 'main', label: t('brandMaterial.catMain') },
                                        { value: 'sub', label: t('brandMaterial.catSub') },
                                    ]}
                                />
                            </Flex>
                            <Flex vertical style={{ flex: '0 1 200px', minWidth: 168 }}>
                                <Text type="secondary" style={{ fontSize: 12, marginBottom: 6 }}>
                                    {t('brandMaterial.filterType')}
                                </Text>
                                <Segmented
                                    block
                                    value={typeFilter}
                                    onChange={setTypeFilter}
                                    options={[
                                        { value: 'all', label: t('brandMaterial.filterAll') },
                                        { value: 'photo', label: t('brandMaterial.typePhoto') },
                                        { value: 'video', label: t('brandMaterial.typeVideo') },
                                    ]}
                                />
                            </Flex>
                        </Flex>
                        <Flex gap={8} align="center" style={{ flex: '0 0 auto' }}>
                            <Button type="primary" icon={<CloudUploadOutlined />} onClick={openUploadModal}>
                                {t('brandMaterial.upload')}
                            </Button>
                            <Tooltip title={t('brandMaterial.refresh')}>
                                <Button
                                    icon={<ReloadOutlined />}
                                    loading={loading}
                                    onClick={loadCatalog}
                                    aria-label={t('brandMaterial.refresh')}
                                />
                            </Tooltip>
                        </Flex>
                    </Flex>

                    {filtered.length > 0 && (
                        <Flex
                            wrap
                            gap={12}
                            align="center"
                            style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(248, 250, 252, 0.9)',
                            }}
                        >
                            <Checkbox
                                checked={allFilteredSelected}
                                indeterminate={someFilteredSelected && !allFilteredSelected}
                                onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                            >
                                {t('brandMaterial.selectAllFiltered', { count: filtered.length })}
                            </Checkbox>
                            <Button
                                icon={<FileZipOutlined />}
                                loading={bulkDownloading}
                                disabled={selectedItems.length === 0}
                                onClick={() => handleDownloadList(selectedItems, 'selected')}
                            >
                                {t('brandMaterial.downloadMaterial')}
                            </Button>
                            {selectedItems.length > 0 && (
                                <>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {t('brandMaterial.selectedCount', { count: selectedItems.length })}
                                    </Text>
                                    <Button type="link" size="small" onClick={() => setSelectedIds(new Set())}>
                                        {t('brandMaterial.clearSelection')}
                                    </Button>
                                </>
                            )}
                        </Flex>
                    )}
                </Flex>
            </Card>

            {loading ? (
                <Card loading style={{ borderRadius: 12 }} />
            ) : filtered.length === 0 ? (
                <Empty description={t('brandMaterial.empty')} />
            ) : (
                <Row gutter={[16, 16]}>
                    {filtered.map((item) => (
                        <Col key={item.id} xs={12} sm={8} md={6} lg={4}>
                            <MaterialCard
                                item={item}
                                previewUrl={previewMap[item.id]}
                                selected={selectedIds.has(item.id)}
                                onSelect={toggleSelect}
                                onDownload={handleDownload}
                                onEdit={openEdit}
                                t={t}
                            />
                        </Col>
                    ))}
                </Row>
            )}

            <Modal
                title={t('brandMaterial.editTitle')}
                open={editOpen}
                onCancel={closeEdit}
                destroyOnClose
                width={480}
                footer={editItem ? (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                    }}>
                        <Popconfirm
                            title={t('brandMaterial.confirmDelete')}
                            onConfirm={() => handleDelete(editItem.id)}
                            okButtonProps={{ danger: true }}
                        >
                            <Button danger icon={<DeleteOutlined />}>
                                {t('brandMaterial.deletePhoto')}
                            </Button>
                        </Popconfirm>
                        <Space>
                            <Button onClick={closeEdit}>{t('brandMaterial.cancel')}</Button>
                            <Button type="primary" loading={editSaving} onClick={handleSaveEdit}>
                                {t('brandMaterial.editSave')}
                            </Button>
                        </Space>
                    </div>
                ) : null}
            >
                {editItem && (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                                {t('brandMaterial.fieldSku')}
                            </Text>
                            <SkuField
                                value={editSku}
                                skuIndex={skuIndex}
                                placeholder={t('brandMaterial.fieldSkuPh')}
                                onChange={setEditSku}
                            />
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                                {t('brandMaterial.fieldCategory')}
                            </Text>
                            <Segmented
                                block
                                value={editCategory}
                                onChange={setEditCategory}
                                options={[
                                    { value: 'sub', label: t('brandMaterial.catSub') },
                                    { value: 'main', label: t('brandMaterial.catMain') },
                                ]}
                            />
                            <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 11 }}>
                                {t('brandMaterial.editHint')}
                            </Paragraph>
                        </div>
                        <div>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                                {t('brandMaterial.fieldType')}
                            </Text>
                            <Segmented
                                block
                                value={editMediaType}
                                onChange={setEditMediaType}
                                options={[
                                    { value: 'photo', label: t('brandMaterial.typePhoto') },
                                    { value: 'video', label: t('brandMaterial.typeVideo') },
                                ]}
                            />
                        </div>
                    </Space>
                )}
            </Modal>

            <Modal
                title={t('brandMaterial.uploadTitle')}
                open={uploadOpen}
                onCancel={closeUploadModal}
                footer={null}
                destroyOnClose
                width={760}
            >
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
                    {t('brandMaterial.uploadBucketHint')}
                </Paragraph>
                <Dragger
                    accept="image/*,video/*"
                    multiple
                    showUploadList={false}
                    beforeUpload={() => false}
                    onChange={({ fileList }) => {
                        const fresh = fileList.filter(
                            (f) => f.originFileObj && !bucketSeenUids.current.has(f.uid),
                        );
                        fresh.forEach((f) => bucketSeenUids.current.add(f.uid));
                        const files = fresh.map((f) => f.originFileObj);
                        if (files.length) appendFilesToRows(files);
                    }}
                    style={{
                        marginBottom: 20,
                        padding: '36px 20px',
                        borderRadius: 12,
                        border: '2px dashed rgba(14, 165, 233, 0.45)',
                        background: 'linear-gradient(180deg, rgba(14,165,233,0.06) 0%, rgba(14,165,233,0.02) 100%)',
                    }}
                >
                    <p className="ant-upload-drag-icon" style={{ marginBottom: 12 }}>
                        <InboxOutlined style={{ fontSize: 52, color: '#0ea5e9' }} />
                    </p>
                    <p className="ant-upload-text" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-main)' }}>
                        {t('brandMaterial.uploadBucket')}
                    </p>
                    <p className="ant-upload-hint" style={{ fontSize: 13, maxWidth: 420, margin: '8px auto 0' }}>
                        {t('brandMaterial.uploadBucketSub')}
                    </p>
                </Dragger>

                {uploadRows.length > 0 ? (
                    <Table
                        size="small"
                        pagination={false}
                        rowKey="id"
                        dataSource={uploadRows}
                        columns={uploadTableColumns}
                        scroll={{ x: 520 }}
                        style={{ marginBottom: 16 }}
                    />
                ) : (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('brandMaterial.uploadTableEmpty')}
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Space>
                    <Button
                        type="primary"
                        size="large"
                        loading={uploading}
                        icon={<CloudUploadOutlined />}
                        disabled={!uploadRows.length}
                        onClick={handleBatchUpload}
                        style={{
                            height: 44,
                            paddingInline: 24,
                            fontWeight: 600,
                            borderRadius: 10,
                        }}
                    >
                        {t('brandMaterial.uploadSubmit')}
                    </Button>
                    <Button onClick={closeUploadModal}>{t('brandMaterial.cancel')}</Button>
                </Space>
            </Modal>
        </div>
    );
}
