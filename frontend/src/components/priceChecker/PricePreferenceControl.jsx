import React, { useMemo, useState } from 'react';
import { Dropdown } from 'antd';
import { CheckOutlined, DownOutlined, SlidersOutlined } from '@ant-design/icons';

export function getPriceTierFamily(tier) {
    if (tier === 'Warning') return 'warning';
    if (tier.startsWith('Daily-')) return 'daily';
    if (tier.startsWith('DD-')) return 'dd';
    if (tier.startsWith('PD-')) return 'pd';
    return 'default';
}

function groupTierOptions(tiers) {
    const groups = [
        { id: 'warning', label: 'Warning', tiers: tiers.filter((t) => t === 'Warning') },
        { id: 'daily', label: 'Daily', tiers: tiers.filter((t) => t.startsWith('Daily-')) },
        { id: 'dd', label: 'DD', tiers: tiers.filter((t) => t.startsWith('DD-')) },
        { id: 'pd', label: 'PD', tiers: tiers.filter((t) => t.startsWith('PD-')) },
    ];
    return groups.filter((g) => g.tiers.length > 0);
}

export default function PricePreferenceControl({ value, onChange, options, label }) {
    const [open, setOpen] = useState(false);
    const family = getPriceTierFamily(value);
    const groups = useMemo(() => groupTierOptions(options), [options]);

    const handleSelect = (tier) => {
        onChange(tier);
        setOpen(false);
    };

    const menu = (
        <div className="pc-pref-menu" role="listbox" aria-label={label}>
            {groups.map((group) => (
                <div key={group.id} className="pc-pref-menu__group">
                    <div className={`pc-pref-menu__group-label pc-pref-menu__group-label--${group.id}`}>
                        {group.label}
                    </div>
                    {group.tiers.map((tier) => {
                        const active = tier === value;
                        const tierFamily = getPriceTierFamily(tier);
                        return (
                            <button
                                key={tier}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`pc-pref-menu__item pc-pref-menu__item--${tierFamily}${active ? ' is-active' : ''}`}
                                onClick={() => handleSelect(tier)}
                            >
                                <span className="pc-pref-menu__item-bar" aria-hidden />
                                <span className="pc-pref-menu__item-text">{tier}</span>
                                {active ? <CheckOutlined className="pc-pref-menu__item-check" aria-hidden /> : null}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    return (
        <div className="pc-price-preference">
            <Dropdown
                trigger={['click']}
                open={open}
                onOpenChange={setOpen}
                placement="bottomRight"
                popupRender={() => menu}
                overlayClassName="pc-pref-dropdown"
            >
                <button
                    type="button"
                    className={`pc-pref-trigger pc-pref-trigger--${family}${open ? ' is-open' : ''}`}
                    title={`${label}: ${value}`}
                    aria-haspopup="listbox"
                    aria-label={`${label}: ${value}`}
                >
                    <span className="pc-pref-trigger__icon-wrap" aria-hidden>
                        <SlidersOutlined />
                    </span>
                    <span className="pc-pref-trigger__value">{value}</span>
                    <DownOutlined className="pc-pref-trigger__chev" aria-hidden />
                </button>
            </Dropdown>
        </div>
    );
}
