import React, { useState, useRef, useEffect } from 'react';
import { Button, Card, Input, Spin, Typography, Avatar } from 'antd';
import { MessageOutlined, CloseOutlined, SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { askAssistant } from '../api';

const { Text } = Typography;

const renderMessageContent = (text) => {
    if (!text) return null;

    const withMarkdownLinks = [];
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIdx = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
        if (match.index > lastIdx) {
            withMarkdownLinks.push({ type: 'text', value: text.slice(lastIdx, match.index) });
        }
        withMarkdownLinks.push({ type: 'link', label: match[1], href: match[2] });
        lastIdx = linkRegex.lastIndex;
    }
    if (lastIdx < text.length) {
        withMarkdownLinks.push({ type: 'text', value: text.slice(lastIdx) });
    }

    const nodes = [];
    const inlineRegex = /(\*\*[^*]+\*\*|__[^_]+__|https?:\/\/\S+)/g;
    let idx = 0;

    withMarkdownLinks.forEach((chunk) => {
        if (chunk.type === 'link') {
            nodes.push(
                <a
                    key={`lk-${idx++}`}
                    href={chunk.href}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#93c5fd', textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                    {chunk.label}
                </a>
            );
            return;
        }

        const value = chunk.value;
        let last = 0;
        let m;
        while ((m = inlineRegex.exec(value)) !== null) {
            if (m.index > last) {
                nodes.push(<React.Fragment key={`tx-${idx++}`}>{value.slice(last, m.index)}</React.Fragment>);
            }
            const token = m[0];
            if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
                const clean = token.slice(2, -2);
                nodes.push(
                    <span key={`ul-${idx++}`} style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
                        {clean}
                    </span>
                );
            } else if (token.startsWith('http://') || token.startsWith('https://')) {
                nodes.push(
                    <a
                        key={`ur-${idx++}`}
                        href={token}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#93c5fd', textDecoration: 'underline', wordBreak: 'break-all' }}
                    >
                        {token}
                    </a>
                );
            }
            last = inlineRegex.lastIndex;
        }
        if (last < value.length) {
            nodes.push(<React.Fragment key={`tx-${idx++}`}>{value.slice(last)}</React.Fragment>);
        }
    });

    return nodes;
};

const AiAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'model', text: 'Hello! I am freemir AI. How can I help you with Price Checking or tool guidance today?' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMsg = { role: 'user', text: inputValue };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const res = await askAssistant(newMessages);
            if (res.data && res.data.response) {
                setMessages([...newMessages, { role: 'model', text: res.data.response }]);
            }
        } catch (error) {
            console.error("Chat Error:", error);
            const detail =
                error?.response?.data?.detail ||
                error?.message ||
                'Maaf, sistem AI sedang mengalami gangguan koneksi.';
            setMessages([...newMessages, { role: 'model', text: `Maaf, chat belum bisa diproses. Detail: ${detail}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <>
            {/* FLOATING BUTTON */}
            {!isOpen && (
                <Button
                    type="primary"
                    shape="circle"
                    size="large"
                    icon={<MessageOutlined style={{ fontSize: 24 }} />}
                    style={{
                        position: 'fixed',
                        bottom: 30,
                        right: 30,
                        width: 60,
                        height: 60,
                        boxShadow: '0 4px 12px rgba(56, 189, 248, 0.4)',
                        zIndex: 9999,
                        background: 'var(--fm-gradient)',
                        border: 'none',
                    }}
                    onClick={() => setIsOpen(true)}
                />
            )}

            {/* CHAT WINDOW */}
            {isOpen && (
                <Card
                    style={{
                        position: 'fixed',
                        bottom: 30,
                        right: 30,
                        width: 380,
                        height: 550,
                        zIndex: 10000,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 16,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        border: '1px solid var(--border)',
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(10px)',
                    }}
                    bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                    {/* HEADER */}
                    <div style={{
                        padding: '16px 20px',
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(14, 165, 233, 0.08))',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar size="small" icon={<RobotOutlined />} style={{ backgroundColor: '#38bdf8' }} />
                            <Text style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 16 }}>freemir AI</Text>
                        </div>
                        <Button
                            type="text"
                            icon={<CloseOutlined style={{ color: '#94a3b8' }} />}
                            onClick={() => setIsOpen(false)}
                            style={{ padding: 4 }}
                        />
                    </div>

                    {/* MESSAGES AREA */}
                    <div style={{
                        flexGrow: 1,
                        overflowY: 'auto',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16
                    }}>
                        {messages.map((m, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '80%',
                                    padding: '10px 14px',
                                    borderRadius: m.role === 'user' ? '16px 16px 0 16px' : '16px 16px 16px 0',
                                    background: m.role === 'user' ? '#3b82f6' : 'rgba(30, 41, 59, 0.8)',
                                    color: m.role === 'user' ? '#fff' : '#e2e8f0',
                                    border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)',
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                    overflowWrap: 'anywhere',
                                    wordBreak: 'break-word',
                                }}>
                                    {renderMessageContent(m.text)}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '16px 16px 16px 0',
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <Spin size="small" /> <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 12 }}>Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* INPUT AREA */}
                    <div style={{
                        padding: 16,
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                    }}>
                        <Input
                            placeholder="Ask me about SKUs or tools..."
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            style={{
                                borderRadius: 20,
                                background: 'rgba(15, 23, 42, 0.5)',
                                color: '#fff',
                                borderColor: 'var(--border)'
                            }}
                            bordered={false}
                        />
                        <Button
                            type="primary"
                            shape="circle"
                            icon={<SendOutlined />}
                            onClick={handleSend}
                            disabled={isLoading || !inputValue.trim()}
                            style={{ background: '#3b82f6' }}
                        />
                    </div>
                </Card>
            )}
        </>
    );
};

export default AiAssistant;
