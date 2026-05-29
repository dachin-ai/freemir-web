import React, { useEffect, useState, useRef } from 'react';
import { Typography, Card, Button, Input, Space, Empty, message, Tag, Select, Divider, Modal } from 'antd';
import {
  ArrowRightOutlined,
  LinkOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DragOutlined,
  CopyOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  FolderAddOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { getQuickLinks, putQuickLinks } from '../api';

const { Text, Title } = Typography;
const STORAGE_KEY = 'fm_lobby_links_v2';
const LEGACY_KEY = 'fm_lobby_links_v1';

/** 8 accent swatches — full card surface */
const ACCENT_PALETTE = [
  { id: 'cyan', hex: '#06b6d4' },
  { id: 'indigo', hex: '#0ea5e9' },
  { id: 'emerald', hex: '#10b981' },
  { id: 'amber', hex: '#f59e0b' },
  { id: 'rose', hex: '#f43f5e' },
  { id: 'violet', hex: '#0ea5e9' },
  { id: 'sky', hex: '#0ea5e9' },
  { id: 'slate', hex: '#64748b' },
];

const DEFAULT_ACCENT_ID = ACCENT_PALETTE[0].id;

const getAccent = (id) => ACCENT_PALETTE.find((a) => a.id === id) || ACCENT_PALETTE[0];

/** Kontras teks + panel konten di atas kartu berwarna */
const linkCardChrome = (isDark) => ({
  panelBg: isDark ? 'rgba(2, 6, 23, 0.58)' : 'rgba(255, 255, 255, 0.9)',
  panelBorder: isDark ? '1px solid rgba(248, 250, 252, 0.12)' : '1px solid rgba(15, 23, 42, 0.08)',
  title: isDark ? '#f8fafc' : '#0a0f1a',
  icon: isDark ? '#e2e8f0' : '#334155',
  tagBg: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.98)',
  tagBorder: isDark ? 'rgba(248, 250, 252, 0.14)' : 'rgba(15, 23, 42, 0.1)',
  tagColor: isDark ? '#e2e8f0' : '#1e293b',
  toolbarBg: isDark ? 'rgba(2, 6, 23, 0.5)' : 'rgba(255, 255, 255, 0.82)',
  toolbarBorder: isDark ? 'rgba(248, 250, 252, 0.12)' : 'rgba(15, 23, 42, 0.1)',
});

const editorCardStyleProps = (isDark) => ({
  '--ql-editor-bg': isDark
    ? 'linear-gradient(168deg, rgba(17,24,39,0.98) 0%, rgba(15,23,42,0.94) 45%, rgba(2,6,23,0.97) 100%)'
    : 'linear-gradient(168deg, #ffffff 0%, #f8fafc 42%, #f1f5f9 100%)',
  '--ql-editor-border': isDark ? '1px solid rgba(148,163,184,0.22)' : '1px solid rgba(56, 189, 248, 0.28)',
  '--ql-editor-shadow': isDark
    ? '0 0 0 1px rgba(255,255,255,0.05) inset, 0 20px 50px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset'
    : '0 0 0 1px rgba(255,255,255,0.95) inset, 0 14px 40px rgba(14, 165, 233, 0.11), 0 1px 0 rgba(255,255,255,0.9) inset',
  borderRadius: 16,
});

const formMicroLabel = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 700,
  display: 'block',
  marginBottom: 6,
  opacity: 0.85,
};

/**
 * Warna kartu link: global `.ant-card { background !important }` di index.css menang atas style inline.
 * Nilai aktual di-set lewat custom properties + selector `.lobby-link-card.ant-card`.
 */
const rowAccentStyleProps = (hex, isDark, isDragging) => {
  const edge = isDragging ? hex : `${hex}70`;
  const bg = isDark
    ? `linear-gradient(165deg, ${hex}70 0%, ${hex}45 35%, ${hex}22 65%, rgba(15, 23, 42, 0.82) 100%)`
    : `linear-gradient(165deg, ${hex}65 0%, ${hex}38 40%, ${hex}1a 72%, #fafcff 100%)`;
  const shadow = isDark
    ? `inset 0 0 0 1px ${hex}45, 0 1px 3px rgba(0,0,0,0.2)`
    : `inset 0 0 0 1px ${hex}35, 0 1px 2px rgba(15,23,42,0.06)`;
  return {
    '--ql-accent-bg': bg,
    '--ql-accent-border': `1px solid ${edge}`,
    '--ql-accent-shadow': shadow,
    borderRadius: 14,
  };
};

const newGroupId = () => `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const newLinkId = () => `l_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const QuickLinks = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [groups, setGroups] = useState([]);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkCategory, setLinkCategory] = useState('');
  const [accentId, setAccentId] = useState(DEFAULT_ACCENT_ID);
  const [targetGroupId, setTargetGroupId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draggingLinkId, setDraggingLinkId] = useState(null);
  const [draggingGroupId, setDraggingGroupId] = useState(null);
  const [removeSectionModal, setRemoveSectionModal] = useState({ open: false, groupId: null });
  const [removeSectionInput, setRemoveSectionInput] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const validAccentIds = new Set(ACCENT_PALETTE.map((a) => a.id));

  const normalizeLink = (x) => ({
    ...x,
    category: (x.category || t('lobbyPage.quickLinks.defaultCategory')).trim() || t('lobbyPage.quickLinks.defaultCategory'),
    accentId: validAccentIds.has(x.accentId) ? x.accentId : DEFAULT_ACCENT_ID,
  });

  const normalizeGroup = (g) => ({
    id: g.id || newGroupId(),
    title: g.title == null ? '' : String(g.title),
    collapsed: !!g.collapsed,
    links: Array.isArray(g.links) ? g.links.filter((x) => x && x.id && x.name && x.url).map(normalizeLink) : [],
  });

  /** Label di UI (dropdown, dsb.); judul kosong tidak dipaksakan jadi "Main" */
  const sectionDisplayLabel = (g) => {
    const raw = typeof g.title === 'string' ? g.title : '';
    return raw.trim() !== '' ? raw : t('lobbyPage.quickLinks.untitledSection');
  };

  const loadGroupsFromLocal = () => {
    try {
      const tryParse = (raw) => {
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      };

      let parsed = tryParse(localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.length && Array.isArray(parsed[0].links)) {
        return parsed.map(normalizeGroup);
      }

      const legacy = tryParse(localStorage.getItem(LEGACY_KEY));
      if (legacy && legacy.length && legacy[0].url !== undefined && !Array.isArray(legacy[0].links)) {
        const migrated = [
          normalizeGroup({
            id: newGroupId(),
            title: '',
            collapsed: false,
            links: legacy,
          }),
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }

      if (parsed && parsed.length) {
        return parsed.map(normalizeGroup);
      }

      return [
        normalizeGroup({
          id: newGroupId(),
          title: '',
          collapsed: false,
          links: [],
        }),
      ];
    } catch {
      return [
        normalizeGroup({
          id: newGroupId(),
          title: '',
          collapsed: false,
          links: [],
        }),
      ];
    }
  };

  const syncTimerRef = useRef(null);

  const scheduleQuickLinksSync = (next) => {
    if (!localStorage.getItem('fm_token')) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      putQuickLinks(next).catch(() => {
        message.error(t('lobbyPage.quickLinks.msgSyncFail'));
      });
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const persistGroups = (next) => {
    setGroups(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    scheduleQuickLinksSync(next);
  };

  useEffect(() => {
    let cancelled = false;

    const defaultOneEmpty = () => [
      normalizeGroup({
        id: newGroupId(),
        title: '',
        collapsed: false,
        links: [],
      }),
    ];

    const applyFromArray = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) {
        return defaultOneEmpty();
      }
      return arr.map(normalizeGroup);
    };

    const meaningfulLocalSnapshot = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const meaningful =
          parsed.some((g) => g && Array.isArray(g.links) && g.links.length > 0) ||
          parsed.some((g) => g && String(g.title || '').trim() !== '');
        if (!meaningful) return null;
        return parsed.map(normalizeGroup);
      } catch {
        return null;
      }
    };

    (async () => {
      const token = localStorage.getItem('fm_token');
      if (token) {
        try {
          const { data } = await getQuickLinks();
          if (cancelled) return;
          let serverGroups = Array.isArray(data?.groups) ? data.groups : [];

          if (serverGroups.length === 0) {
            const snap = meaningfulLocalSnapshot();
            if (snap && snap.length > 0) {
              try {
                await putQuickLinks(snap);
                serverGroups = snap;
              } catch {
                serverGroups = [];
              }
            }
          }

          const normalized = applyFromArray(serverGroups);
          setGroups(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          setTargetGroupId(normalized[0]?.id ?? null);
          return;
        } catch {
          /* jatuh ke lokal */
        }
      }

      const loaded = loadGroupsFromLocal();
      if (cancelled) return;
      setGroups(loaded);
      setTargetGroupId(loaded[0]?.id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (targetGroupId && !groups.some((g) => g.id === targetGroupId) && groups[0]) {
      setTargetGroupId(groups[0].id);
    }
  }, [groups, targetGroupId]);

  const resetEditor = (closePanel = true) => {
    setLinkName('');
    setLinkUrl('');
    setLinkCategory('');
    setAccentId(DEFAULT_ACCENT_ID);
    setEditingId(null);
    if (closePanel) setEditorOpen(false);
  };

  const findGroupForLink = (linkId) => groups.find((g) => g.links.some((l) => l.id === linkId));

  const normalizeUrl = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v}`;
  };

  const saveLink = () => {
    const name = linkName.trim();
    const url = normalizeUrl(linkUrl);
    const category = linkCategory.trim() || t('lobbyPage.quickLinks.defaultCategory');
    const gid = targetGroupId || groups[0]?.id;
    if (!gid) return message.warning(t('lobbyPage.quickLinks.msgNeedOneGroup'));
    if (!name) return message.warning(t('lobbyPage.quickLinks.msgNameRequired'));
    if (!/^https?:\/\/.+/i.test(url)) return message.warning(t('lobbyPage.quickLinks.msgUrlInvalid'));

    if (editingId) {
      const payload = { id: editingId, name, url, category, accentId };
      const next = groups.map((g) => {
        const filtered = g.links.filter((l) => l.id !== editingId);
        if (g.id !== gid) {
          return { ...g, links: filtered };
        }
        const oldIdx = g.links.findIndex((l) => l.id === editingId);
        if (oldIdx >= 0) {
          const newLinks = [...filtered];
          newLinks.splice(oldIdx, 0, payload);
          return { ...g, links: newLinks };
        }
        return { ...g, links: [...filtered, payload] };
      });
      persistGroups(next);
      message.success(t('lobbyPage.quickLinks.msgUpdated'));
      resetEditor();
      return;
    }

    const next = groups.map((g) =>
      g.id === gid ? { ...g, links: [...g.links, { id: newLinkId(), name, url, category, accentId }] } : g
    );
    persistGroups(next);
    message.success(t('lobbyPage.quickLinks.msgAdded'));
    resetEditor();
  };

  const editLink = (item) => {
    const g = findGroupForLink(item.id);
    setEditorOpen(true);
    setEditingId(item.id);
    setLinkName(item.name);
    setLinkUrl(item.url);
    setLinkCategory(item.category || t('lobbyPage.quickLinks.defaultCategory'));
    setAccentId(item.accentId && validAccentIds.has(item.accentId) ? item.accentId : DEFAULT_ACCENT_ID);
    if (g) setTargetGroupId(g.id);
  };

  const removeLink = (groupId, linkId) => {
    const next = groups.map((g) => (g.id === groupId ? { ...g, links: g.links.filter((l) => l.id !== linkId) } : g));
    persistGroups(next);
    if (editingId === linkId) resetEditor();
  };

  const clearDragState = () => {
    setDraggingLinkId(null);
    setDraggingGroupId(null);
  };

  /** Pindahkan link yang sedang di-drag: sisip sebelum beforeLinkId, atau append jika null */
  const moveLink = (targetGroupId, beforeLinkId) => {
    if (!draggingLinkId) return;
    if (beforeLinkId === draggingLinkId) {
      clearDragState();
      return;
    }

    const next = groups.map((g) => ({ ...g, links: [...g.links] }));

    let moved = null;
    for (const g of next) {
      const i = g.links.findIndex((l) => l.id === draggingLinkId);
      if (i >= 0) {
        [moved] = g.links.splice(i, 1);
        break;
      }
    }
    if (!moved) {
      clearDragState();
      return;
    }

    const tgt = next.find((g) => g.id === targetGroupId);
    if (!tgt) {
      clearDragState();
      return;
    }

    if (beforeLinkId == null) {
      tgt.links.push(moved);
    } else {
      const j = tgt.links.findIndex((l) => l.id === beforeLinkId);
      if (j < 0) tgt.links.push(moved);
      else tgt.links.splice(j, 0, moved);
    }

    persistGroups(next);
    clearDragState();
  };

  const reorderGroup = (targetGroupId) => {
    if (!draggingGroupId || draggingGroupId === targetGroupId) return;
    const next = [...groups];
    const from = next.findIndex((g) => g.id === draggingGroupId);
    let to = next.findIndex((g) => g.id === targetGroupId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    if (from < to) to -= 1;
    next.splice(to, 0, moved);
    persistGroups(next);
    clearDragState();
  };

  const onLinkDragStart = (linkId) => {
    setDraggingGroupId(null);
    setDraggingLinkId(linkId);
  };

  const onGroupHandleDragStart = (groupId) => {
    setDraggingLinkId(null);
    setDraggingGroupId(groupId);
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success(t('lobbyPage.quickLinks.msgCopied'));
    } catch {
      message.error(t('lobbyPage.quickLinks.msgCopyFail'));
    }
  };

  const addGroup = () => {
    const ng = normalizeGroup({
      id: newGroupId(),
      title: t('lobbyPage.quickLinks.newGroupTitle'),
      collapsed: false,
      links: [],
    });
    persistGroups([...groups, ng]);
    setTargetGroupId(ng.id);
    message.success(t('lobbyPage.quickLinks.msgGroupAdded'));
  };

  /** Simpan apa yang diketik (tanpa trim) supaya spasi di tengah/tepat sebelum huruf berikutnya tidak hilang */
  const setGroupTitle = (groupId, title) => {
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === groupId ? { ...g, title } : g));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      scheduleQuickLinksSync(next);
      return next;
    });
  };

  /** Saat blur: rapikan spasi di awal/akhir; judul boleh benar-benar kosong (tidak dipaksa jadi "Main") */
  const finalizeGroupTitle = (groupId, rawValue) => {
    const v = rawValue.trim();
    setGroups((prev) => {
      const next = prev.map((g) => (g.id === groupId ? { ...g, title: v } : g));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      scheduleQuickLinksSync(next);
      return next;
    });
  };

  const toggleCollapse = (groupId) => {
    persistGroups(groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
  };

  const deleteGroup = (groupId) => {
    if (groups.length <= 1) {
      message.warning(t('lobbyPage.quickLinks.msgNeedOneGroup'));
      return;
    }
    const idx = groups.findIndex((g) => g.id === groupId);
    const victim = groups[idx];
    const rest = groups.filter((g) => g.id !== groupId);
    const mergeInto = rest[Math.max(0, idx - 1)] || rest[0];
    const next = rest.map((g) =>
      g.id === mergeInto.id ? { ...g, links: [...victim.links, ...g.links] } : g
    );
    persistGroups(next);
    if (targetGroupId === groupId) setTargetGroupId(mergeInto.id);
    message.success(t('lobbyPage.quickLinks.msgGroupRemoved'));
  };

  const removeSectionPhrase = t('lobbyPage.quickLinks.confirmRemoveSectionPhrase');
  const removeSectionPhraseMatches = removeSectionInput.trim() === removeSectionPhrase.trim();

  const openRemoveSectionModal = (groupId) => {
    setRemoveSectionInput('');
    setRemoveSectionModal({ open: true, groupId });
  };

  const closeRemoveSectionModal = () => {
    setRemoveSectionInput('');
    setRemoveSectionModal({ open: false, groupId: null });
  };

  const confirmRemoveSection = () => {
    if (!removeSectionModal.groupId || !removeSectionPhraseMatches) return;
    deleteGroup(removeSectionModal.groupId);
    closeRemoveSectionModal();
  };

  const totalLinks = groups.reduce((n, g) => n + g.links.length, 0);

  const renderLinkCard = (item, groupId) => {
    const accent = getAccent(item.accentId);
    const hex = accent.hex;
    const dragging = draggingLinkId === item.id;
    const chrome = linkCardChrome(isDark);
    return (
      <Card
        key={item.id}
        className="lobby-link-card"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onLinkDragStart(item.id);
          try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
          } catch {
            /* ignore */
          }
        }}
        onDragEnd={clearDragState}
        onDragOver={(e) => {
          if (draggingLinkId) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          moveLink(groupId, item.id);
        }}
        style={{
          ...rowAccentStyleProps(hex, isDark, dragging),
          opacity: dragging ? 0.55 : 1,
        }}
        styles={{ body: { padding: '12px 14px' } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              minWidth: 0,
              borderRadius: 12,
              padding: '10px 12px',
              background: chrome.panelBg,
              border: chrome.panelBorder,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, marginBottom: 8 }}>
              <span style={{ color: chrome.icon, display: 'inline-flex', fontSize: 16 }}>
                <LinkOutlined />
              </span>
              <Text
                strong
                style={{
                  fontSize: 15,
                  lineHeight: 1.35,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: chrome.title,
                  margin: 0,
                }}
              >
                {item.name}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  borderRadius: 999,
                  border: `1px solid ${chrome.toolbarBorder}`,
                  background: chrome.toolbarBg,
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => editLink(item)} style={{ color: chrome.icon }} />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeLink(groupId, item.id)} />
                <Button type="text" size="small" icon={<DragOutlined />} style={{ cursor: 'grab', color: chrome.icon }} />
              </div>
              <Tag
                style={{
                  borderRadius: 999,
                  fontWeight: 600,
                  marginInlineEnd: 0,
                  border: `1px solid ${chrome.tagBorder}`,
                  background: chrome.tagBg,
                  color: chrome.tagColor,
                  minWidth: 0,
                  maxWidth: 'min(100%, 280px)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.category || t('lobbyPage.quickLinks.defaultCategory')}
              </Tag>
            </div>
          </div>

          <Space size={8}>
            <Button
              type="primary"
              size="middle"
              icon={<ArrowRightOutlined />}
              onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
              className="fm-btn-primary"
              style={{
                height: 40,
                minWidth: 128,
                paddingInline: 24,
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {t('lobbyPage.quickLinks.visit')}
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => copyLink(item.url)} style={{ height: 40, width: 40, borderRadius: 999 }} />
          </Space>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title level={3} style={{ margin: 0 }}>
            {t('lobbyPage.quickLinks.title')}
          </Title>
          <Text type="secondary">{t('lobbyPage.heroSubtitle')}</Text>
        </div>
        <Space wrap>
          {!editorOpen ? (
            <Button
              className="pc-live-cta"
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                resetEditor(false);
                setEditorOpen(true);
              }}
              style={{
                height: 46,
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                color: '#fff',
                border: 'none',
                paddingInline: 32,
              }}
            >
              {t('lobbyPage.quickLinks.addLinkButton')}
            </Button>
          ) : (
            <Button
              className="ql-editor-close-cta"
              size="large"
              onClick={() => resetEditor()}
              style={{
                height: 46,
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                paddingInline: 28,
                color: '#fff',
              }}
            >
              {t('lobbyPage.quickLinks.closeEditor')}
            </Button>
          )}
        </Space>
      </div>

      {editorOpen && (
      <Card
        className="quick-links-editor-card"
        style={{ ...editorCardStyleProps(isDark), marginBottom: 16 }}
        styles={{ body: { padding: '18px 20px' } }}
      >
        <div style={{ marginBottom: 4 }}>
          <Text style={{ ...formMicroLabel, color: 'var(--text-muted)' }}>{t('lobbyPage.quickLinks.formAddLink')}</Text>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.35fr) minmax(0,0.95fr) auto auto',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <Input size="large" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder={t('lobbyPage.quickLinks.phName')} onPressEnter={saveLink} />
          <Input size="large" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t('lobbyPage.quickLinks.phUrl')} onPressEnter={saveLink} />
          <Input size="large" value={linkCategory} onChange={(e) => setLinkCategory(e.target.value)} placeholder={t('lobbyPage.quickLinks.phCategory')} onPressEnter={saveLink} />
          <Button type="primary" size="large" icon={editingId ? <EditOutlined /> : <PlusOutlined />} onClick={saveLink}>
            {editingId ? t('lobbyPage.quickLinks.update') : t('lobbyPage.quickLinks.add')}
          </Button>
          {editingId ? (
            <Button size="large" onClick={resetEditor}>
              {t('lobbyPage.quickLinks.cancel')}
            </Button>
          ) : (
            <Button size="large" disabled>
              {t('lobbyPage.quickLinks.dragHint')}
            </Button>
          )}
        </div>

        <Divider style={{ margin: '18px 0' }} />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 16,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Text style={{ ...formMicroLabel, color: 'var(--text-muted)' }}>{t('lobbyPage.quickLinks.targetGroup')}</Text>
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <Select
                size="large"
                style={{ flex: '1 1 200px', minWidth: 180 }}
                value={targetGroupId ?? undefined}
                onChange={setTargetGroupId}
                options={groups.map((g) => ({ value: g.id, label: sectionDisplayLabel(g) }))}
                placeholder={t('lobbyPage.quickLinks.targetGroup')}
              />
              <Button size="large" type="default" icon={<FolderAddOutlined />} onClick={addGroup}>
                {t('lobbyPage.quickLinks.addGroup')}
              </Button>
            </div>
          </div>

          <div style={{ flex: '0 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Text style={{ ...formMicroLabel, color: 'var(--text-muted)', alignSelf: 'stretch', textAlign: 'end' }}>{t('lobbyPage.quickLinks.accentLabel')}</Text>
            <div
              role="group"
              aria-label={t('lobbyPage.quickLinks.accentLabel')}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderRadius: 12,
                border: `1px solid ${isDark ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)'}`,
                background: isDark ? 'rgba(2,6,23,0.35)' : 'rgba(255,255,255,0.65)',
                boxShadow: isDark ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'inset 0 1px 0 rgba(255,255,255,0.9)',
              }}
            >
              {ACCENT_PALETTE.map((sw) => {
                const selected = accentId === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    title={sw.id}
                    onClick={() => setAccentId(sw.id)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      border: selected ? `2px solid ${isDark ? '#f8fafc' : '#0f172a'}` : '2px solid rgba(0,0,0,0.12)',
                      boxShadow: selected ? `0 0 0 2px ${sw.hex}99, 0 2px 8px ${sw.hex}44` : '0 1px 3px rgba(0,0,0,0.15)',
                      background: sw.hex,
                      cursor: 'pointer',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                      transform: selected ? 'scale(1.06)' : 'scale(1)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </Card>
      )}

      {totalLinks === 0 && (
        <Card style={{ borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--bg-card)', marginBottom: 14 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('lobbyPage.quickLinks.empty')} />
        </Card>
      )}

      <Modal
        title={t('lobbyPage.quickLinks.confirmRemoveSectionTitle')}
        open={removeSectionModal.open}
        onCancel={closeRemoveSectionModal}
        okText={t('lobbyPage.quickLinks.confirmRemoveSectionOk')}
        okType="danger"
        okButtonProps={{ disabled: !removeSectionPhraseMatches }}
        onOk={() => confirmRemoveSection()}
        destroyOnClose
        maskClosable={false}
        centered
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('lobbyPage.quickLinks.confirmRemoveSectionBody')}
        </Text>
        <Text style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>{t('lobbyPage.quickLinks.confirmRemoveSectionHint')}</Text>
        <Text
          code
          copyable={{ text: removeSectionPhrase }}
          style={{ display: 'block', marginBottom: 10, fontSize: 14 }}
        >
          {removeSectionPhrase}
        </Text>
        <Input
          autoComplete="off"
          placeholder={removeSectionPhrase}
          value={removeSectionInput}
          onChange={(e) => setRemoveSectionInput(e.target.value)}
          onPressEnter={() => removeSectionPhraseMatches && confirmRemoveSection()}
        />
      </Modal>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groups.map((group) => (
          <Card
            key={group.id}
            style={{
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: isDark ? 'rgba(15,23,42,0.5)' : 'rgba(248,250,252,0.95)',
              opacity: draggingGroupId === group.id ? 0.6 : 1,
            }}
            styles={{ body: { padding: 0 } }}
          >
            <div
              role="group"
              onDragOver={(e) => {
                if (draggingGroupId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingGroupId) reorderGroup(group.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderBottom: group.collapsed ? 'none' : '1px solid var(--border)',
                flexWrap: 'wrap',
              }}
            >
              <span
                role="button"
                tabIndex={0}
                title={t('lobbyPage.quickLinks.dragSectionReorder')}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  onGroupHandleDragStart(group.id);
                  try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', `group:${group.id}`);
                  } catch {
                    /* ignore */
                  }
                }}
                onDragEnd={clearDragState}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
                }}
                style={{
                  cursor: 'grab',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 2px',
                  borderRadius: 6,
                }}
              >
                <DragOutlined />
              </span>
              <Button
                type="text"
                size="small"
                icon={group.collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
                onClick={() => toggleCollapse(group.id)}
                aria-label={group.collapsed ? t('lobbyPage.quickLinks.expandGroup') : t('lobbyPage.quickLinks.collapseGroup')}
                style={{ color: 'var(--text-muted)' }}
              />
              <Input
                variant="borderless"
                value={group.title}
                onChange={(e) => setGroupTitle(group.id, e.target.value)}
                onBlur={(e) => finalizeGroupTitle(group.id, e.target.value)}
                style={{ flex: '1 1 180px', fontWeight: 700, fontSize: 15, padding: '4px 8px', minWidth: 0 }}
                placeholder={t('lobbyPage.quickLinks.phGroupTitle')}
              />
              <Tag style={{ marginInlineEnd: 0 }}>{group.links.length}</Tag>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={groups.length <= 1}
                onClick={() => openRemoveSectionModal(group.id)}
              >
                {t('lobbyPage.quickLinks.removeGroup')}
              </Button>
            </div>
            {!group.collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                {group.links.length === 0 ? (
                  <div
                    onDragOver={(e) => {
                      if (draggingLinkId) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      moveLink(group.id, null);
                    }}
                    style={{
                      padding: '20px 14px',
                      borderRadius: 12,
                      border: `1px dashed ${draggingLinkId ? 'var(--indigo)' : 'var(--border)'}`,
                      background: draggingLinkId ? (isDark ? 'rgba(2,132,199,0.08)' : 'rgba(2,132,199,0.06)') : 'transparent',
                      textAlign: 'center',
                    }}
                  >
                    <Text type="secondary">{t('lobbyPage.quickLinks.groupEmpty')}</Text>
                    {draggingLinkId && (
                      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                        {t('lobbyPage.quickLinks.dropLinkHere')}
                      </Text>
                    )}
                  </div>
                ) : (
                  <>
                    {group.links.map((item) => renderLinkCard(item, group.id))}
                    <div
                      onDragOver={(e) => {
                        if (draggingLinkId) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        moveLink(group.id, null);
                      }}
                      style={{
                        minHeight: 28,
                        marginTop: 2,
                        borderRadius: 10,
                        border: draggingLinkId ? `1px dashed var(--indigo)` : '1px dashed transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        padding: '6px 8px',
                      }}
                    >
                      {draggingLinkId ? t('lobbyPage.quickLinks.dropToAppend') : ''}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

export default QuickLinks;
