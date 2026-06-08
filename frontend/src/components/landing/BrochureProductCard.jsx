import React from 'react';
import {
    discountBadge,
    formatProductOriginalPrice,
    formatProductPrice,
    productHasStrikethroughOriginal,
} from './landingProductHelpers';
import { prettyAdvantage } from '../../utils/productCatalogBrochure';

const VARIANT_CONFIG = {
    compact: { maxAdv: 5 },
    standard: { maxAdv: 5 },
    large: { maxAdv: 5 },
    hero: { maxAdv: 5 },
};

function BrochurePriceBlock({ product, currency, comingSoon }) {
    const priceStr = formatProductPrice(product, currency, comingSoon);
    const isMuted = !product?.has_price;
    const showStrike = productHasStrikethroughOriginal(product);
    const originalStr = formatProductOriginalPrice(product, currency);
    const badge = discountBadge(product);

    if (isMuted) {
        return <p className="brochure-card-price is-muted">{priceStr}</p>;
    }

    return (
        <div className="brochure-card-pricing">
            {showStrike ? (
                <span className="brochure-card-price-original">{originalStr}</span>
            ) : null}
            <div className="brochure-card-price-row">
                <span className="brochure-card-price">{priceStr}</span>
                {badge}
            </div>
        </div>
    );
}

export default function BrochureProductCard({
    product,
    currency,
    comingSoon,
    variant = 'compact',
    isTopTier = false,
}) {
    const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.compact;
    const advantages = (product?.detail?.advantages || [])
        .filter(Boolean)
        .slice(0, cfg.maxAdv)
        .map(prettyAdvantage)
        .filter(Boolean);

    return (
        <article className={`brochure-card brochure-card--${variant}${isTopTier ? ' is-top-tier' : ''}`}>
            <div className="brochure-card-media">
                <div className="brochure-card-media-frame">
                    {product?.image_url ? (
                        <img src={product.image_url} alt={product.name || ''} loading="lazy" decoding="async" />
                    ) : (
                        <span className="brochure-card-media-fallback" aria-hidden />
                    )}
                </div>
            </div>
            <div className="brochure-card-body">
                <div className="brochure-card-meta">
                    <span className="brochure-card-sku">{product?.sku}</span>
                </div>
                <h3 className="brochure-card-name">{product?.name}</h3>
                <BrochurePriceBlock product={product} currency={currency} comingSoon={comingSoon} />
                {advantages.length > 0 && (
                    <ul className="brochure-card-advs">
                        {advantages.map((adv) => (
                            <li key={`${product.sku}-${adv}`} className="brochure-card-adv">
                                <span className="brochure-adv-bullet" aria-hidden />
                                <span className="brochure-adv-text">{adv}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </article>
    );
}
