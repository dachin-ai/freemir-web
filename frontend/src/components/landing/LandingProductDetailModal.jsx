import React, { useEffect, useState } from 'react';
import { Modal, Spin } from 'antd';
import { ArrowRightOutlined, PlayCircleOutlined, ShopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import { LANDING_OFFICIAL_STORE_URL } from '../../data/landingContact';
import {
    ProductImage,
    discountBadge,
    formatIdr,
    isZeroSalesProduct,
    normalizeInline,
} from './landingProductHelpers';

function isSameMediaUrl(a, b) {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    return Boolean(left && right && left === right);
}

export default function LandingProductDetailModal({ product, onClose }) {
    const { t, i18n } = useTranslation();
    const [detailProduct, setDetailProduct] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const display = detailProduct || product;
    const detail = display?.detail || {};
    const gallery = display?.media_gallery || {};
    const mainImageUrl = String(display?.image_url || product?.image_url || '').trim();
    const galleryPhotos = (gallery.photos || []).filter(
        (ph) => ph?.url && !isSameMediaUrl(ph.url, mainImageUrl),
    );
    const hasVideo = Boolean(gallery.video?.url);
    const showGalleryStrip = Boolean(
        mainImageUrl || hasVideo || galleryPhotos.length > 0,
    );

    const [activeMain, setActiveMain] = useState({
        type: 'image',
        url: '',
        posterUrl: null,
    });

    useEffect(() => {
        if (!product?.sku) {
            setDetailProduct(null);
            setActiveMain({ type: 'image', url: '', posterUrl: null });
            return undefined;
        }

        const sku = product.sku;
        const lang = (i18n.language || 'id').slice(0, 2).toLowerCase();
        let cancelled = false;

        setDetailLoading(true);
        setDetailProduct(product);
        setActiveMain({
            type: 'image',
            url: product.image_url || '',
            posterUrl: null,
        });

        api.get(`/public/landing-products/${encodeURIComponent(sku)}`, {
            params: { currency: 'IDR', lang },
            timeout: 30000,
        })
            .then((res) => {
                if (cancelled) return;
                const full = res.data || product;
                setDetailProduct(full);
                setActiveMain({
                    type: 'image',
                    url: full.image_url || product.image_url || '',
                    posterUrl: null,
                });
            })
            .catch(() => {
                if (!cancelled) setDetailProduct(product);
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });

        return () => { cancelled = true; };
    }, [product?.sku, i18n.language]);

    return (
        <Modal
            open={!!product}
            title={display?.name || product?.name || ''}
            onCancel={onClose}
            footer={null}
            width={760}
            className="landing-product-modal"
            maskStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)' }}
            destroyOnClose
        >
            {product && (
                <div className="landing-product-modal-content">
                    <div className="landing-product-modal-media">
                        {detailLoading && (
                            <div className="landing-modal-media-loading">
                                <Spin size="small" />
                            </div>
                        )}
                        <div className="landing-modal-main-view">
                            {activeMain.type === 'video' && activeMain.url ? (
                                <video
                                    key={activeMain.url}
                                    className="landing-modal-main-video"
                                    src={activeMain.url}
                                    poster={activeMain.posterUrl || undefined}
                                    controls
                                    playsInline
                                />
                            ) : (
                                <ProductImage
                                    src={activeMain.url || display?.image_url || product.image_url}
                                    alt={display?.name || product.name}
                                    eager
                                    className="landing-modal-main-img"
                                />
                            )}
                        </div>
                        {showGalleryStrip && (
                            <div className="landing-modal-gallery" role="list">
                                {mainImageUrl && (
                                    <button
                                        type="button"
                                        role="listitem"
                                        className={`landing-modal-thumb landing-modal-thumb-main${
                                            activeMain.type === 'image' && isSameMediaUrl(activeMain.url, mainImageUrl)
                                                ? ' active'
                                                : ''
                                        }`}
                                        onClick={() => setActiveMain({
                                            type: 'image',
                                            url: mainImageUrl,
                                            posterUrl: null,
                                        })}
                                    >
                                        <img src={mainImageUrl} alt="" />
                                        <span className="landing-modal-thumb-label">{t('landing.modal.mainPhoto')}</span>
                                    </button>
                                )}
                                {gallery.video?.url && (
                                    <button
                                        type="button"
                                        role="listitem"
                                        className={`landing-modal-thumb landing-modal-thumb-video${
                                            activeMain.type === 'video' && activeMain.url === gallery.video.url
                                                ? ' active'
                                                : ''
                                        }`}
                                        onClick={() => setActiveMain({
                                            type: 'video',
                                            url: gallery.video.url,
                                            posterUrl: gallery.video.posterUrl || null,
                                        })}
                                    >
                                        {gallery.video.posterUrl ? (
                                            <img src={gallery.video.posterUrl} alt="" />
                                        ) : (
                                            <span className="landing-modal-thumb-video-fallback" aria-hidden>
                                                <PlayCircleOutlined />
                                            </span>
                                        )}
                                        <span className="landing-modal-thumb-label">{t('landing.modal.video')}</span>
                                    </button>
                                )}
                                {galleryPhotos.map((ph) => (
                                    <button
                                        key={ph.materialId}
                                        type="button"
                                        role="listitem"
                                        className={`landing-modal-thumb${
                                            activeMain.type === 'image' && activeMain.url === ph.url ? ' active' : ''
                                        }`}
                                        onClick={() => setActiveMain({
                                            type: 'image',
                                            url: ph.url,
                                            posterUrl: null,
                                        })}
                                    >
                                        <img src={ph.posterUrl || ph.url} alt="" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="landing-product-modal-info">
                        <div className="landing-modal-sku">{display?.sku || product.sku}</div>
                        {isZeroSalesProduct(display || product) && (
                            <span className="landing-learn-disc-label landing-learn-disc-label--modal">
                                {t('landing.learnDiscontinuedBadge')}
                            </span>
                        )}
                        <div className="landing-modal-price-line">
                            <div className="landing-modal-price">{formatIdr(display?.sale_price)}</div>
                            {discountBadge(display || product)}
                        </div>
                        <div className="landing-modal-price-original">
                            <strong>{t('landing.modal.originalPrice')}:</strong>{' '}
                            {display?.original_price != null ? formatIdr(display.original_price) : '—'}
                        </div>
                        <div className="landing-modal-price-original">
                            <strong>{t('landing.modal.discountPrice')}:</strong> {formatIdr(display?.sale_price)}
                        </div>
                        <div className="landing-modal-grid">
                            <div><strong>{t('landing.modal.category')}:</strong> {display?.category_l1 || '—'}</div>
                            <div><strong>{t('landing.modal.subCategory')}:</strong> {display?.category_l2 || '—'}</div>
                            <div><strong>{t('landing.modal.color')}:</strong> {detail.color || '—'}</div>
                            <div><strong>{t('landing.modal.mainMaterial')}:</strong> {detail.main_material || '—'}</div>
                            <div><strong>{t('landing.modal.subMaterial')}:</strong> {detail.sub_material || '—'}</div>
                            <div><strong>{t('landing.modal.detailMaterial')}:</strong> {detail.detail_material || '—'}</div>
                            <div className="landing-modal-grid-span">
                                <strong>{t('landing.modal.dimensions')}:</strong>{' '}
                                {normalizeInline(detail.product_dimension_cm) || '—'}
                            </div>
                            <div className="landing-modal-grid-span">
                                <strong>{t('landing.modal.packageDimensions')}:</strong>{' '}
                                {normalizeInline(detail.package_dimension_cm) || '—'}
                            </div>
                            <div><strong>{t('landing.modal.grossWeight')}:</strong> {detail.gross_weight_g || '—'}</div>
                            <div><strong>{t('landing.modal.weight')}:</strong> {detail.nett_weight_g || '—'}</div>
                        </div>
                        {detail.notes && (
                            <div className="landing-modal-notes">
                                <strong>{t('landing.modal.notes')}:</strong> {detail.notes}
                            </div>
                        )}
                        <div className="landing-modal-adv-table-wrap">
                            <div className="landing-modal-adv-title">{t('landing.modal.advTableTitle')}</div>
                            <table className="landing-modal-adv-table">
                                <thead>
                                    <tr>
                                        <th>{t('landing.modal.advantages')}</th>
                                        <th>{t('landing.modal.detailAdvantages')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({
                                        length: Math.max(
                                            (detail.advantages || []).length,
                                            (detail.detail_advantages || []).length,
                                            1,
                                        ),
                                    }).map((_, idx) => (
                                        <tr key={`adv-row-${idx}`}>
                                            <td>{detail.advantages?.[idx] || '-'}</td>
                                            <td>{detail.detail_advantages?.[idx] || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <a
                            href={LANDING_OFFICIAL_STORE_URL}
                            className="landing-btn landing-btn-primary landing-modal-shop"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ShopOutlined />
                            {t('landing.buyAtOfficialStore')}
                            <ArrowRightOutlined />
                        </a>
                    </div>
                </div>
            )}
        </Modal>
    );
}
