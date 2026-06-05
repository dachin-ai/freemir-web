import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button, Checkbox, Input, Modal, Select, Space, Typography, message,
} from 'antd';
import {
    KeyOutlined, EyeOutlined, EyeInvisibleOutlined, SaveOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';

const { Text } = Typography;

const MODE_SAVED = 'saved';
const MODE_MANUAL = 'manual';
const MODE_ENV = 'env';

export default function SmaApifyToken({
    config,
    mode,
    onModeChange,
    selectedTokenId,
    onSelectedTokenIdChange,
    manualValue,
    onManualChange,
    onTokensChange,
}) {
    const { t } = useTranslation();
    const [tokens, setTokens] = useState([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [visible, setVisible] = useState(false);
    const [label, setLabel] = useState('');
    const [saveDefault, setSaveDefault] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editLabel, setEditLabel] = useState('');
    const [editDefault, setEditDefault] = useState(false);
    const initializedRef = useRef(false);

    const loadTokens = useCallback(async () => {
        setLoadingTokens(true);
        try {
            const res = await api.get('/social-media-analytics/apify-tokens');
            const list = res.data?.tokens || [];
            setTokens(list);
            onTokensChange?.(list);
            return list;
        } catch {
            setTokens([]);
            onTokensChange?.([]);
            return [];
        } finally {
            setLoadingTokens(false);
        }
    }, [onTokensChange]);

    useEffect(() => {
        if (initializedRef.current) return;
        loadTokens().then((list) => {
            initializedRef.current = true;
            if (list.length > 0) {
                const def = list.find((x) => x.is_default) || list[0];
                if (def?.id) {
                    onModeChange?.(MODE_SAVED);
                    onSelectedTokenIdChange?.(def.id);
                }
            } else {
                onModeChange?.(MODE_MANUAL);
            }
        });
    }, [loadTokens, onModeChange, onSelectedTokenIdChange]);

    const selectValue = useMemo(() => {
        if (mode === MODE_MANUAL) return MODE_MANUAL;
        if (mode === MODE_ENV) return MODE_ENV;
        if (selectedTokenId) return String(selectedTokenId);
        return tokens.length ? undefined : MODE_MANUAL;
    }, [mode, selectedTokenId, tokens.length]);

    const selectOptions = useMemo(() => {
        const saved = tokens.map((tok) => ({
            value: String(tok.id),
            label: `${tok.label} · ${tok.token_hint}${tok.is_default ? ` (${t('socialMediaAnalytics.apifyTokenDefault')})` : ''}`,
        }));
        const tail = [{ value: MODE_MANUAL, label: t('socialMediaAnalytics.apifyTokenModeManual') }];
        if (config?.apify_configured) {
            tail.unshift({ value: MODE_ENV, label: t('socialMediaAnalytics.apifyTokenModeEnv') });
        }
        return [...saved, ...tail];
    }, [tokens, config, t]);

    const handleSelect = (value) => {
        if (value === MODE_MANUAL) {
            onModeChange?.(MODE_MANUAL);
            onSelectedTokenIdChange?.(null);
            return;
        }
        if (value === MODE_ENV) {
            onModeChange?.(MODE_ENV);
            onSelectedTokenIdChange?.(null);
            return;
        }
        onModeChange?.(MODE_SAVED);
        onSelectedTokenIdChange?.(Number(value));
    };

    const handleQuickSave = async () => {
        const token = (manualValue || '').trim();
        const name = (label || '').trim() || t('socialMediaAnalytics.apifyTokenUntitled');
        if (token.length < 8) {
            message.warning(t('socialMediaAnalytics.apifyTokenSaveRequired'));
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/social-media-analytics/apify-tokens', {
                label: name,
                token,
                is_default: saveDefault,
            });
            message.success(t('socialMediaAnalytics.apifyTokenSaved'));
            onModeChange?.(MODE_SAVED);
            onSelectedTokenIdChange?.(res.data?.id ?? null);
            setLabel('');
            await loadTokens();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.apifyTokenSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const openEdit = (tok) => {
        setEditLabel(tok.label || '');
        setEditDefault(!!tok.is_default);
        setEditOpen(true);
    };

    const handleEditSave = async () => {
        const tok = tokens.find((x) => x.id === selectedTokenId);
        if (!tok) return;
        setSaving(true);
        try {
            await api.put(`/social-media-analytics/apify-tokens/${tok.id}`, {
                label: editLabel.trim() || tok.label,
                is_default: editDefault,
            });
            message.success(t('socialMediaAnalytics.apifyTokenUpdated'));
            setEditOpen(false);
            await loadTokens();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.apifyTokenSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (tok) => {
        Modal.confirm({
            title: t('socialMediaAnalytics.apifyTokenDeleteTitle'),
            content: t('socialMediaAnalytics.apifyTokenDeleteConfirm', { label: tok.label }),
            okType: 'danger',
            onOk: async () => {
                try {
                    await api.delete(`/social-media-analytics/apify-tokens/${tok.id}`);
                    if (selectedTokenId === tok.id) {
                        onSelectedTokenIdChange?.(null);
                        onModeChange?.(tokens.length > 1 ? MODE_SAVED : MODE_MANUAL);
                    }
                    message.success(t('socialMediaAnalytics.apifyTokenDeleted'));
                    await loadTokens();
                } catch (err) {
                    message.error(err.response?.data?.detail || t('socialMediaAnalytics.apifyTokenDeleteFailed'));
                }
            },
        });
    };

    const selectedSaved = tokens.find((x) => x.id === selectedTokenId);
    const showPasteRow = mode === MODE_MANUAL || tokens.length === 0;

    return (
        <div className="sma-token-block">
            <label className="sma-token-label">
                <KeyOutlined />
                {t('socialMediaAnalytics.apifyTokenLabel')}
            </label>
            <Text type="secondary" className="sma-token-hint">
                {t('socialMediaAnalytics.apifyTokenVaultHint')}
            </Text>

            {tokens.length > 0 && (
                <div className="sma-token-vault-row">
                    <Select
                        className="sma-token-select"
                        placeholder={t('socialMediaAnalytics.apifyTokenSelectPlaceholder')}
                        loading={loadingTokens}
                        value={selectValue}
                        onChange={handleSelect}
                        options={selectOptions}
                    />
                    {selectedSaved && (
                        <Space size={6} className="sma-token-vault-actions">
                            <Button icon={<EditOutlined />} onClick={() => openEdit(selectedSaved)}>
                                {t('socialMediaAnalytics.apifyTokenEdit')}
                            </Button>
                            <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedSaved)}>
                                {t('socialMediaAnalytics.apifyTokenDelete')}
                            </Button>
                        </Space>
                    )}
                </div>
            )}

            {showPasteRow && (
                <div className="sma-token-paste-block">
                    <Input
                        className="sma-token-input"
                        type={visible ? 'text' : 'password'}
                        autoComplete="one-time-code"
                        data-lpignore="true"
                        placeholder={t('socialMediaAnalytics.apifyTokenPlaceholder')}
                        value={manualValue}
                        onChange={onManualChange}
                        suffix={(
                            <button
                                type="button"
                                className="sma-token-toggle"
                                onClick={() => setVisible((v) => !v)}
                                tabIndex={-1}
                            >
                                {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            </button>
                        )}
                    />
                    <div className="sma-token-save-row">
                        <Input
                            className="sma-token-label-input"
                            placeholder={t('socialMediaAnalytics.apifyTokenNamePlaceholder')}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={120}
                        />
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={saving}
                            onClick={handleQuickSave}
                        >
                            {t('socialMediaAnalytics.apifyTokenSaveBtn')}
                        </Button>
                    </div>
                    <Checkbox checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)}>
                        {t('socialMediaAnalytics.apifyTokenSetDefault')}
                    </Checkbox>
                </div>
            )}

            <Modal
                title={t('socialMediaAnalytics.apifyTokenEditTitle')}
                open={editOpen}
                onCancel={() => setEditOpen(false)}
                onOk={handleEditSave}
                confirmLoading={saving}
                destroyOnClose
            >
                <div className="sma-token-modal-field">
                    <Text className="sma-token-modal-label">{t('socialMediaAnalytics.apifyTokenNameLabel')}</Text>
                    <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        maxLength={120}
                    />
                </div>
                {selectedSaved?.token_hint && (
                    <Text type="secondary" className="sma-token-modal-hint">
                        {t('socialMediaAnalytics.apifyTokenCurrentHint', { hint: selectedSaved.token_hint })}
                    </Text>
                )}
                <Checkbox checked={editDefault} onChange={(e) => setEditDefault(e.target.checked)}>
                    {t('socialMediaAnalytics.apifyTokenSetDefault')}
                </Checkbox>
            </Modal>
        </div>
    );
}

export { MODE_SAVED, MODE_MANUAL, MODE_ENV };
