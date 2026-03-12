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

    // 加载背景壁纸：根据窗口方向选择横图/竖图
    useEffect(() => {
        let cancelled = false;
        // 每个方向只随机选一次，resize 时仅切换方向不重新随机
        let picked: { landscape: string; portrait: string } | null = null;

        const pick = (list: string[]) => list.length ? list[Math.floor(Math.random() * list.length)] : '';

        const applyOrientation = () => {
            if (!picked) return;
            const isLandscape = window.innerWidth >= window.innerHeight;
            const url = isLandscape
                ? (picked.landscape || picked.portrait)
                : (picked.portrait || picked.landscape);
            if (url) setBgUrl(url);
        };

        (async () => {
            try {
                const res = await fetch('/api/resource/wallpapers?category=user-dashboard');
                const json = await res.json();
                if (cancelled || json.status !== 'ok') return;
                picked = {
                    landscape: pick(json.landscape || []),
                    portrait: pick(json.portrait || []),
                };
                applyOrientation();
            } catch { /* ignore */ }
        })();

        const onResize = () => applyOrientation();
        window.addEventListener('resize', onResize);
        return () => { cancelled = true; window.removeEventListener('resize', onResize); };
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

    return (
        <Box sx={{
            p: { xs: 2, md: 4, lg: 6 }, minHeight: '100vh',
            bgcolor: 'background.default',
            position: 'relative',
            '&::before': bgUrl ? {
                content: '""', position: 'fixed', inset: 0, zIndex: 0,
                backgroundImage: `url(${bgUrl})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                opacity: theme.palette.mode === 'dark' ? 0.15 : 0.2,
                pointerEvents: 'none',
            } : {},
        }}>
            <Box sx={{ maxWidth: 1100, mx: 'auto', position: 'relative', zIndex: 1 }}>

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
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
                    {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 3, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)' }} />)
                        : filteredContainers.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
                                <CloudOffIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1.5 }} />
                                <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>{searchQuery ? t('user.noSearchResults') : t('user.noBots')}</Typography>
                                <Typography variant="body2" color="text.secondary">{searchQuery ? t('user.tryDifferentSearch') : t('user.contactAdmin')}</Typography>
                            </Box>
                        ) : displayedContainers.map(c => {
                            const qr = qrCodes[c.name] || { status: 'loading' };
                            const isRefreshing = refreshingCards[c.name] || false;
                            const isRestarting = restartingCards[c.name] || false;
                            const isOffline = c.status !== 'running';
                            // QQ 被踢下线（容器运行中但QQ掉线，不会推二维码，需重启）
                            const isKicked = !isOffline && ((c as any).kicked === true || qr.status === 'need_restart');
                            // 容器在线但QQ未登录（真正待扫码，非 kicked 状态）
                            const isWaitingLogin = c.status === 'running' && c.qq_logged_in === false && !isKicked;
                            const needsQR = c.status === 'running' && qr.status === 'loaded' && !isKicked;
                            const uinDigits = qr.uin ? String(qr.uin).replace(/\D/g, '') : '';
                            return (
                                <Box key={c.id} sx={{
                                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
                                    backdropFilter: 'blur(12px)',
                                    borderRadius: 3,
                                    border: `1px solid ${isOffline ? '#f87171' : isKicked ? '#f97316' : isWaitingLogin ? '#f59e0b' : theme.palette.divider}`,
                                    p: 2, display: 'flex', flexDirection: 'row', alignItems: 'stretch',
                                    transition: 'all 0.2s', gap: 1.5,
                                    '&:hover': { borderColor: isOffline ? '#ef4444' : isKicked ? '#ea580c' : isWaitingLogin ? '#d97706' : theme.palette.primary.main, boxShadow: `0 0 0 1px ${isOffline ? '#ef444422' : isKicked ? '#f9731622' : isWaitingLogin ? '#f59e0b22' : theme.palette.primary.main + '22'}` }
                                }}>
                                    {/* 左侧 - 信息区 */}
                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        {/* 容器名（居中，最多两行自动换行） */}
                                        <Typography variant="subtitle2" sx={{
                                            fontWeight: 700, textAlign: 'center', fontSize: '0.88rem',
                                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            wordBreak: 'break-all', lineHeight: 1.35, minHeight: '2.4em',
                                        }}>{highlight(c.name)}</Typography>
                                        {/* 头像 + QQ号（仅已登录才显示，居中） */}
                                        {qr.status === 'logged_in' && uinDigits && (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 1, gap: 0.5 }}>
                                                <Box component="img"
                                                    src={`https://q1.qlogo.cn/g?b=qq&nk=${uinDigits}&s=640`}
                                                    sx={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                                                />
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                                                    QQ: {maskUin(uinDigits)}
                                                </Typography>
                                            </Box>
                                        )}
                                        {/* 底部：状态 + 操作按钮，两端对齐 */}
                                        <Box sx={{ mt: 'auto', pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            {/* 状态标签：四态 - 在线 / 待重启(kicked) / 待登录 / 离线 */}
                                            {c.status === 'running' && !isWaitingLogin && !isKicked ? (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#059669', fontWeight: 600, fontSize: '0.7rem' }}>
                                                    <Box sx={{ width: 5, height: 5, bgcolor: '#10b981', borderRadius: '50%' }} /> {t('admin.online')}
                                                </Typography>
                                            ) : isKicked ? (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#ea580c', fontWeight: 700, fontSize: '0.7rem' }}>
                                                    <Box sx={{ width: 5, height: 5, bgcolor: '#f97316', borderRadius: '50%' }} /> 待重启
                                                </Typography>
                                            ) : isWaitingLogin ? (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#d97706', fontWeight: 700, fontSize: '0.7rem' }}>
                                                    <Box sx={{ width: 5, height: 5, bgcolor: '#f59e0b', borderRadius: '50%' }} /> 待登录
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: '#ef4444', fontWeight: 700, fontSize: '0.7rem' }}>
                                                    <Box sx={{ width: 5, height: 5, bgcolor: '#ef4444', borderRadius: '50%' }} /> 离线
                                                </Typography>
                                            )}
                                            {/* 操作按钮区 */}
                                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                                {/* 掉线、被踢下线或待扫码时显示重启按钮 */}
                                                {(isOffline || isKicked || isWaitingLogin) && (
                                                    <Tooltip title={isKicked ? '重启容器以重新登录' : isWaitingLogin ? '重启容器以刷新二维码' : '重启容器'}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                disabled={isRestarting}
                                                                onClick={() => restartContainer(c.name, c.node_id)}
                                                                sx={{ color: '#f97316', p: 0.5, '&:hover': { color: '#ea580c' } }}
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
                                                            sx={{ color: '#6366f1', p: 0.5 }}
                                                        >
                                                            <QrCode2Icon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {/* 刷新按钮（仅运行中容器） */}
                                                {!isOffline && (
                                                    <Tooltip title="刷新状态">
                                                        <IconButton
                                                            size="small"
                                                            disabled={isRefreshing}
                                                            onClick={() => refreshCard(c.name, c.node_id)}
                                                            sx={{ color: 'text.secondary', p: 0.5 }}
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
                                            width: 140, minHeight: 140, borderRadius: 2, overflow: 'hidden',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexDirection: 'column', gap: 1, flexShrink: 0,
                                            bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc',
                                            cursor: (qr.status === 'loaded' && !isOffline && !isKicked) ? 'pointer' : 'default',
                                            transition: 'transform 0.15s',
                                            '&:hover': (qr.status === 'loaded' && !isOffline && !isKicked) ? { transform: 'scale(1.04)' } : {},
                                        }}
                                    >
                                        {isOffline ? (
                                            // 离线：显示图标 + 文字 + 重启提示
                                            <>
                                                <CloudOffIcon sx={{ color: '#ef4444', fontSize: 32 }} />
                                                <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', px: 1 }}>
                                                    已离线
                                                </Typography>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    disabled={isRestarting}
                                                    onClick={() => restartContainer(c.name, c.node_id)}
                                                    startIcon={isRestarting ? <CircularProgress size={10} color="inherit" /> : <RestartAltIcon sx={{ fontSize: 13 }} />}
                                                    sx={{
                                                        fontSize: '0.65rem', py: 0.3, px: 1, minWidth: 0,
                                                        bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' },
                                                        borderRadius: 1.5, textTransform: 'none',
                                                    }}
                                                >
                                                    {isRestarting ? '重启中...' : '重启'}
                                                </Button>
                                            </>
                                        ) : isKicked ? (
                                            // QQ 被踢下线：不推二维码，显示重启提示
                                            <>
                                                <RestartAltIcon sx={{ color: '#f97316', fontSize: 32 }} />
                                                <Typography variant="caption" sx={{ color: '#ea580c', fontWeight: 700, fontSize: '0.68rem', textAlign: 'center', px: 1 }}>
                                                    QQ 已掉线
                                                </Typography>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    disabled={isRestarting}
                                                    onClick={() => restartContainer(c.name, c.node_id)}
                                                    startIcon={isRestarting ? <CircularProgress size={10} color="inherit" /> : <RestartAltIcon sx={{ fontSize: 13 }} />}
                                                    sx={{
                                                        fontSize: '0.65rem', py: 0.3, px: 1, minWidth: 0,
                                                        bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' },
                                                        borderRadius: 1.5, textTransform: 'none',
                                                    }}
                                                >
                                                    {isRestarting ? '重启中...' : '重启'}
                                                </Button>
                                            </>
                                        ) : qr.status === 'loaded' ? (
                                            <img src={qr.url} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : qr.status === 'logged_in' ? (
                                            <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600, fontSize: '0.7rem' }}>{t('user.loggedIn')}</Typography>
                                        ) : qr.status === 'waiting' || qr.status === 'loading' ? (
                                            <>
                                                <CircularProgress size={24} sx={{ color: '#94a3b8' }} />
                                                <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem', textAlign: 'center', px: 1 }}>
                                                    等待二维码...
                                                </Typography>
                                            </>
                                        ) : (
                                            <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem' }}>{t('user.loadFailed')}</Typography>
                                        )}
                                    </Box>
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

            {/* QR 放大弹窗 */}
            <Dialog
                open={!!qrDialogName}
                onClose={() => setQrDialogName(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 4, backgroundImage: 'none',
                        bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff',
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
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, textAlign: 'center' }}>
                                    {container?.name || qrDialogName}
                                </Typography>
                                <Box sx={{
                                    width: 280, height: 280, borderRadius: 3, overflow: 'hidden',
                                    bgcolor: '#fff', p: 1, border: `1px solid ${theme.palette.divider}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <img src={qr.url} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
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
