import React, { useEffect, useState, useContext } from 'react';
import { Box, Typography, IconButton, Collapse, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Drawer, useTheme } from '@mui/material';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import PublicIcon from '@mui/icons-material/Public';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
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
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';

const drawerWidth = 280;

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();
    const [containers, setContainers] = useState<any[]>([]);
    const [openInstances, setOpenInstances] = useState(true);

    const fetchContainers = async () => {
        try {
            const res = await fetch('/api/containers', { credentials: 'include' });
            if (res.status === 401) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            setContainers(data.containers || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchContainers();
        const interval = setInterval(fetchContainers, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = async () => {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        navigate('/login');
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        backgroundColor: theme.palette.background.paper,
                        borderRight: `1px solid ${theme.palette.divider}`
                    },
                }}
            >
                <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ p: 0.5, borderRadius: 2, bgcolor: '#fff', display: 'flex' }}>
                        <NapCatIcon fontSize="medium" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('admin.title')}</Typography>
                        <Typography variant="caption" color="text.secondary">{t('admin.subtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <List component="nav" sx={{ px: 2, py: 2 }}>
                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                selected={location.pathname === '/admin'}
                                onClick={() => navigate('/admin')}
                                sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}><DashboardIcon sx={{ color: location.pathname === '/admin' ? '#60a5fa' : 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary="托管实例" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin' ? 600 : 500, color: location.pathname === '/admin' ? '#60a5fa' : 'text.primary' }} />
                            </ListItemButton>
                        </ListItem>

                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                selected={location.pathname === '/admin/cluster-settings'}
                                onClick={() => navigate('/admin/cluster-settings')}
                                sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}><SettingsIcon sx={{ color: location.pathname === '/admin/cluster-settings' ? '#60a5fa' : 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary={"实例初始化设置"} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin/cluster-settings' ? 600 : 500, color: location.pathname === '/admin/cluster-settings' ? '#60a5fa' : 'text.primary' }} />
                            </ListItemButton>
                        </ListItem>

                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                selected={location.pathname === '/admin/nodes'}
                                onClick={() => navigate('/admin/nodes')}
                                sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}><HubIcon sx={{ color: location.pathname === '/admin/nodes' ? '#60a5fa' : 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary={t('admin.nodes') || "Nodes"} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin/nodes' ? 600 : 500, color: location.pathname === '/admin/nodes' ? '#60a5fa' : 'text.primary' }} />
                            </ListItemButton>
                        </ListItem>

                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                selected={location.pathname === '/admin/users'}
                                onClick={() => navigate('/admin/users')}
                                sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}><PeopleIcon sx={{ color: location.pathname === '/admin/users' ? '#60a5fa' : 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary="用户管理" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin/users' ? 600 : 500, color: location.pathname === '/admin/users' ? '#60a5fa' : 'text.primary' }} />
                            </ListItemButton>
                        </ListItem>

                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemButton
                                selected={location.pathname === '/admin/operation-logs'}
                                onClick={() => navigate('/admin/operation-logs')}
                                sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}><HistoryIcon sx={{ color: location.pathname === '/admin/operation-logs' ? '#60a5fa' : 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary="操作日志" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin/operation-logs' ? 600 : 500, color: location.pathname === '/admin/operation-logs' ? '#60a5fa' : 'text.primary' }} />
                            </ListItemButton>
                        </ListItem>



                        <ListItem disablePadding sx={{ mt: 2, borderTop: '1px solid rgba(255,255,255,0.05)', pt: 2 }}>
                            <ListItemButton onClick={() => navigate('/')} sx={{ borderRadius: 2 }}>
                                <ListItemIcon sx={{ minWidth: 40 }}><PublicIcon sx={{ color: 'text.secondary' }} /></ListItemIcon>
                                <ListItemText primary="Userspace Board" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }} />
                            </ListItemButton>
                        </ListItem>

                    </List>
                </Box>
                <Box sx={{ position: 'absolute', bottom: 0, width: '100%', p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1 }}>
                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} /> {t('admin.online')}
                        </Typography>
                        <Box>
                            <IconButton onClick={toggleLanguage} size="small" sx={{ mr: 1 }} aria-label="Toggle language">
                                <TranslateIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={colorMode.toggleTheme} size="small" sx={{ mr: 1 }} aria-label="Toggle theme">
                                {theme.palette.mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                            </IconButton>
                            <IconButton onClick={handleLogout} size="small" sx={{ color: 'error.main' }}>
                                <ExitToAppIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </Box>
            </Drawer>

            {/* Main content Area */}
            <Box component="main" sx={{ flexGrow: 1, p: 0, bgcolor: theme.palette.background.default, minHeight: '100vh', overflow: 'auto' }}>
                <Outlet context={{ fetchContainers }} />
            </Box>
        </Box>
    );
}
