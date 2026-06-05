import React from 'react';
import { formatProductPrice } from './landingProductHelpers';
import { prettyAdvantage } from '../../utils/productCatalogBrochure';

/**
 * Per-variant config: maxAdvantages, image height (for non-hero), etc.
 * hero variant uses CSS for proportional sizing.
 */
const VARIANT_CONFIG = {
    compact: { maxAdv: 3 },
    standard: { maxAdv: 4 },
    large: { maxAdv: 5 },
    hero: { maxAdv: 5 },
};

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

    const priceStr = formatProductPrice(product, currency, comingSoon);
    const isMuted = !product?.has_price;

    return (
        <article className={`brochure-card brochure-card--${variant}${isTopTier ? ' is-top-tier' : ''}`}>
            <div className="brochure-card-media">
                {product?.image_url ? (
                    <img src={product.image_url} alt={product.name || ''} loading="lazy" decoding="async" />
                ) : (
                    <span className="brochure-card-media-fallback" aria-hidden />
                )}
            </div>
            <div className="brochure-card-body">
                <span className="brochure-card-sku">{product?.sku}</span>
                <h3 className="brochure-card-name">{product?.name}</h3>
                <p className={`brochure-card-price${isMuted ? ' is-muted' : ''}`}>{priceStr}</p>
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
