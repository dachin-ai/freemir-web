import React from 'react';
import { Select } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useLang } from '../context/LangContext';

/** UI language: 中文 (default), English, Indonesia */
export default function LanguageSelect({ style, size = 'middle' }) {
  const { lang, setLanguage } = useLang();
  return (
    <Select
      value={lang}
      onChange={setLanguage}
      size={size}
      suffixIcon={<GlobalOutlined />}
      rootClassName="fm-lang-select"
      style={{ width: 118, ...style }}
      options={[
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
        { value: 'id', label: 'Indonesia' },
      ]}
      popupMatchSelectWidth={false}
    />
  );
}
