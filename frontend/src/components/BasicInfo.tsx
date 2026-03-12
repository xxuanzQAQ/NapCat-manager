/**
 * BasicInfo 组件 - 容器基本信息 + 操作按钮 + 二维码登录
 * 参考 NapCat WebUI 风格
 */
import { useEffect, useState } from 'react';
import {
    Box, Typography, Button, CircularProgress, Chip, Divider,
    Grid, useTheme, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { containerApi, type ContainerStats } from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from './Toast';

interface BasicInfoProps {
    name: string;
    node_id: string;
}

export const BasicInfo = ({ name, node_id }: BasicInfoProps) => {
    const [stats, setStats] = useState<Partial<ContainerStats>>({});
    const [qrcode, setQrcode] = useState('');
    const [showQrcode, setShowQrcode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [deleteDialog, setDeleteDialog] = useState({ open: false, deleteData: false });
    const theme = useTheme();
    const navigate = useNavigate();
    const t = useTranslate();
    const toast = useToast();

    const fetchStats = async () => {
        setLoading(true);
        try {
            const data = await containerApi.getStats(name, node_id);
            setStats(data);
            if (data.uin && data.uin !== '未登录 / Not Logged In') {
                setShowQrcode(false);
            }
        } catch {
            toast.error('获取状态失败');
        } finally {
            setLoading(false);
        }
    };

    // 刷新按钮：直接读取容器状态 + 本地二维码文件（零阻塞）
    const handleRefresh = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchStats(), fetchQrcode()]);
        } catch {
            toast.error('刷新失败');
        } finally {
            setLoading(false);
        }
    };

    const fetchQrcode = async () => {
        try {
            const data = await containerApi.getQR(name, node_id);
            if (data.status === 'logged_in') {
                setShowQrcode(false);
                setQrcode('');
            } else if (data.status === 'ok' && data.url) {
                if (data.type === 'file') {
                    setQrcode(data.url);
                } else {
                    setQrcode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`);
                }
                setShowQrcode(true);
            } else {
                // waiting 状态 — 容器启动中或 QR 尚未生成
                setShowQrcode(true);
                setQrcode('');
            }
        } catch {
            // 请求失败时仍显示二维码区域（等待/加载中），避免界面无反应
            if (!stats.uin || stats.uin === '未登录 / Not Logged In') {
                setShowQrcode(true);
            }
        }
    };

    const handleAction = async (action: string) => {
        if (action === 'delete') {
            setDeleteDialog({ open: true, deleteData: false });
            return;
        }
        setActionLoading(action);
        try {
            await containerApi.action(name, action, node_id);
            toast.success(`${name} → ${action} ✓`);
            setTimeout(fetchStats, 1500);
        } catch (e) { toast.error(`${name} ${action} ✗`); }
        finally { setActionLoading(''); }
    };

    const confirmDelete = async () => {
        setActionLoading('delete');
        try {
            await containerApi.action(name, 'delete', node_id, deleteDialog.deleteData);
            toast.success(`${name} deleted ✓`);
            navigate('/admin');
        } catch (e) { toast.error(`${name} delete ✗`); }
        finally {
            setActionLoading('');
            setDeleteDialog({ open: false, deleteData: false });
        }
    };

    const openWebUI = () => {
        if (stats.webui_port && stats.webui_token) {
            // 本地节点用当前浏览器 hostname，远程节点后续通过节点地址替换
            const host = window.location.hostname;
            window.open(`http://${host}:${stats.webui_port}/webui/?token=${stats.webui_token}`, '_blank');
        }
    };

    useEffect(() => {
        fetchStats();
        fetchQrcode();

        let si: ReturnType<typeof setInterval>;
        let qi: ReturnType<typeof setInterval>;

        const startPolling = () => {
            si = setInterval(fetchStats, 15000);
            // 已登录时不轮询 QR（节省请求）
            if (!stats.uin || stats.uin === '未登录 / Not Logged In') {
                qi = setInterval(fetchQrcode, 15000);
            }
        };
        const stopPolling = () => {
            clearInterval(si);
            clearInterval(qi);
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchStats();
                startPolling();
            } else {
                stopPolling();
            }
        };

        startPolling();
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [name, node_id]);

    const formatMB = (mb: number) => {
        if (!mb) return '-';
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    const isRunning = stats.status === 'running';
    const isLoggedIn = stats.uin && stats.uin !== '未登录 / Not Logged In';
    const qqNumber = stats.uin ? String(stats.uin).replace(/\D/g, '') : '';
    const avatarUrl = (isLoggedIn && qqNumber)
        ? `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`
        : "https://napneko.github.io/assets/newnewlogo.png";

    const isDark = theme.palette.mode === 'dark';
    const glassStyle = {
        background: isDark ? 'rgba(20,20,40,0.55)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(192,132,252,0.1)',
    };

    return (
        <Box>
            {/* 头部状态与操作栏 */}
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: '20px',
                ...glassStyle,
                flexWrap: 'wrap', gap: 2,
                position: 'relative', overflow: 'hidden',
                animation: 'fadeInUp 0.5s ease-out',
            }}>
                {/* 顶部渐变装饰线 */}
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: isRunning
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
                }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ position: 'relative' }}>
                        {/* 头像 CSS Mask 圆形遮罩 */}
                        <Box component="img" src={avatarUrl} sx={{
                            width: 50, height: 50, borderRadius: '50%', objectFit: 'cover',
                            filter: isRunning ? 'none' : 'grayscale(100%)',
                            opacity: isRunning ? 1 : 0.6,
                            border: `2px solid ${isRunning ? 'rgba(16,185,129,0.5)' : 'rgba(148,163,184,0.3)'}`,
                            maskImage: 'radial-gradient(circle, #000 60%, transparent 100%)',
                            WebkitMaskImage: 'radial-gradient(circle, #000 60%, transparent 100%)',
                            boxShadow: isRunning ? '0 0 16px rgba(16,185,129,0.4)' : 'none',
                        }} />
                        {/* 发光状态指示灯 */}
                        <Box sx={{
                            position: 'absolute', bottom: 1, right: 1, width: 13, height: 13,
                            borderRadius: '50%',
                            bgcolor: isRunning ? '#10b981' : '#94a3b8',
                            border: `2px solid ${isDark ? 'rgba(20,20,40,0.8)' : 'rgba(255,255,255,0.9)'}`,
                            boxShadow: isRunning ? '0 0 8px #10b981, 0 0 16px rgba(16,185,129,0.5)' : 'none',
                            animation: isRunning ? 'pulseGlow 2s infinite' : 'none',
                        }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{
                            fontWeight: 800, lineHeight: 1.2,
                            background: 'linear-gradient(135deg, #ff6b9d, #c084fc)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                        }}>{name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip label={isRunning ? t('basicInfo.running') : (stats.status || t('basicInfo.unknown'))}
                                size="small"
                                sx={{
                                    height: 20, fontSize: '0.7rem', fontWeight: 700,
                                    bgcolor: isRunning ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                                    color: isRunning ? '#10b981' : '#94a3b8',
                                    border: `1px solid ${isRunning ? 'rgba(16,185,129,0.35)' : 'rgba(148,163,184,0.3)'}`,
                                    boxShadow: isRunning ? '0 0 8px rgba(16,185,129,0.3)' : 'none',
                                }} />
                            {stats.version && stats.version !== 'Unknown' && (
                                <Typography variant="caption" sx={{
                                    fontFamily: 'monospace',
                                    bgcolor: isDark ? 'rgba(192,132,252,0.1)' : 'rgba(192,132,252,0.08)',
                                    color: '#c084fc', px: 1, borderRadius: 1, fontWeight: 600,
                                }}>
                                    v{stats.version}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {!isRunning ? (
                        <Button size="medium" variant="contained" startIcon={<PlayArrowIcon />}
                            onClick={() => handleAction('start')} disabled={!!actionLoading}
                            sx={{
                                borderRadius: '12px', textTransform: 'none', fontWeight: 700,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
                                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(16,185,129,0.5)' },
                                transition: 'all 0.25s',
                            }}>{t('basicInfo.start')}</Button>
                    ) : (
                        <>
                            <Button size="medium" variant="outlined" startIcon={<StopIcon />}
                                onClick={() => handleAction('stop')} disabled={!!actionLoading}
                                sx={{
                                    borderRadius: '12px', textTransform: 'none', fontWeight: 600,
                                    borderColor: 'rgba(245,158,11,0.5)', color: '#f59e0b',
                                    '&:hover': { borderColor: '#f59e0b', bgcolor: 'rgba(245,158,11,0.1)', transform: 'translateY(-2px)' },
                                    transition: 'all 0.25s',
                                }}>{t('basicInfo.stop')}</Button>
                            <Button size="medium" variant="outlined" startIcon={<RestartAltIcon />}
                                onClick={() => handleAction('restart')} disabled={!!actionLoading}
                                sx={{
                                    borderRadius: '12px', textTransform: 'none', fontWeight: 600,
                                    borderColor: 'rgba(96,165,250,0.5)', color: '#60a5fa',
                                    '&:hover': { borderColor: '#60a5fa', bgcolor: 'rgba(96,165,250,0.1)', transform: 'translateY(-2px)' },
                                    transition: 'all 0.25s',
                                }}>{t('basicInfo.restart')}</Button>
                        </>
                    )}
                    {stats.webui_port && stats.webui_token && (
                        <Button size="medium" variant="contained" startIcon={<OpenInNewIcon />}
                            onClick={openWebUI}
                            sx={{
                                borderRadius: '12px', textTransform: 'none', fontWeight: 700,
                                background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                                boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(59,130,246,0.5)' },
                                transition: 'all 0.25s',
                            }}>WebUI</Button>
                    )}
                    <Tooltip title={t('basicInfo.refreshTooltip')}>
                        <IconButton size="medium" onClick={handleRefresh} disabled={loading}
                            sx={{
                                border: `1px solid ${isDark ? 'rgba(192,132,252,0.3)' : 'rgba(192,132,252,0.25)'}`,
                                borderRadius: '12px', color: '#c084fc',
                                '&:hover': { bgcolor: 'rgba(192,132,252,0.12)', transform: 'rotate(180deg)' },
                                transition: 'all 0.4s',
                            }}>
                            {loading ? <CircularProgress size={20} sx={{ color: '#c084fc' }} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Button size="medium" variant="outlined" startIcon={<DeleteOutlineIcon />}
                        onClick={() => handleAction('delete')} disabled={!!actionLoading}
                        sx={{
                            borderRadius: '12px', textTransform: 'none', fontWeight: 600,
                            borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444',
                            '&:hover': { borderColor: '#ef4444', bgcolor: 'rgba(239,68,68,0.08)', transform: 'translateY(-2px)' },
                            transition: 'all 0.25s',
                        }}>{t('basicInfo.delete')}</Button>
                </Box>
            </Box>

            {/* 二维码区域 */}
            {showQrcode && !isLoggedIn && (
                <Box sx={{
                    mb: 3, borderRadius: '20px', p: 3,
                    ...glassStyle,
                    border: `1px solid rgba(245,158,11,0.35)`,
                    background: isDark
                        ? 'rgba(245,158,11,0.06)'
                        : 'rgba(255,251,235,0.8)',
                    backdropFilter: 'blur(20px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                    position: 'relative', overflow: 'hidden',
                    animation: 'fadeInUp 0.5s ease-out 0.1s both',
                }}>
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Box sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(245,158,11,0.15)', mr: 2, display: 'flex', boxShadow: '0 0 12px rgba(245,158,11,0.3)' }}>
                            <QrCode2Icon sx={{ fontSize: 24, color: '#f59e0b' }} />
                        </Box>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#f59e0b' }}>{t('basicInfo.qrLogin')}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('basicInfo.qrLoginDesc')}</Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                        {qrcode ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <Box sx={{ p: 2.5, bgcolor: '#fff', borderRadius: '20px', boxShadow: '0 8px 32px rgba(245,158,11,0.2)', border: '2px solid rgba(245,158,11,0.25)' }}>
                                    <img src={qrcode} alt="QR Code" style={{ width: 220, height: 220, display: 'block', borderRadius: 12 }} />
                                </Box>
                                <Button variant="text" size="small" startIcon={<RefreshIcon />} onClick={fetchQrcode}
                                    sx={{ color: '#f59e0b', fontWeight: 600, borderRadius: '10px', '&:hover': { bgcolor: 'rgba(245,158,11,0.1)' } }}>
                                    {t('basicInfo.refreshQr')}
                                </Button>
                            </Box>
                        ) : (
                            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <CircularProgress size={40} thickness={4} sx={{ color: '#f59e0b' }} />
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                    {t('basicInfo.fetchingQr')}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            )}

            {/* 信息卡片 */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Box sx={{
                        height: '100%', borderRadius: '20px', p: 3,
                        ...glassStyle,
                        position: 'relative', overflow: 'hidden',
                        transition: 'all 0.3s', animation: 'fadeInUp 0.5s ease-out 0.15s both',
                        '&:hover': { transform: 'translateY(-4px)', boxShadow: isDark ? '0 16px 48px rgba(192,132,252,0.2)' : '0 16px 48px rgba(192,132,252,0.15)' }
                    }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #ff6b9d, #c084fc)' }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ p: 1, borderRadius: '12px', background: 'linear-gradient(135deg, rgba(255,107,157,0.2), rgba(192,132,252,0.2))', mr: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, boxShadow: '0 0 12px rgba(192,132,252,0.25)' }}>
                                <Box component="img" src={avatarUrl} sx={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #ff6b9d, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('basicInfo.infoTitle')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <InfoRow label={t('basicInfo.qqAccount')} value={stats.uin ? String(stats.uin).replace(/\D/g, '') : '-'} highlight />
                            <InfoRow label={t('basicInfo.napcatVersion')} value={stats.version || '-'} />
                            <InfoRow label={t('basicInfo.platform')} value={stats.platform || '-'} />
                            <InfoRow label={t('basicInfo.uptime')} value={stats.uptime_formatted || '-'} />
                            <InfoRow label={t('basicInfo.webuiPort')} value={stats.webui_port ? String(stats.webui_port) : '-'} />
                        </Box>
                    </Box>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Box sx={{
                        height: '100%', borderRadius: '20px', p: 3,
                        ...glassStyle,
                        position: 'relative', overflow: 'hidden',
                        transition: 'all 0.3s', animation: 'fadeInUp 0.5s ease-out 0.25s both',
                        '&:hover': { transform: 'translateY(-4px)', boxShadow: isDark ? '0 16px 48px rgba(16,185,129,0.2)' : '0 16px 48px rgba(16,185,129,0.15)' }
                    }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(16,185,129,0.15)', mr: 2, display: 'flex', boxShadow: '0 0 12px rgba(16,185,129,0.3)' }}>
                                <MemoryIcon sx={{ fontSize: 24, color: '#10b981' }} />
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('basicInfo.systemResources')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <InfoRow label={t('basicInfo.cpuUsage')} value={`${(stats.cpu_percent || 0).toFixed(1)}%`} />
                            <InfoRow label={t('basicInfo.memUsage')} value={stats.mem_usage ? `${formatMB(stats.mem_usage)} / ${formatMB(stats.mem_limit || 0)}` : '-'} />
                            <Divider sx={{ my: 1, opacity: 0.3, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: 700, mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 1, color: '#10b981' }}>{t('basicInfo.networkEndpoints')}</Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    {[
                                        { label: `HTTP: ${stats.network_endpoints?.http || 0}`, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                                        { label: `WS: ${stats.network_endpoints?.ws || 0}`, color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
                                        { label: `HTTP Client: ${stats.network_endpoints?.http_client || 0}`, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
                                        { label: `WS Client: ${stats.network_endpoints?.ws_client || 0}`, color: '#ff6b9d', bg: 'rgba(255,107,157,0.12)' },
                                    ].map(chip => (
                                        <Chip key={chip.label} label={chip.label} size="small" sx={{
                                            borderRadius: '8px', fontWeight: 700,
                                            bgcolor: chip.bg, color: chip.color,
                                            border: `1px solid ${chip.color}40`,
                                        }} />
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            {/* 删除确认对话框 */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
                PaperProps={{ sx: {
                    borderRadius: '24px', p: 1, minWidth: 420,
                    background: isDark ? 'rgba(20,20,40,0.85)' : 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(24px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
                }}}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('basicInfo.confirmDeleteTitle')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }} dangerouslySetInnerHTML={{ __html: t('basicInfo.deleteInstanceDesc').replace('{name}', name) }} />
                    <FormControlLabel
                        control={
                            <Checkbox checked={deleteDialog.deleteData} color="error"
                                onChange={e => setDeleteDialog({ ...deleteDialog, deleteData: e.target.checked })} />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('basicInfo.deleteWithData')}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('basicInfo.deleteDataWarning').replace('{name}', name)}
                                </Typography>
                            </Box>
                        }
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} color="inherit" sx={{ borderRadius: '12px' }}>{t('basicInfo.cancel')}</Button>
                    <Button onClick={confirmDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 14px rgba(239,68,68,0.4)' }}>
                        {deleteDialog.deleteData ? t('basicInfo.deleteInstanceAndData') : t('basicInfo.deleteInstanceOnly')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const InfoRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        p: 1.5, borderRadius: '10px',
        bgcolor: highlight ? 'rgba(192,132,252,0.08)' : 'transparent',
        border: highlight ? '1px solid rgba(192,132,252,0.2)' : '1px solid transparent',
        transition: 'all 0.2s',
        '&:hover': { bgcolor: highlight ? 'rgba(192,132,252,0.12)' : 'rgba(192,132,252,0.04)' }
    }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" sx={{
            fontWeight: highlight ? 700 : 600,
            fontFamily: 'monospace',
            color: highlight ? '#c084fc' : 'text.primary',
            bgcolor: highlight ? 'rgba(192,132,252,0.1)' : 'transparent',
            px: highlight ? 1.5 : 0, py: highlight ? 0.5 : 0, borderRadius: '8px',
            boxShadow: highlight ? '0 0 8px rgba(192,132,252,0.25)' : 'none'
        }}>{value}</Typography>
    </Box>
);