/**
 * NetworkConfig 组件 - 网络配置编辑器
 * 从 ConfigEditor.tsx 提取，保留原有 UI 风格
 */
import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Switch, FormControlLabel,
    Grid, IconButton, Divider, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
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
import { useTranslate } from '../i18n';
import { containerApi } from '../services/api';
import { useToast } from './Toast';

interface NetworkConfigProps {
    name: string;
    node_id: string;
}

interface EndpointConfig {
    name: string;
    enable: boolean;
    host?: string;
    port?: number;
    url?: string;
    [key: string]: unknown;
}

// 前端内部使用的扁平化网络配置
interface NapcatNetworkConfig {
    http?: EndpointConfig[];
    http_client?: EndpointConfig[];
    http_sse?: EndpointConfig[];
    ws?: EndpointConfig[];
    ws_client?: EndpointConfig[];
    [key: string]: EndpointConfig[] | undefined;
}

interface EditDialogState {
    open: boolean;
    isNew: boolean;
    type: string;
    index: number;
    data: EndpointConfig;
}

// NapCat onebot11_{uin}.json 中的字段名 ↔ 前端内部类型名映射
const NAPCAT_TO_UI: Record<string, string> = {
    httpServers: 'http',
    httpClients: 'http_client',
    httpSseServers: 'http_sse',
    websocketServers: 'ws',
    websocketClients: 'ws_client',
};
const UI_TO_NAPCAT: Record<string, string> = Object.fromEntries(
    Object.entries(NAPCAT_TO_UI).map(([k, v]) => [v, k])
);

/** 从 onebot11 文件的 network 对象转换为前端扁平格式 */
function parseNetworkToUI(network: Record<string, unknown>): NapcatNetworkConfig {
    const result: NapcatNetworkConfig = {};
    for (const [napcatKey, uiKey] of Object.entries(NAPCAT_TO_UI)) {
        const arr = network[napcatKey];
        if (Array.isArray(arr) && arr.length > 0) {
            result[uiKey] = arr as EndpointConfig[];
        }
    }
    return result;
}

/** 将前端扁平格式转换回 onebot11 文件的 network 对象 */
function serializeUIToNetwork(config: NapcatNetworkConfig): Record<string, unknown> {
    const network: Record<string, unknown> = {};
    for (const [uiKey, napcatKey] of Object.entries(UI_TO_NAPCAT)) {
        network[napcatKey] = config[uiKey] || [];
    }
    return network;
}

export const NetworkConfig = ({ name, node_id }: NetworkConfigProps) => {
    const [config, setConfig] = useState<NapcatNetworkConfig | null>(null);
    const [loading, setLoading] = useState(false);
    // 保存完整的 onebot11 文件内容（含 musicSignUrl 等非网络字段）和文件名
    const [ob11FileName, setOb11FileName] = useState<string>('');
    const [ob11Extra, setOb11Extra] = useState<Record<string, unknown>>({});
    const [noConfigFile, setNoConfigFile] = useState(false);
    const t = useTranslate();
    const theme = useTheme();
    const toast = useToast();

    useEffect(() => {
        loadConfig();
    }, [name, node_id]);

    /** 查找 onebot11_{uin}.json 文件名 */
    const findOb11File = async (): Promise<string> => {
        try {
            const filesData = await containerApi.listFiles(name, 'config', node_id);
            if (filesData.status === 'ok' && filesData.files) {
                const ob11File = filesData.files
                    .map((f: { name: string }) => f.name)
                    .filter((n: string) => n.startsWith('onebot11_') && n.endsWith('.json'))
                    .sort()
                    .pop();
                if (ob11File) return ob11File;
            }
        } catch (error) {
            console.error('Failed to list config files:', error);
        }
        return '';
    };

    const loadConfig = async () => {
        setNoConfigFile(false);
        try {
            const fileName = await findOb11File();
            if (!fileName) {
                setNoConfigFile(true);
                setConfig({ http: [], http_client: [], http_sse: [], ws: [], ws_client: [] });
                return;
            }
            setOb11FileName(fileName);
            const data = await containerApi.getConfig(name, `config/${fileName}`, node_id);
            if (data.status === 'ok' && data.content) {
                const fullJson = JSON.parse(data.content);
                const network = fullJson.network || {};
                // 保留非 network 字段（musicSignUrl, enableLocalFile2Url 等）
                const { network: _net, ...extra } = fullJson;
                setOb11Extra(extra);
                setConfig(parseNetworkToUI(network));
            } else {
                setNoConfigFile(true);
                setConfig({ http: [], http_client: [], http_sse: [], ws: [], ws_client: [] });
            }
        } catch (error) {
            console.error('Failed to load config:', error);
            setNoConfigFile(true);
            setConfig({ http: [], http_client: [], http_sse: [], ws: [], ws_client: [] });
        }
    };

    const [editDialog, setEditDialog] = useState<EditDialogState>({ open: false, isNew: false, type: 'http', index: -1, data: { name: '', enable: true } });

    const saveToServer = async (newConfig: NapcatNetworkConfig) => {
        if (!ob11FileName) {
            toast.error(t('network.noConfigFile'));
            return;
        }
        setLoading(true);
        try {
            // 重新组装完整的 onebot11 文件：保留原有非网络字段 + 更新 network
            const fullJson = {
                ...ob11Extra,
                network: serializeUIToNetwork(newConfig),
            };
            await containerApi.saveConfig(name, `config/${ob11FileName}`, JSON.stringify(fullJson, null, 2), node_id);
            toast.success(t('network.saveApplied'));
            setConfig(newConfig);
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error(t('network.saveRetryFailed'));
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
        setEditDialog({ open: true, isNew: true, type: 'http', index: -1, data: { name: t('network.httpServer'), enable: true, host: '0.0.0.0', port: 3000 } });
    };

    const openEditDialog = (type: string, index: number) => {
        setEditDialog({ open: true, isNew: false, type, index, data: { ...config[type][index] } });
    };

    const updateDialogData = (key: string, value: string | number | boolean) => {
        setEditDialog(prev => ({ ...prev, data: { ...prev.data, [key]: value } }));
    };

    const handleTypeChange = (newType: string) => {
        const isClient = newType === 'http_client' || newType === 'ws_client';
        const newData: EndpointConfig = isClient
            ? { name: t('network.newEndpoint'), enable: true, url: 'http://127.0.0.1:8080' }
            : { name: t('network.newEndpoint'), enable: true, host: '0.0.0.0', port: 3000 };
        setEditDialog(prev => ({ ...prev, type: newType, data: newData }));
    };

    const endpointMeta = [
        { type: 'http', label: t('network.httpServer'), icon: <HttpIcon sx={{ color: '#10b981' }}/>, bg: 'rgba(16,185,129,0.1)' },
        { type: 'http_client', label: t('network.httpClient'), icon: <CloudUploadIcon sx={{ color: '#3b82f6' }}/>, bg: 'rgba(59,130,246,0.1)' },
        { type: 'http_sse', label: t('network.httpSseServer'), icon: <SensorsIcon sx={{ color: '#f59e0b' }}/>, bg: 'rgba(245,158,11,0.1)' },
        { type: 'ws', label: t('network.wsServer'), icon: <SettingsInputComponentIcon sx={{ color: '#8b5cf6' }}/>, bg: 'rgba(139,92,246,0.1)' },
        { type: 'ws_client', label: t('network.wsClient'), icon: <CloudDownloadIcon sx={{ color: '#ec4899' }}/>, bg: 'rgba(236,72,153,0.1)' }
    ];

    const isDark = theme.palette.mode === 'dark';
    const glassStyle = {
        background: isDark ? 'rgba(20,20,40,0.55)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
        boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(192,132,252,0.1)',
    };

    if (!config) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', py: 10 }}>
                <Typography color="text.secondary">{t('network.loading')}</Typography>
            </Box>
        );
    }

    if (noConfigFile) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', py: 10, gap: 2 }}>
                <Typography color="text.secondary">{t('network.notLoggedIn')}</Typography>
                <Button startIcon={<RefreshIcon />} onClick={loadConfig} variant="outlined" sx={{ borderRadius: '12px', textTransform: 'none', borderColor: 'rgba(192,132,252,0.4)', color: '#c084fc', '&:hover': { bgcolor: 'rgba(192,132,252,0.1)', borderColor: '#c084fc' } }}>
                    {t('network.refresh')}
                </Button>
            </Box>
        );
    }

    const allEndpoints = endpointMeta.flatMap(meta =>
        (config[meta.type] || []).map((item: EndpointConfig, idx: number) => ({
            ...meta,
            item,
            index: idx
        }))
    );

    const isClientConfig = editDialog.type === 'http_client' || editDialog.type === 'ws_client';

    return (
        <Box>
            {/* 顶部工具栏 */}
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: '20px',
                ...glassStyle,
                flexWrap: 'wrap', gap: 2,
                position: 'relative', overflow: 'hidden',
                animation: 'fadeInUp 0.5s ease-out',
            }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #60a5fa, #c084fc, #ff6b9d)' }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(96,165,250,0.15)', display: 'flex', boxShadow: '0 0 12px rgba(96,165,250,0.3)' }}>
                        <CableIcon sx={{ fontSize: 24, color: '#60a5fa' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, background: 'linear-gradient(135deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('network.title')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('network.subtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button startIcon={<RefreshIcon />} onClick={loadConfig} disabled={loading} variant="outlined"
                        sx={{ borderRadius: '12px', textTransform: 'none', px: 2, borderColor: 'rgba(192,132,252,0.4)', color: '#c084fc', '&:hover': { bgcolor: 'rgba(192,132,252,0.1)', borderColor: '#c084fc', transform: 'translateY(-2px)' }, transition: 'all 0.25s' }}>
                        {t('network.refresh')}
                    </Button>
                    <Button startIcon={<AddIcon />} onClick={openAddDialog} variant="contained"
                        sx={{ borderRadius: '12px', textTransform: 'none', px: 3, fontWeight: 700, background: 'linear-gradient(135deg, #ff6b9d 0%, #c084fc 50%, #60a5fa 100%)', boxShadow: '0 4px 16px rgba(192,132,252,0.4)', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(192,132,252,0.5)' }, transition: 'all 0.25s' }}>
                        {t('network.create')}
                    </Button>
                </Box>
            </Box>

            {/* 端点卡片网格 */}
            <Grid container spacing={3}>
                {allEndpoints.length === 0 ? (
                    <Grid item xs={12}>
                        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                            <Typography variant="body1">{t('network.noEndpoints')}</Typography>
                        </Box>
                    </Grid>
                ) : allEndpoints.map((endpoint, i) => (
                    <Grid item xs={12} md={6} lg={4} key={i}>
                        <Box sx={{
                            borderRadius: '20px', p: 2.5,
                            ...glassStyle,
                            position: 'relative', overflow: 'hidden',
                            transition: 'all 0.3s',
                            animation: `fadeInUp 0.5s ease-out ${i * 0.08}s both`,
                            '&:hover': {
                                transform: 'translateY(-4px)',
                                boxShadow: isDark ? '0 16px 48px rgba(192,132,252,0.2)' : '0 16px 48px rgba(192,132,252,0.15)',
                            }
                        }}>
                            {/* 顶部彩色装饰线 */}
                            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: endpoint.type === 'http' ? 'linear-gradient(90deg, #10b981, #34d399)' : endpoint.type === 'http_client' ? 'linear-gradient(90deg, #60a5fa, #93c5fd)' : endpoint.type === 'http_sse' ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : endpoint.type === 'ws' ? 'linear-gradient(90deg, #c084fc, #e879f9)' : 'linear-gradient(90deg, #ff6b9d, #fb7185)' }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Box sx={{ p: 1, borderRadius: '12px', bgcolor: endpoint.bg, display: 'flex', boxShadow: `0 0 10px ${endpoint.bg}` }}>
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
                                <IconButton size="small" onClick={() => openEditDialog(endpoint.type, endpoint.index)}
                                    sx={{ color: '#c084fc', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(192,132,252,0.15)', transform: 'rotate(30deg)' }, transition: 'all 0.3s' }}>
                                    <SettingsIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            <Divider sx={{ my: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {(endpoint.type === 'http_client' || endpoint.type === 'ws_client') ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0, fontWeight: 600 }}>URL:</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#60a5fa' }}>
                                            {endpoint.item.url || t('network.notConfigured')}
                                        </Typography>
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0, fontWeight: 600 }}>{t('network.address')}</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600 }}>
                                            {endpoint.item.host || '0.0.0.0'}:{endpoint.item.port || 0}
                                        </Typography>
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{t('network.status')}</Typography>
                                    <FormControlLabel
                                        control={<Switch size="small" checked={endpoint.item.enable || false} onChange={(e) => handleToggleEnable(endpoint.type, endpoint.index, e.target.checked)}
                                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#c084fc' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#c084fc' } }} />}
                                        label={<Typography variant="caption" sx={{ fontWeight: 700, color: endpoint.item.enable ? '#c084fc' : 'text.disabled' }}>{endpoint.item.enable ? t('network.enabled') : t('network.disabled')}</Typography>}
                                        sx={{ m: 0 }}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Grid>
                ))}
            </Grid>

            {/* 新建/编辑弹窗 */}
            <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth
                PaperProps={{ sx: {
                    borderRadius: '24px',
                    background: isDark ? 'rgba(20,20,40,0.88)' : 'rgba(255,255,255,0.88)',
                    backdropFilter: 'blur(24px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
                    boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
                    backgroundImage: 'none',
                }}}>
                <DialogTitle sx={{ pb: 1, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`, fontWeight: 700, background: 'linear-gradient(135deg, #c084fc, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {editDialog.isNew ? t('network.createEndpoint') : t('network.editEndpoint')}
                </DialogTitle>
                <DialogContent sx={{ pt: '24px !important' }}>
                    <Grid container spacing={2}>
                        {editDialog.isNew && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('network.endpointType')}</InputLabel>
                                    <Select value={editDialog.type} label={t('network.endpointType')} onChange={(e) => handleTypeChange(e.target.value)}
                                        sx={{ borderRadius: '12px' }}>
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
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.name')}</Typography>
                            <TextField fullWidth size="small" placeholder={t('network.namePlaceholder')} value={editDialog.data?.name || ''} onChange={(e) => updateDialogData('name', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
                        </Grid>

                        <Grid item xs={12} sm={4} sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.5 }}>
                            <FormControlLabel control={<Switch checked={editDialog.data?.enable !== false} onChange={(e) => updateDialogData('enable', e.target.checked)} color="primary" />} label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{t('network.enable')}</Typography>} />
                        </Grid>

                        {isClientConfig ? (
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.targetUrl')}</Typography>
                                <TextField fullWidth size="small" placeholder="http://127.0.0.1:8080" value={editDialog.data?.url || ''} onChange={(e) => updateDialogData('url', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
                            </Grid>
                        ) : (
                            <>
                                <Grid item xs={12} sm={8}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.listenHost')}</Typography>
                                    <TextField fullWidth size="small" placeholder="0.0.0.0" value={editDialog.data?.host || ''} onChange={(e) => updateDialogData('host', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.listenPort')}</Typography>
                                    <TextField fullWidth size="small" type="number" placeholder="3000" value={editDialog.data?.port || ''} onChange={(e) => updateDialogData('port', parseInt(e.target.value) || 0)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('Token')}</Typography>
                            <TextField fullWidth size="small" placeholder={t('network.tokenPlaceholder')} value={editDialog.data?.token || ''} onChange={(e) => updateDialogData('token', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
                        </Grid>

                        {editDialog.type === 'http' && (
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableCors !== false} onChange={(e) => updateDialogData('enableCors', e.target.checked)} />} label={<Typography variant="caption">{t('network.enableCors')}</Typography>} />
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableWebsocket || false} onChange={(e) => updateDialogData('enableWebsocket', e.target.checked)} />} label={<Typography variant="caption">{t('network.enableWs')}</Typography>} />
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
                    {!editDialog.isNew ? (
                        <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={handleDeleteEndpoint}
                            sx={{ borderRadius: '12px', textTransform: 'none', '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' } }}>
                            {t('network.delete')}
                        </Button>
                    ) : <Box />}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setEditDialog({ ...editDialog, open: false })} color="inherit" sx={{ borderRadius: '12px', textTransform: 'none' }}>
                            {t('network.cancel')}
                        </Button>
                        <Button onClick={handleSaveEndpoint} variant="contained"
                            sx={{ borderRadius: '12px', textTransform: 'none', px: 3, fontWeight: 700, background: 'linear-gradient(135deg, #c084fc, #60a5fa)', boxShadow: '0 4px 14px rgba(192,132,252,0.4)', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(192,132,252,0.5)' }, transition: 'all 0.25s' }}>
                            {t('network.save')}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

