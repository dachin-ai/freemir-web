import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Single-language UI string from i18n (中文 default / English / Bahasa Indonesia).
 * Use `i18nKey` dot path, e.g. layout.lobby — optional `values` for interpolation.
 */
export const Bi = ({ i18nKey, values, style, className, block }) => {
  const { t } = useTranslation();
  if (!i18nKey) return null;
  const text = t(i18nKey, values);
  if (block) {
    return (
      <span className={className} style={style}>
        <span style={{ display: 'block', lineHeight: 1.3 }}>{text}</span>
      </span>
    );
  }
  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
};

export default Bi;
