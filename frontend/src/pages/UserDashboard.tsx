import { useEffect, useState, useContext } from 'react';
import {
    Box, Typography, CircularProgress,
    Button, IconButton, useTheme, Skeleton, Pagination,
    TextField, InputAdornment
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SearchIcon from '@mui/icons-material/Search';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { publicApi, containerApi, type Container } from '../services/api';
import { useToast } from '../components/Toast';

interface QRState {
    status: 'logged_in' | 'loaded' | 'waiting' | 'error';
    url?: string;
    uin?: string;
}

export default function UserDashboard() {
    const navigate = useNavigate();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const toast = useToast();
    const t = useTranslate();

    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [qrCodes, setQrCodes] = useState<Record<string, QRState>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshingCards, setRefreshingCards] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const rowsPerPage = 12;
    const filteredContainers = containers.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q)
            || (c.uin && c.uin.toLowerCase().includes(q))
            || c.status.toLowerCase().includes(q);
    });
    const totalPages = Math.ceil(filteredContainers.length / rowsPerPage);
    const displayedContainers = filteredContainers.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    // 搜索高亮
    const highlight = (text: string) => {
        const q = searchQuery.trim();
        if (!q) return text;
        const idx = text.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return text;
        return <>{text.slice(0, idx)}<Box component="span" sx={{ bgcolor: '#fef08a', color: '#000', borderRadius: 0.5, px: 0.25 }}>{text.slice(idx, idx + q.length)}</Box>{text.slice(idx + q.length)}</>;
    };

    const fetchContainers = async () => {
        try {
            let list: Container[] = [];
            try {
                const data = await publicApi.containers();
                list = data.containers || [];
            } catch {
                // 公开接口异常时回退到管理接口（已登录管理员可用）
                const data = await containerApi.list();
                list = data.containers || [];
            }

            setContainers(list);
            // 接口已返回 uin，直接设置已登录容器的 QR 状态
            setQrCodes(prev => {
                const next = { ...prev };
                for (const c of list) {
                    if (c.uin) {
                        next[c.name] = { status: 'logged_in', uin: c.uin };
                    }
                }
                return next;
            });
        } catch (e) {
            toast.error('获取实例列表失败');
        } finally {
            setLoading(false);
        }
    };

    // 单容器 QR 加载（仅用于 refreshCard 单卡刷新，保留独立请求）
    const loadQR = async (name: string, node_id = 'local') => {
        try {
            const data = await publicApi.getQR(name, node_id);
            if (data.status === 'logged_in') {
                setQrCodes(prev => ({ ...prev, [name]: { status: 'logged_in', uin: data.uin } }));
                fetchContainers();
            } else if (data.status === 'ok' && data.url) {
                const url = data.type === 'file' ? data.url
                    : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`;
                setQrCodes(prev => ({ ...prev, [name]: { status: 'loaded', url } }));
            } else {
                setQrCodes(prev => ({ ...prev, [name]: { status: 'waiting' } }));
            }
        } catch {
            setQrCodes(prev => ({ ...prev, [name]: { status: 'error' } }));
        }
    };

    // 批量获取所有容器 QR 状态（一次请求替代 N 个独立请求，60+ 实例不卡顿）
    const loadBatchQR = async () => {
        try {
            const data = await publicApi.batchQR();
            if (data.status !== 'ok' || !data.items) return;
            let hasNewLogin = false;
            setQrCodes(prev => {
                const next = { ...prev };
                for (const [name, item] of Object.entries(data.items)) {
                    if (item.status === 'logged_in') {
                        next[name] = { status: 'logged_in', uin: item.uin };
                        if (!prev[name] || prev[name].status !== 'logged_in') {
                            hasNewLogin = true;
                        }
                    } else if (item.status === 'ok' && item.url) {
                        const url = item.type === 'file' ? item.url
                            : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(item.url)}`;
                        next[name] = { status: 'loaded', url };
                    } else {
                        next[name] = { status: 'waiting' };
                    }
                }
                return next;
            });
            // 有新登录 → 刷新容器列表以获取 uin，停止该容器的后续 QR 检查
            if (hasNewLogin) fetchContainers();
        } catch {
            // 批量接口失败时静默，下次轮询重试
        }
    };

    // 单卡片刷新：独立请求该容器的 QR + 刷新容器状态
    const refreshCard = async (name: string, node_id = 'local') => {
        setRefreshingCards(prev => ({ ...prev, [name]: true }));
        try {
            await loadQR(name, node_id);
            await fetchContainers();
        } finally {
            setRefreshingCards(prev => ({ ...prev, [name]: false }));
        }
    };

    useEffect(() => {
        fetchContainers();
        let interval: ReturnType<typeof setInterval>;
        const start = () => { interval = setInterval(fetchContainers, 15000); };
        const stop = () => clearInterval(interval);
        const onVis = () => {
            if (document.visibilityState === 'visible') { fetchContainers(); start(); } else { stop(); }
        };
        start();
        document.addEventListener('visibilitychange', onVis);
        return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    }, []);

    useEffect(() => {
        // 有未登录的运行中容器 → 批量轮询 QR 状态（5s，单次请求覆盖所有容器）
        const needQR = containers.filter(c => c.status === 'running' && !c.uin);
        if (needQR.length === 0) return;
        loadBatchQR();
        const interval = setInterval(loadBatchQR, 5000);
        return () => clearInterval(interval);
    }, [containers]);

    return (
        <Box sx={{
            p: { xs: 2, md: 4, lg: 6 }, minHeight: '100vh', bgcolor: 'background.default'
        }}>
            <Box sx={{ maxWidth: 1100, mx: 'auto' }}>

                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {t('user.title')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            size="small"
                            placeholder={t('user.searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                width: { xs: 140, sm: 200 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    height: 36,
                                    fontSize: '0.85rem',
                                },
                            }}
                        />
                        <Button
                            variant="outlined"
                            color="inherit"
                            size="small"
                            startIcon={<AdminPanelSettingsIcon />}
                            onClick={() => navigate('/login')}
                            sx={{ borderColor: 'divider', color: 'text.secondary', borderRadius: 2, height: 36, textTransform: 'none' }}
                        >
                            {t('user.adminLogin')}
                        </Button>
                        <IconButton onClick={toggleLanguage} aria-label="Toggle language">
                            <TranslateIcon />
                        </IconButton>
                        <IconButton onClick={colorMode.toggleTheme} aria-label="Toggle theme">
                            {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                        </IconButton>
                    </Box>
                </Box>

                {/* Cards */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
                    {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 3, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)' }} />)
                        : filteredContainers.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
                                <CloudOffIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1.5 }} />
                                <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>{searchQuery ? t('user.noSearchResults') : t('user.noBots')}</Typography>
                                <Typography variant="body2" color="text.secondary">{searchQuery ? t('user.tryDifferentSearch') : t('user.contactAdmin')}</Typography>
                            </Box>
                        ) : displayedContainers.map(c => {
                            const qr = qrCodes[c.name] || { status: 'loading' };
                            const isRefreshing = refreshingCards[c.name] || false;
                            return (
                                <Box key={c.id} sx={{
                                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#fff',
                                    borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                                    p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    transition: 'all 0.2s',
                                    '&:hover': { borderColor: theme.palette.primary.main, boxShadow: `0 0 0 1px ${theme.palette.primary.main}22` }
                                }}>
                                    {/* QR / Status */}
                                    <Box sx={{ width: 120, height: 120, borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc', mb: 1.5 }}>
                                        {c.status !== 'running' ? (
                                            <CloudOffIcon sx={{ color: '#94a3b8', fontSize: 36 }} />
                                        ) : qr.status === 'loaded' ? (
                                            <img src={qr.url} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : qr.status === 'logged_in' ? (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <Box component="img" src={qr.uin ? `https://q1.qlogo.cn/g?b=qq&nk=${String(qr.uin).replace(/\D/g, '')}&s=640` : "https://napneko.github.io/assets/newnewlogo.png"} sx={{ width: 40, height: 40, borderRadius: '50%', mb: 0.5, border: '2px solid #10b981', bgcolor: '#fff' }} />
                                                <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600, fontSize: '0.7rem' }}>{t('user.loggedIn')}</Typography>
                                            </Box>
                                        ) : qr.status === 'waiting' || qr.status === 'loading' ? (
                                            <CircularProgress size={28} sx={{ color: '#94a3b8' }} />
                                        ) : (
                                            <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>{t('user.loadFailed')}</Typography>
                                        )}
                                    </Box>

                                    {/* Name + Status */}
                                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(c.name)}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        {c.status === 'running' ? (
                                            <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#059669', fontWeight: 600, fontSize: '0.7rem' }}>
                                                <Box sx={{ width: 5, height: 5, bgcolor: '#10b981', borderRadius: '50%' }} /> {t('admin.online')}
                                            </Typography>
                                        ) : (
                                            <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem' }}>
                                                <Box sx={{ width: 5, height: 5, bgcolor: '#94a3b8', borderRadius: '50%' }} /> {c.status.toUpperCase()}
                                            </Typography>
                                        )}
                                    </Box>
                                    {qr.status === 'logged_in' && qr.uin && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>QQ: {String(qr.uin).replace(/\D/g, '')}</Typography>
                                    )}

                                    {/* Refresh */}
                                    <IconButton
                                        size="small"
                                        disabled={isRefreshing}
                                        onClick={() => refreshCard(c.name, c.node_id)}
                                        sx={{ mt: 0.5, color: 'text.secondary' }}
                                    >
                                        {isRefreshing ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
                                    </IconButton>
                                </Box>
                            );
                        })}
                </Box>

                {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(e, value) => setPage(value)}
                            color="primary"
                            shape="rounded"
                        />
                    </Box>
                )}

            </Box>
        </Box>
    );
}
