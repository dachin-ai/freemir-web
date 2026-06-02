import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Spin } from 'antd';
import { ArrowLeftOutlined, PictureOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../api';
import './landing.css';

function ProductImage({ src, alt, placeholderText }) {
    const [failed, setFailed] = useState(!src);
    useEffect(() => setFailed(!src), [src]);
    if (failed || !src) {
        return (
            <div className="landing-product-placeholder">
                <PictureOutlined />
                <span className="landing-product-placeholder-text">{placeholderText}</span>
            </div>
        );
    }
    return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export default function LearnProductsPage() {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        api.get('/public/landing-products', { params: { currency: 'IDR', lang }, timeout: 60000 })
            .then((res) => {
                if (cancelled) return;
                setProducts(res.data?.learn_products || []);
                setAllProducts(res.data?.all_products || []);
            })
            .finally(() => !cancelled && setLoading(false));
        return () => { cancelled = true; };
    }, [i18n.language]);

    const list = useMemo(() => {
        const q = query.trim().toUpperCase();
        if (q) return allProducts.filter((p) => (p.sku || '').toUpperCase().includes(q));
        return products;
    }, [products, allProducts, query]);

    const grouped = useMemo(() => {
        const base = [...list].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        return base.reduce((acc, item) => {
            const key = item.category_l2 || item.category_l1 || 'Other';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }, [list]);

    return (
        <div className="landing-root">
            <section className="landing-section">
                <Link to="/" className="landing-btn landing-btn-outline">
                    <ArrowLeftOutlined />
                    {t('landing.backToHome')}
                </Link>
                <h2 className="landing-section-title" style={{ marginTop: 16 }}>{t('landing.learnProductTitle')}</h2>
                <p className="landing-section-lead">{t('landing.learnProductDesc')}</p>
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('landing.learnSearchPlaceholder')}
                    className="landing-learn-search"
                />
                {loading ? (
                    <div className="landing-products-loading"><Spin /></div>
                ) : (
                    <div className="landing-learn-groups">
                        {Object.entries(grouped).map(([cat, items]) => (
                            <div key={cat} className="landing-learn-group">
                                <div className="landing-learn-group-title">{cat}</div>
                                {items.map((p) => (
                                    <div key={p.sku} className="landing-learn-item">
                                        <ProductImage src={p.image_url} alt={p.name} placeholderText={t('landing.photoNA')} />
                                        <div className="meta">
                                            <div className="sku">{p.sku}</div>
                                            <div className="name">{p.name}</div>
                                            <div className="cat">{p.category_l1 || '-'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
