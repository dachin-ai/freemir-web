import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import './landing.css';

export default function CompareProductsPage() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [picked, setPicked] = useState([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        api.get('/public/landing-products', { params: { currency: 'IDR', lang }, timeout: 60000 })
            .then((res) => !cancelled && setProducts(res.data?.compare_products || []))
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [i18n.language]);

    const mapBySku = useMemo(() => Object.fromEntries(products.map((p) => [p.sku, p])), [products]);
    const selected = picked.map((sku) => mapBySku[sku]).filter(Boolean);
    const toggle = (sku) => setPicked((prev) => {
        if (prev.includes(sku)) return prev.filter((x) => x !== sku);
        if (prev.length >= 4) return prev;
        return [...prev, sku];
    });

    return (
        <div className="landing-root">
            <section className="landing-section">
                <Link to="/" className="landing-btn landing-btn-outline">
                    <ArrowLeftOutlined />
                    {t('landing.backToHome')}
                </Link>
                <h2 className="landing-section-title" style={{ marginTop: 16 }}>{t('landing.compareTitle')}</h2>
                <p className="landing-section-lead">{t('landing.compareDesc')}</p>
                {loading ? (
                    <div className="landing-products-loading"><Spin /></div>
                ) : (
                    <>
                        <div className="landing-compare-picks">
                            {products.map((p) => (
                                <button
                                    key={p.sku}
                                    type="button"
                                    onClick={() => toggle(p.sku)}
                                    className={`landing-compare-chip ${picked.includes(p.sku) ? 'active' : ''}`}
                                >
                                    {p.sku}
                                </button>
                            ))}
                        </div>
                        <div className="landing-compare-limit-note">
                            {t('landing.compareLimit', { count: picked.length })}
                        </div>
                        <div className="landing-compare-table-wrap">
                            <table className="landing-compare-table">
                                <thead>
                                    <tr>
                                        <th>{t('landing.compareField')}</th>
                                        {selected.map((p) => <th key={p.sku}>{p.sku}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>{t('landing.compareName')}</td>
                                        {selected.map((p) => <td key={`name-${p.sku}`}>{p.name}</td>)}
                                    </tr>
                                    <tr>
                                        <td>{t('landing.modal.color')}</td>
                                        {selected.map((p) => <td key={`color-${p.sku}`}>{p.detail?.color || '-'}</td>)}
                                    </tr>
                                    <tr>
                                        <td>{t('landing.modal.weight')}</td>
                                        {selected.map((p) => <td key={`w-${p.sku}`}>{p.detail?.nett_weight_g || '-'}</td>)}
                                    </tr>
                                    <tr>
                                        <td>{t('landing.modal.dimensions')}</td>
                                        {selected.map((p) => <td key={`d-${p.sku}`}>{p.detail?.product_dimension_cm || '-'}</td>)}
                                    </tr>
                                    <tr>
                                        <td>{t('landing.modal.advantages')}</td>
                                        {selected.map((p) => <td key={`a-${p.sku}`}>{(p.detail?.advantages || []).join(' | ') || '-'}</td>)}
                                    </tr>
                                    <tr>
                                        <td>{t('landing.modal.detailAdvantages')}</td>
                                        {selected.map((p) => <td key={`da-${p.sku}`}>{(p.detail?.detail_advantages || []).join(' | ') || '-'}</td>)}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
