import React, { useEffect, useState, useContext, useCallback } from 'react';
import { Box, Typography, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Drawer, useTheme } from '@mui/material';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import PublicIcon from '@mui/icons-material/Public';
import NapCatIcon from '../components/NapCatIcon';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorageIcon from '@mui/icons-material/Storage';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import SettingsIcon from '@mui/icons-material/Settings';
import HubIcon from '@mui/icons-material/Hub';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import ImageIcon from '@mui/icons-material/Image';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import BackupIcon from '@mui/icons-material/Backup';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { containerApi, authApi, type Container } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../components/Toast';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

const drawerWidth = 280;

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();
    const [containers, setContainers] = useState<Container[]>([]);
    const [openInstances, setOpenInstances] = useState(true);
    const toast = useToast();

    // WS 驱动容器列表（替代 HTTP 轮询，后端 3s 推送一次含 uin）
    const { data: wsData, connected: wsConnected } = useWebSocket<{ type: string; data: Container[] }>({
        path: '/ws/events',
    });

    // WS 推送到达时同步 containers state
    useEffect(() => {
        if (wsData?.type === 'containers' && Array.isArray(wsData.data)) {
            setContainers(wsData.data);
        }
    }, [wsData]);

    // 手动刷新（操作后立即反馈，不等 WS 3s 推送）
    const refreshContainers = useCallback(async () => {
        try {
            const data = await containerApi.list();
            setContainers(data.containers || []);
        } catch {
            toast.error('刷新容器列表失败');
        }
    }, []);

    // WS 未连接时回退到 HTTP 轮询（首次加载 + 断线容灾）
    // 延长到 10s：避免 WS 不稳定时前端疯狂轮询加重后端压力
    useEffect(() => {
        if (wsConnected) return;
        refreshContainers();
        const fallback = setInterval(refreshContainers, 10000);
        return () => clearInterval(fallback);
    }, [wsConnected, refreshContainers]);

    const handleLogout = async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        navigate('/login');
    };

    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{
            display: 'flex', minHeight: '100vh',
            background: isDark
                ? 'linear-gradient(135deg, #0f0f1a 0%, #1a1028 30%, #0f172a 70%, #0f0f1a 100%)'
                : 'linear-gradient(135deg, #fdf2f8 0%, #ede9fe 30%, #dbeafe 70%, #f0f9ff 100%)',
        }}>
            {/* 装饰性渐变光球 */}
            <Box sx={{
                position: 'fixed', top: '-10%', right: '10%', width: '30vw', height: '30vw',
                background: 'radial-gradient(circle, rgba(255,107,157,0.08) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'fixed', bottom: '-10%', left: '20%', width: '25vw', height: '25vw',
                background: 'radial-gradient(circle, rgba(96,165,250,0.08) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />

            {/* 毛玻璃侧边栏 */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        background: isDark ? 'rgba(20,20,35,0.7)' : 'rgba(255,255,255,0.25)',
                        backdropFilter: 'blur(24px) saturate(150%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                        borderRight: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.4)',
                        boxShadow: isDark
                            ? '4px 0 24px rgba(0,0,0,0.3)'
                            : '4px 0 24px rgba(192,132,252,0.06)',
                    },
                }}
            >
                {/* Logo 区域 */}
                <Box sx={{
                    p: 3, display: 'flex', alignItems: 'center', gap: 2, mb: 1,
                    borderBottom: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(192,132,252,0.08)',
                    pb: 3,
                }}>
                    <Box sx={{
                        p: 0.5, borderRadius: '14px',
                        background: 'linear-gradient(135deg, rgba(255,107,157,0.15), rgba(192,132,252,0.15))',
                        border: '1px solid rgba(192,132,252,0.2)',
                        display: 'flex',
                        boxShadow: '0 0 12px rgba(192,132,252,0.15)',
                    }}>
                        <NapCatIcon fontSize="medium" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" className="acg-title-sm" sx={{
                            fontWeight: 800, lineHeight: 1.2, fontSize: '0.95rem',
                            WebkitTextStroke: '0.5px rgba(192,132,252,0.6)',
                        }}>
                            {t('admin.title')}
                        </Typography>
                        <Typography variant="caption" sx={{
                            color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                            fontSize: '0.7rem',
                        }}>
                            {t('admin.subtitle')}
                        </Typography>
                    </Box>
                </Box>

                {/* 导航列表 */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <List component="nav" sx={{ px: 2, py: 1 }}>
                        {([
                            { path: '/admin', icon: <DashboardIcon />, label: t('admin.managedInstances') },
                            { path: '/admin/cluster-settings', icon: <SettingsIcon />, label: t('admin.instanceSettings') },
                            { path: '/admin/nodes', icon: <HubIcon />, label: t('admin.nodes') },
                            { path: '/admin/users', icon: <PeopleIcon />, label: t('admin.userManagement') },
                            { path: '/admin/operation-logs', icon: <HistoryIcon />, label: t('admin.operationLogs') },
                            { path: '/admin/images', icon: <ImageIcon />, label: t('admin.imageManager') },
                            { path: '/admin/alerts', icon: <NotificationsActiveIcon />, label: t('admin.alerts') },
                            { path: '/admin/backup', icon: <BackupIcon />, label: t('admin.backup') },
                            { path: '/admin/scheduler', icon: <ScheduleIcon />, label: t('admin.scheduler') },
                        ] as { path: string; icon: React.ReactNode; label: string }[]).map(item => {
                            const isActive = location.pathname === item.path;
                            return (
                                <ListItem disablePadding sx={{ mb: 0.5 }} key={item.path}>
                                    <ListItemButton
                                        selected={isActive}
                                        onClick={() => navigate(item.path)}
                                        sx={{
                                            borderRadius: '14px',
                                            transition: 'all 0.3s ease',
                                            '&.Mui-selected': {
                                                background: 'linear-gradient(135deg, rgba(255,107,157,0.12), rgba(192,132,252,0.12))',
                                                border: '1px solid rgba(192,132,252,0.15)',
                                                boxShadow: '0 0 12px rgba(192,132,252,0.08)',
                                                '&:hover': {
                                                    background: 'linear-gradient(135deg, rgba(255,107,157,0.18), rgba(192,132,252,0.18))',
                                                },
                                            },
                                            '&:not(.Mui-selected)': {
                                                border: '1px solid transparent',
                                                '&:hover': {
                                                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(192,132,252,0.05)',
                                                    transform: 'translateX(4px)',
                                                },
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{
                                            minWidth: 40,
                                            color: isActive ? '#c084fc' : (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'),
                                            filter: isActive ? 'drop-shadow(0 0 4px rgba(192,132,252,0.4))' : 'none',
                                        }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText primary={item.label} primaryTypographyProps={{
                                            fontSize: '0.85rem',
                                            fontWeight: isActive ? 700 : 500,
                                            color: isActive ? '#c084fc' : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)'),
                                        }} />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                    </List>
                </Box>

                {/* 底部区域 */}
                <Box sx={{
                    position: 'absolute', bottom: 0, width: '100%', p: 2,
                    borderTop: isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(192,132,252,0.08)',
                    background: isDark ? 'rgba(15,15,26,0.5)' : 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(12px)',
                }}>
                    <ListItem disablePadding sx={{ mb: 1 }}>
                        <ListItemButton onClick={() => navigate('/')} sx={{
                            borderRadius: '14px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(192,132,252,0.05)',
                                transform: 'translateX(4px)',
                            },
                        }}>
                            <ListItemIcon sx={{ minWidth: 40 }}>
                                <PublicIcon sx={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }} />
                            </ListItemIcon>
                            <ListItemText primary={t('admin.userSpaceBoard')} primaryTypographyProps={{
                                fontSize: '0.85rem', fontWeight: 500,
                                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                            }} />
                        </ListItemButton>
                    </ListItem>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, pt: 0 }}>
                        {/* WS 连接状态 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <FiberManualRecordIcon sx={{
                                fontSize: 10,
                                color: wsConnected ? '#10b981' : '#ef4444',
                                filter: wsConnected ? 'drop-shadow(0 0 4px #10b981)' : 'drop-shadow(0 0 4px #ef4444)',
                            }} />
                            <Typography variant="caption" sx={{
                                fontSize: '0.7rem',
                                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                            }}>
                                {wsConnected ? t('admin.wsConnected') : t('admin.wsDisconnected')}
                            </Typography>
                        </Box>
                        <Box>
                            <IconButton onClick={toggleLanguage} size="small" sx={{
                                mr: 0.5,
                                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                borderRadius: '10px',
                                '&:hover': { background: 'rgba(192,132,252,0.1)', color: '#c084fc' },
                            }} aria-label="Toggle language">
                                <TranslateIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={colorMode.toggleTheme} size="small" sx={{
                                mr: 0.5,
                                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                borderRadius: '10px',
                                '&:hover': { background: 'rgba(192,132,252,0.1)', color: '#c084fc' },
                            }} aria-label="Toggle theme">
                                {isDark ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                            </IconButton>
                            <IconButton onClick={handleLogout} size="small" sx={{
                                color: '#ef4444',
                                borderRadius: '10px',
                                '&:hover': { background: 'rgba(239,68,68,0.1)' },
                            }}>
                                <ExitToAppIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </Box>
            </Drawer>

            {/* 主内容区域 */}
            <Box component="main" sx={{
                flexGrow: 1, p: 0, minHeight: '100vh', overflow: 'auto',
                position: 'relative', zIndex: 1,
            }}>
                <Outlet context={{ containers, refreshContainers }} />
            </Box>
        </Box>
    );
}
