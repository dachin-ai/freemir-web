import React, { useState, useEffect } from 'react';
import { Select, Button, Card, Tag, Typography, Space, Empty, Table, message } from 'antd';
import { SendOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { submitAccessRequest, getMyAccessRequests } from '../api';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

const TOOL_KEYS = [
    'price_checker',
    'order_planner',
    'product_performance',
    'photo_downloader',
    'brand_material',
    'sku_review',
    'order_review',
    'affiliate_performance',
    'livestream_display',
    'pre_sales',
    'affiliate_analyzer',
    'ads_analyzer',
];

function StatusTagRequest({ status }) {
    const { t } = useTranslation();
    if (status === 'pending') {
        return <Tag icon={<ClockCircleOutlined />} color="gold">{t('accessMgmt.statusPending')}</Tag>;
    }
    if (status === 'approved') {
        return <Tag icon={<CheckCircleOutlined />} color="success">{t('accessMgmt.statusApproved')}</Tag>;
    }
    return <Tag icon={<CloseCircleOutlined />} color="error">{t('accessMgmt.statusRejected')}</Tag>;
}

export default function RequestAccess() {
    const { t } = useTranslation();
    const { hasAccess } = useAuth();
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(false);
    const [requests, setRequests] = useState([]);
    const [fetching, setFetching] = useState(true);

    const availableTools = TOOL_KEYS.filter((key) => !hasAccess(key));

    const fetchRequests = async () => {
        try {
            const res = await getMyAccessRequests();
            setRequests(res.data);
        } catch {
            // silently fail
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => { fetchRequests(); }, []);

    const handleSubmit = async () => {
        if (!selected) return;
        setLoading(true);
        try {
            await submitAccessRequest(selected);
            message.success(t('accessRequest.msgSubmitted'));
            setSelected(null);
            fetchRequests();
        } catch (err) {
            message.error(err.response?.data?.detail || t('accessRequest.msgSubmitFail'));
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: t('accessRequest.colTool'),
            dataIndex: 'tool_key',
            render: (v) => t(`accessRequest.tools.${v}`, { defaultValue: v }),
        },
        {
            title: t('accessRequest.colStatus'),
            dataIndex: 'status',
            render: (s) => <StatusTagRequest status={s} />,
            width: 140,
        },
        {
            title: t('accessRequest.colRequestedAt'),
            dataIndex: 'created_at',
            width: 180,
            render: v => v ? new Date(v).toLocaleString() : '—',
        },
    ];

    const pendingKeys = requests.filter(r => r.status === 'pending').map(r => r.tool_key);
    const selectableTools = availableTools.filter((key) => !pendingKeys.includes(key));

    return (
        <div style={{ padding: '24px 32px', maxWidth: 720, margin: '0 auto' }}>
            <PageHeader
                title={t('accessRequest.title')}
                subtitle={t('accessRequest.subtitle')}
            />

            <Card
                style={{
                    marginBottom: 24,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                }}
            >
                {selectableTools.length === 0 ? (
                    <Empty description={
                        <Text style={{ color: 'var(--text-muted)' }}>
                            {availableTools.length === 0
                                ? t('accessRequest.emptyAllAccess')
                                : t('accessRequest.emptyPending')}
                        </Text>
                    } />
                ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Text style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                            {t('accessRequest.selectPrompt')}
                        </Text>
                        <Space.Compact style={{ width: '100%' }}>
                            <Select
                                style={{ flex: 1 }}
                                placeholder={t('accessRequest.placeholderTool')}
                                value={selected}
                                onChange={setSelected}
                                size="large"
                                options={selectableTools.map((key) => ({
                                    value: key,
                                    label: t(`accessRequest.tools.${key}`),
                                }))}
                            />
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                onClick={handleSubmit}
                                loading={loading}
                                disabled={!selected}
                                size="large"
                                style={{ background: 'var(--fm-gradient)', border: 'none', boxShadow: 'var(--fm-shadow)' }}
                            >
                                {t('accessRequest.submit')}
                            </Button>
                        </Space.Compact>
                    </Space>
                )}
            </Card>

            {(fetching || requests.length > 0) && (
                <Card
                    title={<Text style={{ color: 'var(--text-main)', fontWeight: 600 }}>{t('accessRequest.myRequests')}</Text>}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}
                >
                    <Table
                        dataSource={requests}
                        columns={columns}
                        rowKey="id"
                        loading={fetching}
                        pagination={false}
                        size="middle"
                    />
                </Card>
            )}
        </div>
    );
}
