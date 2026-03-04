/**
 * NetworkConfig 组件 - 网络配置编辑器
 * 从 ConfigEditor.tsx 提取，保留原有 UI 风格
 */
import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Switch, FormControlLabel,
    Grid, IconButton, Divider, Card, CardContent, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import HttpIcon from '@mui/icons-material/Http';
import CableIcon from '@mui/icons-material/Cable';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import SensorsIcon from '@mui/icons-material/Sensors';
import RouterIcon from '@mui/icons-material/Router';
import { useTranslate } from '../i18n';
import { containerApi } from '../services/api';
import { useToast } from './Toast';

interface NetworkConfigProps {
    name: string;
    node_id: string;
}

export const NetworkConfig = ({ name, node_id }: NetworkConfigProps) => {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const t = useTranslate();
    const theme = useTheme();
    const toast = useToast();

    useEffect(() => {
        loadConfig();
    }, [name, node_id]);

    const loadConfig = async () => {
        try {
            const data = await containerApi.getConfig(name, 'config/napcat.json', node_id);
            if (data.status === 'ok' && data.content) {
                setConfig(JSON.parse(data.content));
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };

    const saveConfig = async () => {
        if (!config) return;
        setLoading(true);
        try {
            await containerApi.saveConfig(name, 'config/napcat.json', JSON.stringify(config, null, 2), node_id);
            toast.success('配置保存成功');
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error('配置保存失败，请重试');
        } finally {
            setLoading(false);
        }
    };

    const [editDialog, setEditDialog] = useState({ open: false, isNew: false, type: 'http', index: -1, data: {} as any });

    const saveToServer = async (newConfig: any) => {
        setLoading(true);
        try {
            await containerApi.saveConfig(name, 'config/napcat.json', JSON.stringify(newConfig, null, 2), node_id);
            toast.success('配置已保存生效');
            setConfig(newConfig);
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error('保存失败，请重试');
            // revert
            loadConfig();
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEndpoint = () => {
        const { type, index, isNew, data } = editDialog;
        const newConfig = { ...config };
        if (!newConfig[type]) newConfig[type] = [];

        if (isNew) {
            newConfig[type] = [...newConfig[type], data];
        } else {
            newConfig[type] = [...newConfig[type]];
            newConfig[type][index] = data;
        }

        setEditDialog({ ...editDialog, open: false });
        saveToServer(newConfig);
    };

    const handleDeleteEndpoint = () => {
        const { type, index } = editDialog;
        const newConfig = { ...config };
        if (newConfig[type]) {
            newConfig[type] = [...newConfig[type]];
            newConfig[type].splice(index, 1);
        }

        setEditDialog({ ...editDialog, open: false });
        saveToServer(newConfig);
    };

    const handleToggleEnable = (type: string, index: number, enable: boolean) => {
        const newConfig = { ...config };
        if (newConfig[type]) {
            newConfig[type] = [...newConfig[type]];
            newConfig[type][index].enable = enable;
        }
        saveToServer(newConfig);
    };

    const openAddDialog = () => {
        setEditDialog({ open: true, isNew: true, type: 'http', index: -1, data: { name: 'HTTP服务器', enable: true, host: '0.0.0.0', port: 3000 } });
    };

    const openEditDialog = (type: string, index: number) => {
        setEditDialog({ open: true, isNew: false, type, index, data: { ...config[type][index] } });
    };

    const updateDialogData = (key: string, value: any) => {
        setEditDialog(prev => ({ ...prev, data: { ...prev.data, [key]: value } }));
    };

    const handleTypeChange = (newType: string) => {
        const isClient = newType === 'http_client' || newType === 'ws_client';
        const newData = { name: '新建端点', enable: true };
        if (isClient) {
            (newData as any).url = 'http://127.0.0.1:8080';
        } else {
            (newData as any).host = '0.0.0.0';
            (newData as any).port = 3000;
        }
        setEditDialog(prev => ({ ...prev, type: newType, data: newData }));
    };

    const endpointMeta = [
        { type: 'http', label: 'HTTP 服务器', icon: <HttpIcon sx={{ color: '#10b981' }}/>, bg: 'rgba(16,185,129,0.1)' },
        { type: 'http_client', label: 'HTTP 客户端', icon: <CloudUploadIcon sx={{ color: '#3b82f6' }}/>, bg: 'rgba(59,130,246,0.1)' },
        { type: 'http_sse', label: 'HTTP SSE 服务器', icon: <SensorsIcon sx={{ color: '#f59e0b' }}/>, bg: 'rgba(245,158,11,0.1)' },
        { type: 'ws', label: 'WebSocket 服务器', icon: <SettingsInputComponentIcon sx={{ color: '#8b5cf6' }}/>, bg: 'rgba(139,92,246,0.1)' },
        { type: 'ws_client', label: 'WebSocket 客户端', icon: <CloudDownloadIcon sx={{ color: '#ec4899' }}/>, bg: 'rgba(236,72,153,0.1)' }
    ];

    if (!config) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', py: 10 }}>
                <Typography color="text.secondary">{t('正在加载网络配置...')}</Typography>
            </Box>
        );
    }

    const allEndpoints = endpointMeta.flatMap(meta =>
        (config[meta.type] || []).map((item: any, idx: number) => ({
            ...meta,
            item,
            index: idx
        }))
    );

    const isClientConfig = editDialog.type === 'http_client' || editDialog.type === 'ws_client';

    return (
        <Box>
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: 3,
                background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(59,130,246,0.1)', display: 'flex' }}>
                        <CableIcon sx={{ fontSize: 24, color: '#3b82f6' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('网络端点配置')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>配置和管理各种类型的通信端点</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={loadConfig}
                        disabled={loading}
                        variant="outlined"
                        sx={{ borderRadius: 2, textTransform: 'none', px: 2 }}
                    >
                        {t('刷新')}
                    </Button>
                    <Button
                        startIcon={<AddIcon />}
                        onClick={openAddDialog}
                        variant="contained"
                        sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', textTransform: 'none', px: 3 }}
                    >
                        {t('新建')}
                    </Button>
                </Box>
            </Box>

            {/* 端点卡片网格 */}
            <Grid container spacing={3}>
                {allEndpoints.length === 0 ? (
                    <Grid item xs={12}>
                        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                            <Typography variant="body1">{t('暂无端点配置，请点击右上角新建。')}</Typography>
                        </Box>
                    </Grid>
                ) : allEndpoints.map((endpoint, i) => (
                    <Grid item xs={12} md={6} lg={4} key={i}>
                        <Card sx={{
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
                            boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 15px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s',
                            '&:hover': {
                                boxShadow: theme.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.1)' : '0 8px 25px rgba(0,0,0,0.05)',
                                transform: 'translateY(-2px)'
                            }
                        }}>
                            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: endpoint.bg, display: 'flex' }}>
                                            {endpoint.icon}
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                {endpoint.item.name || endpoint.label}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {endpoint.label}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <IconButton size="small" onClick={() => openEditDialog(endpoint.type, endpoint.index)}>
                                        <SettingsIcon fontSize="small" />
                                    </IconButton>
                                </Box>

                                <Divider sx={{ my: 1.5 }} />

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {(endpoint.type === 'http_client' || endpoint.type === 'ws_client') ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0 }}>URL:</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {endpoint.item.url || '未配置'}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0 }}>地址:</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {endpoint.item.host || '0.0.0.0'}:{endpoint.item.port || 0}
                                            </Typography>
                                        </Box>
                                    )}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                        <Typography variant="caption" color="text.secondary">状态:</Typography>
                                        <FormControlLabel
                                            control={<Switch size="small" checked={endpoint.item.enable || false} onChange={(e) => handleToggleEnable(endpoint.type, endpoint.index, e.target.checked)} color="primary" />}
                                            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>{endpoint.item.enable ? t('已启用') : t('已禁用')}</Typography>}
                                            sx={{ m: 0 }}
                                        />
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* 新建/编辑弹窗 */}
            <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}>
                <DialogTitle sx={{ pb: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    {editDialog.isNew ? t('新建端点') : t('编辑端点')}
                </DialogTitle>
                <DialogContent sx={{ pt: '24px !important' }}>
                    <Grid container spacing={2}>
                        {editDialog.isNew && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('端点类型')}</InputLabel>
                                    <Select
                                        value={editDialog.type}
                                        label={t('端点类型')}
                                        onChange={(e) => handleTypeChange(e.target.value)}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        {endpointMeta.map((meta) => (
                                            <MenuItem key={meta.type} value={meta.type}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {meta.icon} {meta.label}
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}

                        <Grid item xs={12} sm={8}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('名称')}</Typography>
                            <TextField fullWidth size="small" placeholder="端点名称" value={editDialog.data?.name || ''} onChange={(e) => updateDialogData('name', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>

                        <Grid item xs={12} sm={4} sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.5 }}>
                            <FormControlLabel control={<Switch checked={editDialog.data?.enable !== false} onChange={(e) => updateDialogData('enable', e.target.checked)} color="primary" />} label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{t('启用')}</Typography>} />
                        </Grid>

                        {isClientConfig ? (
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('目标地址 (URL)')}</Typography>
                                <TextField fullWidth size="small" placeholder="http://127.0.0.1:8080" value={editDialog.data?.url || ''} onChange={(e) => updateDialogData('url', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                            </Grid>
                        ) : (
                            <>
                                <Grid item xs={12} sm={8}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('监听主机 (Host)')}</Typography>
                                    <TextField fullWidth size="small" placeholder="0.0.0.0" value={editDialog.data?.host || ''} onChange={(e) => updateDialogData('host', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('监听端口 (Port)')}</Typography>
                                    <TextField fullWidth size="small" type="number" placeholder="3000" value={editDialog.data?.port || ''} onChange={(e) => updateDialogData('port', parseInt(e.target.value) || 0)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('Token')}</Typography>
                            <TextField fullWidth size="small" placeholder="[可选] 通信密钥" value={editDialog.data?.token || ''} onChange={(e) => updateDialogData('token', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>

                        {editDialog.type === 'http' && (
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableCors !== false} onChange={(e) => updateDialogData('enableCors', e.target.checked)} />} label={<Typography variant="caption">{t('允许跨域(CORS)')}</Typography>} />
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableWebsocket || false} onChange={(e) => updateDialogData('enableWebsocket', e.target.checked)} />} label={<Typography variant="caption">{t('启用附带WS')}</Typography>} />
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
                    {!editDialog.isNew ? (
                        <Button
                            color="error"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={handleDeleteEndpoint}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                            {t('删除')}
                        </Button>
                    ) : <Box />}

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setEditDialog({ ...editDialog, open: false })} color="inherit" sx={{ borderRadius: 2, textTransform: 'none' }}>
                            {t('取消')}
                        </Button>
                        <Button onClick={handleSaveEndpoint} variant="contained" color="primary" sx={{ borderRadius: 2, textTransform: 'none', px: 3, boxShadow: '0 4px 10px rgba(59,130,246,0.2)' }}>
                            {t('保存')}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

