import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AutoComplete, Button, Card, Checkbox, Empty, Flex, Input, Modal, Segmented, Select, Space,
    Tag, Typography, Upload, message, Popconfirm, Table, Tooltip,
} from 'antd';
import {
    CloudUploadOutlined, DownloadOutlined, DeleteOutlined,
    ReloadOutlined, MinusCircleOutlined, InboxOutlined,
    EditOutlined, FileZipOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BrandMaterialSkuDetail from './BrandMaterialSkuDetail';
import BrandMaterialSkuList from './BrandMaterialSkuList';

dayjs.extend(utc);
dayjs.extend(timezone);
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import {
    uploadBrandMaterial,
    updateBrandMaterial,
    deleteBrandMaterial,
    deleteBrandMaterialsBulk,
    getBrandMaterialBlob,
    displayLabel,
    storageFileName,
    normalizeSku,
} from '../utils/brandMaterialStore';
import { isMediaFile, mediaTypeFromFile } from '../utils/brandMaterialMedia';
import { downloadMaterialsAsZip } from '../utils/brandMaterialDownload';

import {
    buildSkuIndex,
    searchSkuIndex,
    normalizeSkuInput,
    isValidFreemirSku,
    parseBrandMaterialFileName,
    SKU_LENGTH,
} from '../utils/skuIndex';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

function newRowId() {
    return `row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatUploadedAt(iso) {
    if (!iso) return null;
    const d = dayjs(iso).tz('Asia/Jakarta');
    return d.isValid() ? `${d.format('DD MMM YYYY, HH:mm')} WIB` : null;
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
    const { sku: skuParam } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const activeSku = skuParam ? normalizeSkuInput(skuParam) : null;
    const skuInfoImageUrl = location.state?.skuInfoImageUrl || '';
    const { logActivity } = useAuth();
    const [typeFilter, setTypeFilter] = useState('all');
    const [reloadToken, setReloadToken] = useState(0);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadRows, setUploadRows] = useState([]);
    const [rowPreviews, setRowPreviews] = useState({});
    const bucketSeenUids = useRef(new Set());
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [selectedMeta, setSelectedMeta] = useState(() => new Map());
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState('');
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [editSku, setEditSku] = useState('');
    const [editCategory, setEditCategory] = useState('sub');
    const [editMediaType, setEditMediaType] = useState('photo');
    const [editNote, setEditNote] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    const bumpReload = useCallback(() => setReloadToken((n) => n + 1), []);

    const openSkuFolder = useCallback((row) => {
        navigate(`/brand-material/${encodeURIComponent(row.sku)}`, {
            state: { skuInfoImageUrl: row.skuInfoImageUrl || '' },
        });
    }, [navigate]);

    const backToSkuList = useCallback(() => {
        navigate('/brand-material');
    }, [navigate]);

    const selectedItems = useMemo(
        () => Array.from(selectedMeta.values()),
        [selectedMeta],
    );

    const skuIndex = useMemo(() => {
        const seeds = [];
        if (activeSku) seeds.push({ sku: activeSku });
        selectedItems.forEach((item) => seeds.push(item));
        return buildSkuIndex(seeds);
    }, [activeSku, selectedItems]);

    const refreshAfterChange = useCallback(async () => {
        bumpReload();
    }, [bumpReload]);

    const toggleSelect = (id, checked, item) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
        setSelectedMeta((prev) => {
            const next = new Map(prev);
            if (checked && item) next.set(id, item);
            else next.delete(id);
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setSelectedMeta(new Map());
    };

    const bulkDeletePhrase = t('brandMaterial.bulkDeletePhrase');

    const openBulkDeleteModal = () => {
        if (selectedItems.length === 0) return;
        setBulkDeleteConfirm('');
        setBulkDeleteOpen(true);
    };

    const closeBulkDeleteModal = () => {
        setBulkDeleteOpen(false);
        setBulkDeleteConfirm('');
    };

    const handleBulkDelete = async () => {
        if (bulkDeleteConfirm !== bulkDeletePhrase) return;
        const toDelete = [...selectedItems];
        setBulkDeleting(true);
        try {
            const { deleted } = await deleteBrandMaterialsBulk(toDelete.map((item) => item.id));
            if (!deleted) {
                message.error(t('brandMaterial.msgBulkDeleteFail'));
                return;
            }
            message.success(t('brandMaterial.msgBulkDeleted', { count: deleted }));
            clearSelection();
            closeBulkDeleteModal();
            await refreshAfterChange();
            logActivity('Material Library (Bulk Delete)');
        } catch {
            message.error(t('brandMaterial.msgBulkDeleteFail'));
        } finally {
            setBulkDeleting(false);
        }
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
        setEditNote(item.note || '');
        setEditMediaType(item.mediaType || 'photo');
        setEditCategory(item.category);
        setEditOpen(true);
    };

    const closeEdit = () => {
        setEditOpen(false);
        setEditItem(null);
        setEditSku('');
        setEditCategory('sub');
        setEditMediaType('photo');
        setEditNote('');
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
                note: editNote,
            });
            message.success(t('brandMaterial.msgEditOk'));
            closeEdit();
            await refreshAfterChange();
            if (activeSku && sku !== activeSku) {
                navigate(`/brand-material/${encodeURIComponent(sku)}`);
            }
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
                note: '',
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
            await refreshAfterChange();
            if (activeSku) {
                navigate('/brand-material');
            }
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
                    note: row.note,
                    file: row.file,
                });
                ok += 1;
            }
            message.success(t('brandMaterial.msgBatchOk', { count: ok }));
            closeUploadModal();
            await refreshAfterChange();
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
            width: 168,
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
            title: t('brandMaterial.fieldNote'),
            width: 180,
            render: (_, row) => (
                <Input
                    size="small"
                    value={row.note || ''}
                    maxLength={500}
                    placeholder={t('brandMaterial.fieldNotePh')}
                    onChange={(e) => updateRow(row.id, { note: e.target.value })}
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

    const bulkToolbarExtras = (
        <Flex wrap gap={8} align="center">
            <Button
                icon={<FileZipOutlined />}
                loading={bulkDownloading}
                disabled={selectedItems.length === 0}
                onClick={() => handleDownloadList(selectedItems, 'selected')}
            >
                {t('brandMaterial.downloadMaterial')}
            </Button>
            <Button
                danger
                icon={<DeleteOutlined />}
                disabled={selectedItems.length === 0}
                onClick={openBulkDeleteModal}
            >
                {t('brandMaterial.deleteMaterial')}
            </Button>
            {selectedItems.length > 0 && (
                <Button type="link" size="small" onClick={clearSelection}>
                    {t('brandMaterial.clearSelection')}
                </Button>
            )}
        </Flex>
    );

    return (
        <div>
            {activeSku ? (
                <BrandMaterialSkuDetail
                    sku={activeSku}
                    typeFilter={typeFilter}
                    onTypeFilterChange={setTypeFilter}
                    onBack={backToSkuList}
                    skuInfoImageUrl={skuInfoImageUrl}
                    selectedIds={selectedIds}
                    onSelect={toggleSelect}
                    onDownload={handleDownload}
                    onEdit={openEdit}
                    reloadToken={reloadToken}
                    toolbarExtras={bulkToolbarExtras}
                />
            ) : (
                <>
                    <PageHeader
                        title={t('brandMaterial.title')}
                        subtitle={t('brandMaterial.subtitle')}
                        accent="#0ea5e9"
                        actions={(
                            <Button type="primary" icon={<CloudUploadOutlined />} onClick={openUploadModal}>
                                {t('brandMaterial.upload')}
                            </Button>
                        )}
                    />
                    <BrandMaterialSkuList
                        onOpenSku={openSkuFolder}
                        reloadToken={reloadToken}
                    />
                </>
            )}

            <Modal
                title={t('brandMaterial.bulkDeleteTitle')}
                open={bulkDeleteOpen}
                onCancel={closeBulkDeleteModal}
                destroyOnClose
                okText={t('brandMaterial.bulkDeleteSubmit')}
                cancelText={t('brandMaterial.cancel')}
                okButtonProps={{
                    danger: true,
                    disabled: bulkDeleteConfirm !== bulkDeletePhrase,
                }}
                confirmLoading={bulkDeleting}
                onOk={handleBulkDelete}
            >
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Paragraph style={{ marginBottom: 0 }}>
                        {t('brandMaterial.bulkDeleteDesc', { count: selectedItems.length })}
                    </Paragraph>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                            {t('brandMaterial.bulkDeleteTypeLabel')}
                        </Text>
                        <Text copyable code style={{ fontSize: 14 }}>
                            {bulkDeletePhrase}
                        </Text>
                    </div>
                    <Input
                        value={bulkDeleteConfirm}
                        onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                        placeholder={bulkDeletePhrase}
                        onPressEnter={() => {
                            if (bulkDeleteConfirm === bulkDeletePhrase) handleBulkDelete();
                        }}
                    />
                </Space>
            </Modal>

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
                                {t('brandMaterial.fieldNote')}
                            </Text>
                            <Input.TextArea
                                value={editNote}
                                maxLength={500}
                                showCount
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                placeholder={t('brandMaterial.fieldNotePh')}
                                onChange={(e) => setEditNote(e.target.value)}
                            />
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
                        <div
                            style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-subtle, rgba(0,0,0,0.02))',
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                {t('brandMaterial.metaTitle')}
                            </Text>
                            <Space direction="vertical" size={4}>
                                <Text style={{ fontSize: 13 }}>
                                    {t('brandMaterial.metaUploadedBy')}:{' '}
                                    <Text strong>{editItem.uploadedBy?.trim() || '—'}</Text>
                                </Text>
                                <Text style={{ fontSize: 13 }}>
                                    {t('brandMaterial.metaUploadedAt')}:{' '}
                                    <Text strong>
                                        {formatUploadedAt(editItem.uploadedAt) || '—'}
                                    </Text>
                                </Text>
                            </Space>
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
                        scroll={{ x: 700 }}
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
