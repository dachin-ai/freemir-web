import React from 'react';
import { Typography } from 'antd';

const { Text, Title } = Typography;

/**
 * Shared header + filter + action layout for Saved Videos / Saved Creators lists.
 */
export default function SmaSavedListToolbar({ title, hint, filters, actions }) {
    return (
        <div className="sma-saved-list-toolbar-wrap">
            <div className="sma-saved-list-header">
                <Title level={5} className="sma-saved-list-title">{title}</Title>
            </div>
            {(filters || actions) && (
                <div className="sma-saved-list-controls">
                    {filters && (
                        <div className="sma-saved-list-filters">{filters}</div>
                    )}
                    {actions && (
                        <div className="sma-saved-list-actions">{actions}</div>
                    )}
                </div>
            )}
            {hint && (
                <Text type="secondary" className="sma-saved-list-hint">{hint}</Text>
            )}
        </div>
    );
}
