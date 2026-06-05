import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'fm_token';
const USER_KEY = 'fm_user';
const LOGIN_DATE_KEY = 'fm_login_date';

function getTodayStr() {
    return new Date().toISOString().split('T')[0]; // "2026-04-09"
}

function normalizePermissions(rawPermissions) {
    if (!rawPermissions) return {};
    if (typeof rawPermissions === 'object') return rawPermissions;
    if (typeof rawPermissions === 'string') {
        try {
            const parsed = JSON.parse(rawPermissions);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);         // { username, email }
    const [loading, setLoading] = useState(true);   // initial check

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LOGIN_DATE_KEY);
        setUser(null);
    }, []);

    // On mount: restore cached user quickly and verify token in background.
    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEY);
        const cachedUserRaw = localStorage.getItem(USER_KEY);

        if (!token) {
            setLoading(false);
            return;
        }

        let cachedUser = null;
        if (cachedUserRaw) {
            try {
                cachedUser = JSON.parse(cachedUserRaw);
            } catch {
                cachedUser = null;
            }
        }

        if (cachedUser?.username) {
            setUser(cachedUser);
            setLoading(false);
        }

        // Verify token with backend (short timeout to avoid long spinner)
        api.post('/auth/verify', {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 })
            .then(res => {
                const verifiedUser = {
                    username: res.data.username,
                    name: res.data.name || res.data.username,
                    email: res.data.email,
                    permissions: normalizePermissions(res.data.permissions),
                };
                localStorage.setItem(USER_KEY, JSON.stringify(verifiedUser));
                localStorage.setItem(LOGIN_DATE_KEY, getTodayStr());
                setUser(verifiedUser);
            })
            .catch(() => {
                logout();
            })
            .finally(() => {
                if (!cachedUser?.username) {
                    setLoading(false);
                }
            });
    }, [logout]);

    const login = useCallback(async (username, password) => {
        const res = await api.post('/auth/login', { username, password });
        const { token } = res.data;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(LOGIN_DATE_KEY, getTodayStr());

        // Preferred: login response includes user payload.
        // Fallback: call verify for backward compatibility with older backend.
        let userData;
        if (res.data?.username) {
            userData = {
                username: res.data.username,
                name: res.data.name || res.data.username,
                email: res.data.email || '',
                permissions: normalizePermissions(res.data.permissions),
            };
        } else {
            const verify = await api.post('/auth/verify', {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
            userData = {
                username: verify.data.username,
                name: verify.data.name || verify.data.username,
                email: verify.data.email,
                permissions: normalizePermissions(verify.data.permissions),
            };
        }
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
        setUser(userData);
        return userData;
    }, []);

    const hasAccess = useCallback((toolKey) => {
        if (!user || !user.permissions) return false;

        const perms = normalizePermissions(user.permissions);
        const toBool = (value) => {
            if (value === 1 || value === true) return true;
            if (typeof value === 'string') {
                return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
            }
            return false;
        };

        // Admin users can access all tools.
        if (toBool(perms.admin)) return true;

        return toBool(perms[toolKey]);
    }, [user]);

    const signup = useCallback(async (email, username, password) => {
        const res = await api.post('/auth/signup', { email, username, password });
        return res.data.message;
    }, []);

    const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), []);

    const logActivity = useCallback(async (toolName) => {
        const token = getToken();
        if (!token || !user) {
            console.warn('[Activity Log] ⚠️ Skipped - no token or user:', { hasToken: !!token, hasUser: !!user });
            return;
        }
        try {
            console.log('[Activity Log] 📤 Sending log for:', toolName);
            const res = await api.post(
                '/auth/log-activity',
                { tool_name: toolName, token },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('[Activity Log] ✅ Recorded:', toolName, res.data);
        } catch (err) {
            console.error('[Activity Log] ❌ Failed:', err.response?.status, err.response?.data || err.message);
        }
    }, [user, getToken]);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, signup, logActivity, getToken, hasAccess }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
