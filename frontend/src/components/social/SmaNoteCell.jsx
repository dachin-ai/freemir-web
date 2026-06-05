import React, { useEffect, useState } from 'react';
import { Input, message } from 'antd';
import { useTranslation } from 'react-i18next';
import api from '../../api';

export default function SmaNoteCell({ value, recordId, kind, onSaved }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(value || '');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(value || '');
    }, [value]);

    const save = async () => {
        const trimmed = (draft || '').trim();
        if (trimmed === (value || '').trim()) return;
        setSaving(true);
        try {
            const path = kind === 'video'
                ? `/social-media-analytics/videos/${recordId}/note`
                : `/social-media-analytics/profiles/${recordId}/note`;
            await api.patch(path, { note: trimmed });
            message.success(t('socialMediaAnalytics.noteSaved'));
            onSaved?.();
        } catch (err) {
            message.error(err.response?.data?.detail || t('socialMediaAnalytics.noteSaveFailed'));
            setDraft(value || '');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Input
            size="small"
            className="sma-note-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onPressEnter={(e) => { e.preventDefault(); save(); }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t('socialMediaAnalytics.notePlaceholder')}
            maxLength={500}
            disabled={saving}
            autoComplete="off"
            data-lpignore="true"
            data-form-type="other"
        />
    );
}
