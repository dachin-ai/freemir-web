import React from 'react';
import { Typography, Button } from 'antd';
import { LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

/**
 * PermissionGate — wraps a tool page and checks if the user has access.
 * 
 * Props:
 *   toolKey  — permission key (e.g., "price_checker")
 *   children — the tool page component
 */
const PermissionGate = ({ toolKey, children }) => {
    const { hasAccess } = useAuth();
    const navigate = useNavigate();

    if (hasAccess(toolKey)) {
        return children;
    }

    return (
        <div style={{
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
        }}>
            <div style={{
                maxWidth: 480,
                textAlign: 'center',
                padding: '48px 40px',
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8))',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 20,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 60px rgba(239, 68, 68, 0.03)',
                backdropFilter: 'blur(12px)',
            }}>
                {/* Lock Icon with Glow */}
                <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1))',
                    border: '2px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px auto',
                    boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)',
                    animation: 'lockPulse 2s ease-in-out infinite',
                }}>
                    <LockOutlined style={{ fontSize: 36, color: '#f87171' }} />
                </div>

                <Title level={3} style={{
                    color: '#f1f5f9',
                    margin: '0 0 12px 0',
                    fontWeight: 800,
                    letterSpacing: '-0.5px',
                }}>
                    Access Restricted
                </Title>

                <Text style={{
                    color: '#94a3b8',
                    fontSize: 15,
                    lineHeight: '1.6',
                    display: 'block',
                    marginBottom: 32,
                }}>
                    You don't have permission to access this tool.
                    <br />
                    Please contact your administrator to request access.
                </Text>

                <Button
                    type="primary"
                    icon={<ArrowLeftOutlined />}
                    size="large"
                    onClick={() => navigate('/tools')} 
                    style={{
                        borderRadius: 12,
                        height: 44,
                        fontWeight: 600,
                        fontSize: 14,
                    }}
                >
                    Back to Dashboard
                </Button>
            </div>

            {/* CSS Keyframe for pulse animation */}
            <style>{`
                @keyframes lockPulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.1); }
                    50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.25); }
                }
            `}</style>
        </div>
    );
};

export default PermissionGate;
