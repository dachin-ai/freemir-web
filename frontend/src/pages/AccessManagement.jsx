import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, Table, Button, Tag, Checkbox, message, Typography, Space, Badge, Input } from 'antd';
import {
    CheckOutlined, CloseOutlined, ReloadOutlined, SaveOutlined,
    ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    getAccessRequests, approveAccessRequest, rejectAccessRequest,
    getAllUsersWithPermissions, updateUserPermissions,
} from '../api';
import PageHeader from '../components/PageHeader';
import UserActivity from './UserActivity';

const { Text } = Typography;

const PERM_TOOLS = [
    { key: 'admin',                 group: 'admin'   },
    { key: 'price_checker',         group: 'freemir' },
    { key: 'order_planner',         group: 'freemir' },
    { key: 'product_performance',   group: 'freemir' },
    { key: 'photo_downloader',      group: 'freemir' },
    { key: 'order_review',          group: 'shopee'  },
    { key: 'affiliate_performance', group: 'shopee'  },
    { key: 'livestream_display',    group: 'shopee'  },
    { key: 'pre_sales',             group: 'tiktok'  },
    { key: 'affiliate_analyzer',    group: 'tiktok'  },
    { key: 'ads_analyzer',          group: 'tiktok'  },
];

const GROUP_STYLE = {
    admin:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
    freemir: { color: '#6366f1', bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)' },
    shopee:  { color: '#f97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.25)' },
    tiktok:  { color: '#ec4899', bg: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.25)' },
};

function StatusTag({ status }) {
    const { t } = useTranslation();
    if (status === 'pending') {
        return <Tag icon={<ClockCircleOutlined />} color="gold">{t('accessMgmt.statusPending')}</Tag>;
    }
    if (status === 'approved') {
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('accessMgmt.statusApproved')}</Tag>;
    }
    return <Tag icon={<CloseCircleOutlined />} color="error">{t('accessMgmt.statusRejected')}</Tag>;
}

/* ─────────────── Tab 1: Access Requests ─────────────── */
function AccessRequestsTab() {
    const { t } = useTranslation();
    const [data, setData]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing]   = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getAccessRequests();
            setData(res.data);
        } catch {
            message.error(t('accessMgmt.msgLoadRequestsFail'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleApprove = async (id) => {
        const nameInput = window.prompt(t('accessMgmt.promptDisplayName'));
        if (nameInput === null) return;

        setActing(id);
        try {
            await approveAccessRequest(id, nameInput.trim());
            message.success(t('accessMgmt.msgApproved'));
            fetchData();
        } catch (err) {
            message.error(err.response?.data?.detail || t('accessMgmt.msgApproveFail'));
        } finally {
            setActing(null);
        }
    };

    const handleReject = async (id) => {
        setActing(id);
        try {
            await rejectAccessRequest(id);
            message.success(t('accessMgmt.msgRejected'));
            fetchData();
        } catch (err) {
            message.error(err.response?.data?.detail || t('accessMgmt.msgRejectFail'));
        } finally {
            setActing(null);
        }
    };

    const pendingCount = data.filter(r => r.status === 'pending').length;

    const columns = [
        { title: t('accessMgmt.colUsername'), dataIndex: 'username', key: 'username', width: 160 },
        {
            title: t('accessMgmt.colTool'),
            dataIndex: 'tool_key',
            key: 'tool',
            render: (v) => t(`accessMgmt.toolLabels.${v}`, { defaultValue: v }),
        },
        { title: t('accessMgmt.colStatus'), dataIndex: 'status', key: 'status', width: 120, render: (s) => <StatusTag status={s} /> },
        {
            title: t('accessMgmt.colRequestedAt'),
            dataIndex: 'created_at',
            key: 'time',
            width: 180,
            render: v => v ? new Date(v).toLocaleString() : '—',
        },
        {
            title: t('accessMgmt.colActions'),
            key: 'actions',
            width: 180,
            render: (_, row) => row.status !== 'pending' ? null : (
                <Space size={8}>
                    <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={acting === row.id}
                        onClick={() => handleApprove(row.id)}
                        style={{ background: '#10b981', border: 'none', borderRadius: 6 }}
                    >
                        {t('accessMgmt.approve')}
                    </Button>
                    <Button
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        loading={acting === row.id}
                        onClick={() => handleReject(row.id)}
                        style={{ borderRadius: 6 }}
                    >
                        {t('accessMgmt.reject')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Space>
                    <Text style={{ color: 'var(--text-muted)' }}>
                        {pendingCount > 0
                            ? <><Badge color="gold" /><span style={{ marginLeft: 6 }}>{t('accessMgmt.pendingReview', { count: pendingCount })}</span></>
                            : t('accessMgmt.noPending')}
                    </Text>
                </Space>
                <Button icon={<ReloadOutlined />} onClick={fetchData} size="small">{t('accessMgmt.refresh')}</Button>
            </div>
            <Table
                dataSource={data}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 20 }}
                size="middle"
            />
        </div>
    );
}

/* ─────────────── Tab 2: User Permissions Matrix ─────────────── */
function UserPermissionsTab() {
    const { t } = useTranslation();
    const [users, setUsers]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(null);
    const [editingNames, setEditingNames] = useState({});
    /** Latest display names for API calls (permission toggles run before React re-renders). */
    const editingNamesRef = useRef({});
    useEffect(() => {
        editingNamesRef.current = editingNames;
    }, [editingNames]);

    const normalizePermissions = (permissions) => {
        if (!permissions) return {};
        if (typeof permissions === 'object') return permissions;
        if (typeof permissions === 'string') {
            try {
                const parsed = JSON.parse(permissions);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
                return {};
            }
        }
        return {};
    };

    const toPermissionInt = (value) => {
        if (value === 1 || value === true) return 1;
        if (typeof value === 'string' && ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase())) return 1;
        return 0;
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getAllUsersWithPermissions();
            const normalized = (res.data || []).map((u) => ({
                ...u,
                name: u.name || u.username,
                permissions: normalizePermissions(u.permissions),
            }));
            setUsers(normalized);
            setEditingNames(Object.fromEntries(normalized.map((u) => [u.username, u.name || u.username])));
        } catch {
            message.error(t('accessMgmt.msgLoadUsersFail'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const togglePermission = async (username, toolKey, currentValue) => {
        const currentInt = toPermissionInt(currentValue);
        const newValue = currentInt === 1 ? 0 : 1;
        setUsers(prev => prev.map(u =>
            u.username === username
                ? { ...u, permissions: { ...u.permissions, [toolKey]: newValue } }
                : u
        ));
        setSaving(username);
        try {
            const user = users.find(u => u.username === username);
            const updatedPerms = { ...normalizePermissions(user?.permissions), [toolKey]: newValue };
            const displayName =
                editingNamesRef.current[username] ?? user?.name ?? user?.username ?? username;
            await updateUserPermissions(username, updatedPerms, displayName);
        } catch (err) {
            message.error(t('accessMgmt.msgPermFail'));
            setUsers(prev => prev.map(u =>
                u.username === username
                    ? { ...u, permissions: { ...u.permissions, [toolKey]: currentInt } }
                    : u
            ));
        } finally {
            setSaving(null);
        }
    };

    const saveDisplayName = async (username) => {
        const user = users.find((u) => u.username === username);
        if (!user) return;
        const nextName = (editingNames[username] || '').trim();
        if (!nextName) {
            message.warning(t('accessMgmt.msgNameEmpty'));
            setEditingNames((prev) => ({ ...prev, [username]: user.name || user.username }));
            return;
        }
        if (nextName === (user.name || user.username)) return;

        setSaving(username);
        try {
            await updateUserPermissions(username, normalizePermissions(user.permissions), nextName);
            setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, name: nextName } : u)));
            message.success(t('accessMgmt.msgNameUpdated', { username }));
        } catch (err) {
            message.error(err.response?.data?.detail || t('accessMgmt.msgNameFail'));
            setEditingNames((prev) => ({ ...prev, [username]: user.name || user.username }));
        } finally {
            setSaving(null);
        }
    };

    /** Selalu tulis semua baris: nama dari UI + permission saat ini → database (tanpa cek diff). */
    const saveAllDisplayNames = async () => {
        if (!users.length) return;
        setSaving('__bulk_names__');
        try {
            let ok = 0;
            for (const u of users) {
                let nextName = (editingNames[u.username] ?? u.name ?? u.username ?? '').trim();
                if (!nextName) nextName = String(u.username || '').trim() || u.username;
                await updateUserPermissions(u.username, normalizePermissions(u.permissions), nextName);
                ok += 1;
                setUsers((prev) =>
                    prev.map((x) => (x.username === u.username ? { ...x, name: nextName } : x)),
                );
                setEditingNames((prev) => ({ ...prev, [u.username]: nextName }));
            }
            message.success(t('accessMgmt.msgAllNamesSaved', { count: ok }));
        } catch (err) {
            message.error(err.response?.data?.detail || t('accessMgmt.msgSaveAllFail'));
            await fetchUsers();
        } finally {
            setSaving(null);
        }
    };

    const toolColumns = PERM_TOOLS.map(tool => {
        const gs = GROUP_STYLE[tool.group] || GROUP_STYLE.freemir;
        return {
            title: (
                <div style={{
                    background: gs.bg,
                    border: `1px solid ${gs.border}`,
                    borderRadius: 6,
                    padding: '2px 6px',
                    color: gs.color,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                }}>
                    {t(`accessMgmt.toolLabels.${tool.key}`)}
                </div>
            ),
            key: tool.key,
            width: 110,
            align: 'center',
            render: (_, row) => (
                <Checkbox
                    checked={toPermissionInt(row.permissions?.[tool.key]) === 1}
                    disabled={saving === row.username || saving === '__bulk_names__'}
                    onChange={() => togglePermission(row.username, tool.key, row.permissions?.[tool.key] ?? 0)}
                />
            ),
        };
    });

    const columns = [
        {
            title: t('accessMgmt.colUsername'),
            dataIndex: 'username',
            key: 'username',
            fixed: 'left',
            width: 150,
            render: v => <Text strong style={{ color: 'var(--text-main)' }}>{v}</Text>,
        },
        {
            title: t('accessMgmt.colName'),
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (_, row) => (
                <Input
                    size="small"
                    value={editingNames[row.username] ?? row.name ?? row.username}
                    disabled={saving === row.username || saving === '__bulk_names__'}
                    onChange={(e) =>
                        setEditingNames((prev) => ({ ...prev, [row.username]: e.target.value }))
                    }
                    onBlur={() => saveDisplayName(row.username)}
                    onPressEnter={() => saveDisplayName(row.username)}
                />
            ),
        },
        {
            title: t('accessMgmt.colEmail'),
            dataIndex: 'email',
            key: 'email',
            width: 220,
            render: v => <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{v}</Text>,
        },
        ...toolColumns,
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, maxWidth: 560, lineHeight: 1.5 }}>
                    {t('accessMgmt.permissionsHint')}
                </Text>
                <Space wrap>
                    <Button
                        icon={<SaveOutlined />}
                        type="primary"
                        size="small"
                        loading={saving === '__bulk_names__'}
                        disabled={loading || saving === '__bulk_names__'}
                        onClick={saveAllDisplayNames}
                    >
                        {t('accessMgmt.saveNames')}
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        size="small"
                        loading={loading}
                        onClick={fetchUsers}
                    >
                        {t('accessMgmt.reloadFromDb')}
                    </Button>
                </Space>
            </div>
            <Table
                dataSource={users}
                columns={columns}
                rowKey="username"
                loading={loading}
                scroll={{ x: 'max-content' }}
                pagination={false}
                size="middle"
            />
        </div>
    );
}

/* ─────────────── Main Page ─────────────── */
export default function AccessManagement() {
    const { t } = useTranslation();
    const isAdmin = true;
    const tabItems = [
        {
            key: 'requests',
            label: t('accessMgmt.tabRequests'),
            children: <AccessRequestsTab />,
        },
        {
            key: 'permissions',
            label: t('accessMgmt.tabPermissions'),
            children: <UserPermissionsTab />,
        },
    ];
    if (isAdmin) {
        tabItems.push({
            key: 'user-activity',
            label: t('accessMgmt.tabActivity'),
            children: <UserActivity />,
        });
    }
    return (
        <div style={{ padding: '24px 32px' }}>
            <PageHeader
                title={t('accessMgmt.title')}
                subtitle={t('accessMgmt.subtitle')}
                accent="#f59e0b"
            />
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 24,
            }}>
                <Tabs
                    defaultActiveKey="requests"
                    items={tabItems}
                />
            </div>
        </div>
    );
}
