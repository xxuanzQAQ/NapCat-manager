import { useEffect, useState, useContext } from 'react';
import {
    Box, Typography, CircularProgress,
    Button, IconButton, useTheme, Skeleton, Pagination,
    TextField, InputAdornment, Dialog, DialogContent, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { publicApi, containerApi, type Container } from '../services/api';
import { useToast } from '../components/Toast';

interface QRState {
    // need_restart: QQ 被踢下线，容器在运行但不会推二维码，需重启
    status: 'logged_in' | 'loaded' | 'waiting' | 'need_restart' | 'error';
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
    const [restartingCards, setRestartingCards] = useState<Record<string, boolean>>({});
    const [bgUrl, setBgUrl] = useState('');
    const [qrDialogName, setQrDialogName] = useState<string | null>(null);

    // QQ号遮蔽：385***633
    const maskUin = (uin: string) => {
        const digits = uin.replace(/\D/g, '');
        if (digits.length <= 4) return digits;
        return digits.slice(0, 3) + '***' + digits.slice(-3);
    };

    // 加载背景壁纸：使用二次元随机API
    useEffect(() => {
        let cancelled = false;
        // 使用 alcy API 加载随机二次元背景
        const img = new Image();
        img.onload = () => {
            if (!cancelled) setBgUrl(img.src);
        };
        img.src = 'https://t.alcy.cc/ycy?' + Date.now();
        return () => { cancelled = true; };
    }, []);

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
            setQrCodes(prev => {
                const next = { ...prev };
                for (const c of list) {
                    if (c.status === 'running' && c.qq_logged_in && c.uin) {
                        next[c.name] = { status: 'logged_in', uin: c.uin };
                    } else if (c.status === 'running' && (c as any).kicked) {
                        // QQ 被踢下线：锁定为 need_restart，不让后续轮询覆盖
                        next[c.name] = { status: 'need_restart', uin: (c as any).uin || '' };
                    } else if (c.status !== 'running' || c.qq_logged_in === false) {
                        // 容器离线 或 容器在线但QQ未登录 → 仅当之前是 logged_in 时才覆盖
                        if (prev[c.name]?.status === 'logged_in') {
                            next[c.name] = { status: 'waiting' };
                        }
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
            } else if (data.status === 'need_restart') {
                // QQ 被踢下线：不推二维码，显示"待重启"
                setQrCodes(prev => ({ ...prev, [name]: { status: 'need_restart', uin: data.uin || '' } }));
            } else if (data.status === 'ok' && data.url) {
                const url = data.type === 'file' ? data.url
                    : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`;
                setQrCodes(prev => ({ ...prev, [name]: { status: 'loaded', url } }));
            } else {
                // 仅当当前不是 need_restart 时才降为 waiting，防止覆盖 kicked 状态
                setQrCodes(prev => {
                    if (prev[name]?.status === 'need_restart') return prev;
                    return { ...prev, [name]: { status: 'waiting' } };
                });
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
                    } else if (item.status === 'need_restart') {
                        // QQ 被踢下线：标记为待重启，不推二维码
                        next[name] = { status: 'need_restart', uin: (item as any).uin || '' };
                    } else if (item.status === 'ok' && item.url) {
                        const url = item.type === 'file' ? item.url
                            : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(item.url)}`;
                        next[name] = { status: 'loaded', url };
                    } else {
                        // waiting 只覆盖非 loaded 且非 need_restart 的情况，防止覆盖 kicked 状态
                        if (!prev[name] || (prev[name].status !== 'loaded' && prev[name].status !== 'need_restart')) {
                            next[name] = { status: 'waiting' };
                        }
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

    // 用户自助重启掉线容器（公开接口，无需管理员权限）
    const restartContainer = async (name: string, node_id = 'local') => {
        setRestartingCards(prev => ({ ...prev, [name]: true }));
        setQrCodes(prev => ({ ...prev, [name]: { status: 'waiting' } }));
        try {
            await publicApi.restartContainer(name, node_id);
            toast.success(`${name} 重启指令已发送，请稍候扫码登录`);
            setTimeout(() => fetchContainers(), 3000);
            setTimeout(() => loadQR(name, node_id), 8000);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '重启失败';
            toast.error(`重启失败：${msg}`);
        } finally {
            setRestartingCards(prev => ({ ...prev, [name]: false }));
        }
    };

    useEffect(() => {
        fetchContainers();
        let interval: ReturnType<typeof setInterval>;
        const start = () => { interval = setInterval(fetchContainers, 30000); }; // 从 15s 延长到 30s
        const stop = () => clearInterval(interval);
        const onVis = () => {
            if (document.visibilityState === 'visible') { fetchContainers(); start(); } else { stop(); }
        };
        start();
        document.addEventListener('visibilitychange', onVis);
        return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    }, []);

    useEffect(() => {
        // 有未登录的运行中容器（且非 kicked 状态）→ 批量轮询 QR 状态（10s 一次）
        // kicked 状态容器不需要轮询二维码，由 fetchContainers 感知状态变化
        const needQR = containers.filter(c => c.status === 'running' && !c.uin && !(c as any).kicked);
        if (needQR.length === 0) return;
        loadBatchQR();
        const interval = setInterval(loadBatchQR, 10000);
        return () => clearInterval(interval);
    }, [containers]);

    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{
            p: { xs: 2, md: 4, lg: 6 }, minHeight: '100vh',
            position: 'relative',
            background: isDark
                ? 'linear-gradient(135deg, #0f0f1a 0%, #1a1028 30%, #0f172a 70%, #0f0f1a 100%)'
                : 'linear-gradient(135deg, #fdf2f8 0%, #ede9fe 30%, #dbeafe 70%, #f0f9ff 100%)',
        }}>
            {/* 全屏二次元背景 */}
            {bgUrl && (
                <Box sx={{
                    position: 'fixed', inset: 0, zIndex: 0,
                    backgroundImage: `url(${bgUrl})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    opacity: isDark ? 0.2 : 0.3,
                    animation: 'bgSlideIn 1.2s ease-out',
                    '&::after': {
                        content: '""', position: 'absolute', inset: 0,
                        background: isDark
                            ? 'linear-gradient(180deg, rgba(15,15,26,0.2) 0%, rgba(15,15,26,0.5) 50%, rgba(15,15,26,0.9) 100%)'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(253,242,248,0.4) 50%, rgba(253,242,248,0.85) 100%)',
                    },
                    pointerEvents: 'none',
                }} />
            )}

            {/* 装饰性渐变光球 */}
            <Box sx={{
                position: 'fixed', top: '-15%', right: '-5%', width: '40vw', height: '40vw',
                background: 'radial-gradient(circle, rgba(255,107,157,0.12) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'fixed', bottom: '-15%', left: '-5%', width: '35vw', height: '35vw',
                background: 'radial-gradient(circle, rgba(96,165,250,0.12) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />

            <Box sx={{ maxWidth: 1100, mx: 'auto', position: 'relative', zIndex: 1 }}>

                {/* Header - 毛玻璃导航栏 */}
                <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4,
                    p: 2, px: 3,
                    background: isDark ? 'rgba(30,30,46,0.45)' : 'rgba(255,255,255,0.3)',
                    backdropFilter: 'blur(20px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.5)',
                    borderRadius: '20px',
                    boxShadow: isDark
                        ? '0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)'
                        : '0 4px 24px rgba(192,132,252,0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}>
                    <Typography variant="h5" className="acg-title" sx={{
                        fontSize: { xs: '1.1rem', sm: '1.4rem' },
                    }}>
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
                                        <SearchIcon sx={{ fontSize: 18, color: '#c084fc' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                width: { xs: 120, sm: 180 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: '14px', height: 36, fontSize: '0.85rem',
                                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)',
                                    backdropFilter: 'blur(8px)',
                                    '& fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(192,132,252,0.2)' },
                                    '&:hover fieldset': { borderColor: '#c084fc' },
                                },
                            }}
                        />
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<AdminPanelSettingsIcon />}
                            onClick={() => navigate('/login')}
                            sx={{
                                borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(192,132,252,0.3)',
                                color: isDark ? 'rgba(255,255,255,0.7)' : '#7c3aed',
                                borderRadius: '14px', height: 36, textTransform: 'none',
                                backdropFilter: 'blur(8px)',
                                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.4)',
                                '&:hover': {
                                    borderColor: '#c084fc',
                                    background: isDark ? 'rgba(192,132,252,0.1)' : 'rgba(192,132,252,0.08)',
                                    transform: 'translateY(-1px)',
                                },
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {t('user.adminLogin')}
                        </Button>
                        <IconButton onClick={toggleLanguage} aria-label="Toggle language"
                            sx={{
                                color: isDark ? 'rgba(255,255,255,0.6)' : '#7c3aed',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)',
                                borderRadius: '12px',
                                '&:hover': { background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(192,132,252,0.1)' },
                            }}>
                            <TranslateIcon />
                        </IconButton>
                        <IconButton onClick={colorMode.toggleTheme} aria-label="Toggle theme"
                            sx={{
                                color: isDark ? 'rgba(255,255,255,0.6)' : '#7c3aed',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)',
                                borderRadius: '12px',
                                '&:hover': { background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(192,132,252,0.1)' },
                            }}>
                            {isDark ? <Brightness7Icon /> : <Brightness4Icon />}
                        </IconButton>
                    </Box>
                </Box>

                {/* Cards */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2.5 }}>
                    {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={140} sx={{
                        borderRadius: '24px',
                        bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)',
                        animation: 'pulseGlow 2s ease-in-out infinite',
                    }} />)
                        : filteredContainers.length === 0 ? (
                            <Box sx={{
                                gridColumn: '1 / -1', py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center',
                                borderRadius: '24px',
                                background: isDark ? 'rgba(30,30,46,0.4)' : 'rgba(255,255,255,0.25)',
                                backdropFilter: 'blur(16px) saturate(150%)',
                                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.4)',
                            }}>
                                <CloudOffIcon sx={{ fontSize: 48, color: '#c084fc', mb: 1.5, filter: 'drop-shadow(0 0 8px rgba(192,132,252,0.4))' }} />
                                <Typography variant="body1" className="acg-title-sm" sx={{ fontSize: '1rem', mb: 0.5 }}>
                                    {searchQuery ? t('user.noSearchResults') : t('user.noBots')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}>
                                    {searchQuery ? t('user.tryDifferentSearch') : t('user.contactAdmin')}
                                </Typography>
                            </Box>
                        ) : displayedContainers.map((c, cardIdx) => {
                            const qr = qrCodes[c.name] || { status: 'loading' };
                            const isRefreshing = refreshingCards[c.name] || false;
                            const isRestarting = restartingCards[c.name] || false;
                            const isOffline = c.status !== 'running';
                            const isKicked = !isOffline && ((c as any).kicked === true || qr.status === 'need_restart');
                            const isWaitingLogin = c.status === 'running' && c.qq_logged_in === false && !isKicked;
                            const needsQR = c.status === 'running' && qr.status === 'loaded' && !isKicked;
                            const uinDigits = qr.uin ? String(qr.uin).replace(/\D/g, '') : '';

                            // 状态对应的渐变色
                            const statusGradient = isOffline
                                ? 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))'
                                : isKicked
                                    ? 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(249,115,22,0.05))'
                                    : isWaitingLogin
                                        ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))'
                                        : isDark
                                            ? 'linear-gradient(135deg, rgba(192,132,252,0.06), rgba(96,165,250,0.04))'
                                            : 'linear-gradient(135deg, rgba(255,107,157,0.04), rgba(192,132,252,0.04))';

                            const borderColor = isOffline ? 'rgba(239,68,68,0.4)'
                                : isKicked ? 'rgba(249,115,22,0.4)'
                                    : isWaitingLogin ? 'rgba(245,158,11,0.4)'
                                        : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)';

                            return (
                                <Box key={c.id} sx={{
                                    background: statusGradient,
                                    backdropFilter: 'blur(20px) saturate(150%)',
                                    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                                    borderRadius: '22px',
                                    border: `1px solid ${borderColor}`,
                                    p: 2.5, display: 'flex', flexDirection: 'row', alignItems: 'stretch',
                                    gap: 2, position: 'relative', overflow: 'hidden',
                                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                    animation: `fadeInUp 0.5s ease-out ${cardIdx * 0.05}s both`,
                                    boxShadow: isDark
                                        ? '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)'
                                        : '0 4px 20px rgba(192,132,252,0.06), inset 0 1px 0 rgba(255,255,255,0.5)',
                                    '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: isDark
                                            ? '0 16px 48px rgba(192,132,252,0.15), 0 8px 24px rgba(255,107,157,0.1), inset 0 1px 0 rgba(255,255,255,0.06)'
                                            : '0 16px 48px rgba(192,132,252,0.15), 0 8px 24px rgba(255,107,157,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
                                        borderColor: isOffline ? '#ef4444' : isKicked ? '#f97316' : isWaitingLogin ? '#f59e0b' : '#c084fc',
                                    },
                                    // 顶部渐变装饰线
                                    '&::before': {
                                        content: '""', position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px',
                                        background: isOffline
                                            ? 'linear-gradient(90deg, transparent, #ef4444, transparent)'
                                            : isKicked
                                                ? 'linear-gradient(90deg, transparent, #f97316, transparent)'
                                                : 'linear-gradient(90deg, transparent, #ff6b9d, #c084fc, #60a5fa, transparent)',
                                        opacity: 0.6, borderRadius: '2px',
                                    },
                                }}>
                                    {/* 左侧 - 信息区 */}
                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        {/* 容器名 */}
                                        <Typography variant="subtitle2" sx={{
                                            fontWeight: 800, textAlign: 'center', fontSize: '0.9rem',
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            wordBreak: 'break-all', lineHeight: 1.35, minHeight: '2.4em',
                                            color: isDark ? '#f0e6ff' : '#1f2937',
                                            textShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                                        }}>{highlight(c.name)}</Typography>
                                        {/* 头像 + QQ号 */}
                                        {qr.status === 'logged_in' && uinDigits && (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 1.5, gap: 0.5 }}>
                                                <Box component="img"
                                                    src={`https://q1.qlogo.cn/g?b=qq&nk=${uinDigits}&s=640`}
                                                    className="mask-circle"
                                                    sx={{
                                                        width: 36, height: 36, borderRadius: '50%', objectFit: 'cover',
                                                        border: '2px solid rgba(192,132,252,0.4)',
                                                        boxShadow: '0 0 12px rgba(192,132,252,0.3)',
                                                    }}
                                                />
                                                <Typography variant="caption" sx={{
                                                    color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
                                                    fontSize: '0.72rem',
                                                }}>
                                                    QQ: {maskUin(uinDigits)}
                                                </Typography>
                                            </Box>
                                        )}
                                        {/* 底部：状态 + 操作按钮 */}
                                        <Box sx={{ mt: 'auto', pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            {/* 状态标签 */}
                                            {c.status === 'running' && !isWaitingLogin && !isKicked ? (
                                                <Typography variant="caption" sx={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                                    color: '#10b981', fontWeight: 700, fontSize: '0.7rem',
                                                    textShadow: '0 0 8px rgba(16,185,129,0.4)',
                                                }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#10b981', borderRadius: '50%', boxShadow: '0 0 6px #10b981' }} /> {t('admin.online')}
                                                </Typography>
                                            ) : isKicked ? (
                                                <Typography variant="caption" sx={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                                    color: '#f97316', fontWeight: 700, fontSize: '0.7rem',
                                                }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#f97316', borderRadius: '50%', boxShadow: '0 0 6px #f97316' }} /> 待重启
                                                </Typography>
                                            ) : isWaitingLogin ? (
                                                <Typography variant="caption" sx={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                                    color: '#f59e0b', fontWeight: 700, fontSize: '0.7rem',
                                                }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#f59e0b', borderRadius: '50%', boxShadow: '0 0 6px #f59e0b' }} /> 待登录
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" sx={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 0.4,
                                                    color: '#ef4444', fontWeight: 700, fontSize: '0.7rem',
                                                }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#ef4444', borderRadius: '50%', boxShadow: '0 0 6px #ef4444' }} /> 离线
                                                </Typography>
                                            )}
                                            {/* 操作按钮区 */}
                                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                {(isOffline || isKicked || isWaitingLogin) && (
                                                    <Tooltip title={isKicked ? '重启容器以重新登录' : isWaitingLogin ? '重启容器以刷新二维码' : '重启容器'}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                disabled={isRestarting}
                                                                onClick={() => restartContainer(c.name, c.node_id)}
                                                                sx={{
                                                                    color: '#f97316', p: 0.5,
                                                                    background: 'rgba(249,115,22,0.1)',
                                                                    borderRadius: '10px',
                                                                    '&:hover': { color: '#ea580c', background: 'rgba(249,115,22,0.2)', transform: 'scale(1.1)' },
                                                                    transition: 'all 0.2s',
                                                                }}
                                                            >
                                                                {isRestarting ? <CircularProgress size={14} /> : <RestartAltIcon sx={{ fontSize: 16 }} />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {/* 运行中且有二维码时，显示放大二维码按钮 */}
                                                {needsQR && (
                                                    <Tooltip title="放大查看二维码">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => setQrDialogName(c.name)}
                                                            sx={{
                                                                color: '#c084fc', p: 0.5,
                                                                background: 'rgba(192,132,252,0.1)',
                                                                borderRadius: '10px',
                                                                '&:hover': { background: 'rgba(192,132,252,0.2)', transform: 'scale(1.1)' },
                                                                transition: 'all 0.2s',
                                                            }}
                                                        >
                                                            <QrCode2Icon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {/* 刷新按钮 */}
                                                {!isOffline && (
                                                    <Tooltip title="刷新状态">
                                                        <IconButton
                                                            size="small"
                                                            disabled={isRefreshing}
                                                            onClick={() => refreshCard(c.name, c.node_id)}
                                                            sx={{
                                                                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                                                                p: 0.5, borderRadius: '10px',
                                                                '&:hover': { background: 'rgba(192,132,252,0.1)', transform: 'scale(1.1)' },
                                                                transition: 'all 0.2s',
                                                            }}
                                                        >
                                                            {isRefreshing ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </Box>
                                    </Box>
                                    {/* 右侧 - QR / 状态区 */}
                                    <Box
                                        onClick={() => qr.status === 'loaded' && !isOffline && !isKicked ? setQrDialogName(c.name) : undefined}
                                        sx={{
                                            width: 140, minHeight: 140, borderRadius: '16px', overflow: 'hidden',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexDirection: 'column', gap: 1, flexShrink: 0,
                                            background: isDark ? 'rgba(15,15,26,0.5)' : 'rgba(255,255,255,0.4)',
                                            backdropFilter: 'blur(8px)',
                                            border: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.3)',
                                            cursor: (qr.status === 'loaded' && !isOffline && !isKicked) ? 'pointer' : 'default',
                                            transition: 'all 0.3s ease',
                                            '&:hover': (qr.status === 'loaded' && !isOffline && !isKicked) ? {
                                                transform: 'scale(1.04)',
                                                boxShadow: '0 0 20px rgba(192,132,252,0.2)',
                                            } : {},
                                        }}
                                    >
                                        {isOffline ? (
                                            <>
                                                <CloudOffIcon sx={{ color: '#ef4444', fontSize: 32, filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.4))' }} />
                                                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', px: 1 }}>
                                                    已离线
                                                </Typography>
                                                <Button
                                                    size="small" variant="contained"
                                                    disabled={isRestarting}
                                                    onClick={() => restartContainer(c.name, c.node_id)}
                                                    startIcon={isRestarting ? <CircularProgress size={10} color="inherit" /> : <RestartAltIcon sx={{ fontSize: 13 }} />}
                                                    sx={{
                                                        fontSize: '0.65rem', py: 0.3, px: 1, minWidth: 0,
                                                        background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                                        '&:hover': { background: 'linear-gradient(135deg, #ea580c, #dc2626)' },
                                                        borderRadius: '10px', textTransform: 'none',
                                                        boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
                                                    }}
                                                >
                                                    {isRestarting ? '重启中...' : '重启'}
                                                </Button>
                                            </>
                                        ) : isKicked ? (
                                            <>
                                                <RestartAltIcon sx={{ color: '#f97316', fontSize: 32, filter: 'drop-shadow(0 0 6px rgba(249,115,22,0.4))' }} />
                                                <Typography variant="caption" sx={{ color: '#ea580c', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', px: 1 }}>
                                                    QQ 已掉线
                                                </Typography>
                                                <Button
                                                    size="small" variant="contained"
                                                    disabled={isRestarting}
                                                    onClick={() => restartContainer(c.name, c.node_id)}
                                                    startIcon={isRestarting ? <CircularProgress size={10} color="inherit" /> : <RestartAltIcon sx={{ fontSize: 13 }} />}
                                                    sx={{
                                                        fontSize: '0.65rem', py: 0.3, px: 1, minWidth: 0,
                                                        background: 'linear-gradient(135deg, #f97316, #ef4444)',
                                                        '&:hover': { background: 'linear-gradient(135deg, #ea580c, #dc2626)' },
                                                        borderRadius: '10px', textTransform: 'none',
                                                        boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
                                                    }}
                                                >
                                                    {isRestarting ? '重启中...' : '重启'}
                                                </Button>
                                            </>
                                        ) : qr.status === 'loaded' ? (
                                            <img src={qr.url} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                                        ) : qr.status === 'logged_in' ? (
                                            <Typography variant="caption" sx={{
                                                color: '#10b981', fontWeight: 700, fontSize: '0.75rem',
                                                textShadow: '0 0 8px rgba(16,185,129,0.4)',
                                            }}>{t('user.loggedIn')}</Typography>
                                        ) : qr.status === 'waiting' || qr.status === 'loading' ? (
                                            <>
                                                <CircularProgress size={24} sx={{ color: '#c084fc' }} />
                                                <Typography variant="caption" sx={{
                                                    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                                                    fontSize: '0.65rem', textAlign: 'center', px: 1,
                                                }}>
                                                    等待二维码...
                                                </Typography>
                                            </>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: '#ef4444', fontSize: '0.7rem' }}>{t('user.loadFailed')}</Typography>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })}
                </Box>

                {totalPages > 1 && (
                    <Box sx={{
                        display: 'flex', justifyContent: 'center', mt: 4,
                        '& .MuiPagination-root': {
                            '& .MuiPaginationItem-root': {
                                borderRadius: '12px',
                                backdropFilter: 'blur(8px)',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)',
                                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.4)',
                                color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                                '&.Mui-selected': {
                                    background: 'linear-gradient(135deg, #ff6b9d, #c084fc)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    boxShadow: '0 2px 8px rgba(192,132,252,0.3)',
                                },
                            },
                        },
                    }}>
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

            {/* QR 放大弹窗 - 毛玻璃风格 */}
            <Dialog
                open={!!qrDialogName}
                onClose={() => setQrDialogName(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '28px', backgroundImage: 'none',
                        background: isDark ? 'rgba(30,30,46,0.8)' : 'rgba(255,255,255,0.6)',
                        backdropFilter: 'blur(24px) saturate(150%)',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.5)',
                        boxShadow: isDark
                            ? '0 24px 64px rgba(0,0,0,0.5)'
                            : '0 24px 64px rgba(192,132,252,0.15)',
                    }
                }}
            >
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4 }}>
                    {qrDialogName && (() => {
                        const qr = qrCodes[qrDialogName];
                        const container = containers.find(c => c.name === qrDialogName);
                        if (!qr || qr.status !== 'loaded') return null;
                        return (
                            <>
                                <Typography variant="h6" className="acg-title-sm" sx={{
                                    fontWeight: 800, mb: 2, textAlign: 'center', fontSize: '1.1rem',
                                }}>
                                    {container?.name || qrDialogName}
                                </Typography>
                                <Box sx={{
                                    width: 280, height: 280, borderRadius: '20px', overflow: 'hidden',
                                    bgcolor: '#fff', p: 1.5,
                                    border: '2px solid rgba(192,132,252,0.2)',
                                    boxShadow: '0 0 20px rgba(192,132,252,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <img src={qr.url} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '12px' }} />
                                </Box>
                                <Typography variant="body2" sx={{
                                    mt: 2, textAlign: 'center',
                                    color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
                                }}>
                                    {t('user.scanToLogin')}
                                </Typography>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
