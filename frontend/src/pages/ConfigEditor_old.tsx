import { useState } from 'react';
import {
    Box, Typography, IconButton, Tabs, Tab
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslate } from '../i18n';
import BasicInfo from '../components/BasicInfo';
import NetworkConfig from '../components/NetworkConfig';
import FileManager from '../components/FileManager';
import NapcatLogs from '../components/NapcatLogs';

export default function ConfigEditor() {
    const [stats, setStats] = useState({
        cpu_percent: 0, mem_usage: 0, mem_limit: 0,
        uin: '', version: '', webui_token: '', webui_port: 0,
        platform: '', uptime_formatted: '',
        network_endpoints: { http: 0, ws: 0, http_client: 0, ws_client: 0 }
    });
    const t = useTranslate();
    const theme = useTheme();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`/api/containers/${name}/stats?node_id=${node_id}`);
                if (res.ok) {
                    const data = await res.json();
                    setStats({
                        cpu_percent: data.cpu_percent || 0,
                        mem_usage: data.mem_usage || 0,
                        mem_limit: data.mem_limit || 0,
                        uin: data.uin || '',
                        version: data.version || '',
                        webui_token: data.webui_token || '',
                        webui_port: data.webui_port || 0,
                        platform: data.platform || '',
                        uptime_formatted: data.uptime_formatted || '',
                        network_endpoints: data.network_endpoints || { http: 0, ws: 0, http_client: 0, ws_client: 0 }
                    });
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, [name]);

    const handleOpenWebUI = () => {
        if (stats.webui_port) {
            const host = window.location.hostname;
            // The URL parameter logic is from native napcat documentation or simply prompt user to login
            const url = `http://${host}:${stats.webui_port}/webui?token=${stats.webui_token}`;
            window.open(url, '_blank');
        }
    };

    const baseCardProps = {
        variant: "outlined" as "outlined",
        sx: {
            borderRadius: 4,
            boxShadow: 'none',
            border: (theme as any).palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
            bgcolor: (theme as any).palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(10px)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }
    };

    return (
        <Box sx={{ mt: 3, maxWidth: 1000, mx: 'auto' }}>
            <Grid container spacing={3}>
                {/* Left Column: QQ Info & Platform Info */}
                <Grid item xs={12} md={5} lg={4} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* QQ Info Card */}
                    <Card {...baseCardProps} sx={{ ...baseCardProps.sx, height: 'auto', flex: 1 }}>
                        <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <Box sx={{
                                width: 80, height: 80, borderRadius: '50%', mb: 2,
                                background: stats.uin && stats.uin !== '未登录 / Not Logged In' ? `url(http://q1.qlogo.cn/g?b=qq&nk=${stats.uin}&s=640) center/cover` : '#eee',
                                boxShadow: theme.palette.mode === 'dark' ? '0 4px 10px rgba(0,0,0,0.5)' : '0 4px 10px rgba(0,0,0,0.1)',
                                border: '2px solid rgba(255,255,255,0.2)'
                            }} />
                            <Typography variant="h6" fontWeight={600}>
                                {stats.uin && stats.uin !== '未登录 / Not Logged In' ? stats.uin : '未登录状态'}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'success.main', bgcolor: 'rgba(16, 185, 129, 0.15)', px: 1.5, py: 0.2, borderRadius: 3, mt: 1, fontSize: '0.75rem', fontWeight: 600 }}>
                                {t('admin.online')}
                            </Typography>

                            {stats.webui_token && stats.webui_port > 0 && (
                                <Button size="small" variant="contained" onClick={handleOpenWebUI} sx={{ borderRadius: 3, mt: 3, textTransform: 'none', fontSize: '0.75rem', px: 2, boxShadow: 'none' }}>
                                    进入原生面板
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* System Info Card */}
                    <Card {...baseCardProps} sx={{ ...baseCardProps.sx, height: 'auto' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>NapCat 版本</Typography>
                                    <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>{stats.version || 'Unset'}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>系统特征架构</Typography>
                                    <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>{stats.platform || 'Linux'}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>持续运行时长</Typography>
                                    <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>{stats.uptime_formatted || '0分钟'}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Right Column: System Status Dashboard (CPU / Mem) */}
                <Grid item xs={12} md={7} lg={8} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Card {...baseCardProps}>
                        <CardContent sx={{ p: { xs: 3, md: 4 }, flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, position: 'relative' }}>
                            {/* Left Text Detail Area */}
                            <Box sx={{ flex: 1, zIndex: 1 }}>
                                <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
                                    <MemoryIcon color="action" /> CPU 状态
                                </Typography>
                                <Grid container spacing={1.5} sx={{ mb: 4, ml: 0.5 }}>
                                    <Grid item xs={12} sm={6}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', p: 1, px: 2, borderRadius: 2 }}>
                                            <Typography variant="body2" color="text.secondary">使用率</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{stats.cpu_percent.toFixed(1)} <Typography component="span" sx={{ fontSize: "0.75rem", opacity: 0.7 }}>%</Typography></Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', p: 1, px: 2, borderRadius: 2 }}>
                                            <Typography variant="body2" color="text.secondary">核心类型</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>Docker Mount</Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
                                    <InsertDriveFileIcon color="action" /> 内存状态
                                </Typography>
                                <Grid container spacing={1.5} sx={{ ml: 0.5 }}>
                                    <Grid item xs={12} sm={6}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', p: 1, px: 2, borderRadius: 2 }}>
                                            <Typography variant="body2" color="text.secondary">使用量</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{stats.mem_usage.toFixed(0)} <Typography component="span" sx={{ fontSize: "0.75rem", opacity: 0.7 }}>MB</Typography></Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', p: 1, px: 2, borderRadius: 2 }}>
                                            <Typography variant="body2" color="text.secondary">分配总量</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{stats.mem_limit > 0 ? stats.mem_limit.toFixed(0) : 'N/A'} <Typography component="span" sx={{ fontSize: "0.75rem", opacity: 0.7 }}>{stats.mem_limit > 0 ? 'MB' : ''}</Typography></Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Box>

                            {/* Right Rings Area */}
                            <Box sx={{ display: 'flex', flexDirection: { xs: 'row', md: 'column' }, gap: 3, alignItems: 'center', justifyContent: 'center', minWidth: { xs: 'auto', md: 160 }, zIndex: 1 }}>
                                {/* CPU Ring */}
                                <Box sx={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Typography variant="subtitle2" color="text.secondary" mb={1}>CPU 负载追踪</Typography>
                                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                                        <CircularProgress variant="determinate" value={100} size={100} thickness={4} sx={{ color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} />
                                        <CircularProgress variant="determinate" value={Math.min(stats.cpu_percent, 100)} size={100} thickness={4} sx={{ color: 'primary.main', position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }} />
                                        <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                            <Typography variant="h5" component="div" color="text.primary" sx={{ fontWeight: 600, lineHeight: 1 }}>
                                                {stats.cpu_percent.toFixed(0)}<Typography component="span" variant="caption" sx={{ ml: 0.2 }}>%</Typography>
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>

                                {/* Memory Ring */}
                                <Box sx={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Typography variant="subtitle2" color="text.secondary" mb={1}>内存分配消耗</Typography>
                                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                                        <CircularProgress variant="determinate" value={100} size={100} thickness={4} sx={{ color: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }} />
                                        <CircularProgress
                                            variant="determinate"
                                            value={stats.mem_limit > 0 ? Math.min((stats.mem_usage / stats.mem_limit) * 100, 100) : 0}
                                            size={100} thickness={4}
                                            sx={{ color: 'secondary.main', position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
                                        />
                                        <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                            <Typography variant="h5" component="div" color="text.primary" sx={{ fontWeight: 600, lineHeight: 1 }}>
                                                {stats.mem_limit > 0 ? ((stats.mem_usage / stats.mem_limit) * 100).toFixed(0) : 0}<Typography component="span" variant="caption" sx={{ ml: 0.2 }}>%</Typography>
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Bottom Row: Network Config Cards Horizontal Grid */}
                <Grid item xs={12}>
                    <Grid container spacing={2}>
                        {[
                            { label: 'HTTP服务器', count: stats.network_endpoints.http, color: '#3b82f6' },
                            { label: 'HTTP客户端', count: stats.network_endpoints.http_client, color: '#10b981' },
                            { label: 'WebSocket / Ws服务器', count: stats.network_endpoints.ws, color: '#f59e0b' },
                            { label: 'WebSocket / 反向客户端', count: stats.network_endpoints.ws_client, color: '#8b5cf6' }
                        ].map((net, i) => (
                            <Grid item xs={6} md={3} key={i}>
                                <Card {...baseCardProps} sx={{ ...baseCardProps.sx, height: 'auto', p: 0.5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)' }}>
                                    <CardContent sx={{ p: 2, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', '&:last-child': { pb: 2 } }}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                                {net.label}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.6, mt: -0.5, display: 'block' }}>当前已注册通信实例</Typography>
                                        </Box>
                                        <Typography variant="h4" sx={{ color: net.color, fontWeight: 700 }}>
                                            {net.count}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>
        </Box>
    );
};


// 猫猫日志 Tab
const NapcatLogs = ({ name, node_id }: any) => {
    const [logs, setLogs] = useState("");
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const t = useTranslate();
    const theme = useTheme();

    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/containers/${name}/logs?lines=200&node_id=${node_id}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 3000); // Poll every 3 seconds
        return () => clearInterval(interval);
    }, [name]);

    return (
        <Box sx={{ mt: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={600} display="flex" alignItems="center" gap={1}>
                    <SmartToyIcon color="primary" /> {t('config.realtimeLogs')}
                </Typography>
                <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />} onClick={fetchLogs} disabled={loading} size="small" variant="contained" disableElevation sx={{ borderRadius: 2, textTransform: 'none' }}>
                    {t('config.refresh')}
                </Button>
            </Box>

            <Card variant="outlined" sx={{ borderRadius: 4, flexGrow: 1, display: 'flex', flexDirection: 'column', bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(30,30,30,0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(128,128,128,0.2)', boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 12px 24px rgba(0,0,0,0.15)', overflow: 'hidden', height: '60vh' }}>
                {/* Mac-like Terminal Header */}
                <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)', px: 2, py: 1.5, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff5f56' }} />
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ffbd2e' }} />
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#27c93f' }} />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', ml: 2, fontFamily: 'monospace', flexGrow: 1, textAlign: 'center' }}>bash - docker logs {name}</Typography>
                </Box>

                <Box ref={scrollRef} sx={{
                    flexGrow: 1,
                    p: 3,
                    color: '#e6edf3',
                    fontFamily: "'Fira Code', 'Courier New', monospace",
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: 8 },
                    '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 4, '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }
                }}>
                    {loading && !logs ? <CircularProgress size={24} sx={{ color: '#fff', display: 'block', margin: 'auto' }} /> : (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                            {logs || t('config.noLogs')}
                        </pre>
                    )}
                </Box>
            </Card>
        </Box>
    );
};

// 网络配置 Tab
const NetworkConfig = ({ name, node_id }: any) => {
    const [activeSubTab, setActiveSubTab] = useState(0);
    const [configContent, setConfigContent] = useState<any>({ network: { httpServers: [], httpClients: [], websocketServers: [], websocketClients: [] } });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [advancedMode, setAdvancedMode] = useState(false);
    const [rawText, setRawText] = useState("");
    const theme = useTheme();
    const t = useTranslate();

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/containers/${name}/config/onebot11.json?node_id=${node_id}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'ok') {
                    const parsed = JSON.parse(data.content);
                    if (!parsed.network) {
                        parsed.network = { httpServers: [], httpClients: [], websocketServers: [], websocketClients: [] };
                    }
                    setConfigContent(parsed);
                    setRawText(JSON.stringify(parsed, null, 4));
                } else {
                    const def = { network: { httpServers: [], httpClients: [], websocketServers: [], websocketClients: [] } };
                    setConfigContent(def);
                    setRawText(JSON.stringify(def, null, 4));
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, [name]);

    const handleSave = async () => {
        setSaving(true);
        let toSave = '';
        if (advancedMode) {
            toSave = rawText;
            try {
                // If in advanced mode, format check and sync back
                setConfigContent(JSON.parse(rawText));
            } catch (e) {
                alert("Invalid JSON format");
                setSaving(false);
                return;
            }
        } else {
            toSave = JSON.stringify(configContent, null, 4);
            setRawText(toSave);
        }

        try {
            await fetch(`/api/containers/${name}/config/onebot11.json?node_id=${node_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: toSave })
            });
            fetchConfig();
            alert(t('config.saveSuccess'));
        } catch (e) {
            alert(t('config.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const tabKeys = ['websocketServers', 'websocketClients', 'httpServers', 'httpClients'];
    const currentKey = tabKeys[activeSubTab];
    const itemsList = configContent.network?.[currentKey] || [];

    const updateItem = (index: number, field: string, value: any) => {
        const newArray = [...itemsList];
        newArray[index] = { ...newArray[index], [field]: value };
        setConfigContent((prev: any) => ({
            ...prev,
            network: {
                ...prev.network,
                [currentKey]: newArray
            }
        }));
    };

    const addItem = () => {
        const newArray = [...itemsList];
        const baseItem: any = {
            name: `new-item-${Date.now()}`,
            enable: true,
            debug: false
        };
        if (currentKey.includes('Server')) {
            baseItem.port = 3000;
            baseItem.host = "0.0.0.0";
        }
        if (currentKey.includes('Client')) {
            baseItem.url = "http://127.0.0.1";
        }
        if (currentKey.includes('http')) {
            baseItem.messagePostFormat = 'array';
            baseItem.token = '';
            baseItem.secret = '';
        }
        if (currentKey.includes('websocket')) {
            baseItem.messagePostFormat = 'array';
            baseItem.token = '';
        }

        newArray.push(baseItem);
        setConfigContent((prev: any) => ({
            ...prev,
            network: {
                ...prev.network,
                [currentKey]: newArray
            }
        }));
    };

    const removeItem = (index: number) => {
        const newArray = [...itemsList];
        newArray.splice(index, 1);
        setConfigContent((prev: any) => ({
            ...prev,
            network: {
                ...prev.network,
                [currentKey]: newArray
            }
        }));
    };

    return (
        <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', mb: 3, gap: 2 }}>
                <Tabs value={activeSubTab} onChange={(_: any, v: any) => setActiveSubTab(v)} textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons="auto">
                    <Tab label={t('config.wsServer')} />
                    <Tab label={t('config.wsClient')} />
                    <Tab label={t('config.httpServer')} />
                    <Tab label={t('config.httpClient')} />
                </Tabs>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Button variant="outlined" onClick={() => {
                        if (advancedMode) fetchConfig(); else setRawText(JSON.stringify(configContent, null, 4));
                        setAdvancedMode(!advancedMode);
                    }}>
                        {advancedMode ? t('config.toggleGui') : t('config.toggleSource')}
                    </Button>
                    <Button variant="contained" disabled={loading || saving} onClick={handleSave} startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}>{t('config.saveConfig')}</Button>
                </Box>
            </Box>

            {loading ? <CircularProgress /> : advancedMode ? (
                <TextField
                    multiline fullWidth minRows={20}
                    value={rawText} onChange={e => setRawText(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace', bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8fafc' } }}
                />
            ) : (
                <Box>
                    <Box sx={{ mb: 2 }}>
                        <Button variant="outlined" color="primary" onClick={addItem}>+ 添加预设 ({currentKey})</Button>
                    </Box>
                    {itemsList.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center', opacity: 0.6 }}>
                            <Typography>未配置 {currentKey}</Typography>
                        </Paper>
                    ) : (
                        <Grid container spacing={3}>
                            {itemsList.map((item: any, index: number) => (
                                <Grid item xs={12} lg={6} key={index}>
                                    <Card variant="outlined" sx={{ borderRadius: 4, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(128,128,128,0.1)', boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 12px rgba(0,0,0,0.05)' }}>
                                        <CardContent sx={{ p: { xs: 3, md: 4 }, position: 'relative' }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                                <Typography variant="h6" display="flex" alignItems="center" gap={1} fontWeight={600}>
                                                    <RouterIcon color={item.enable ? "primary" : "disabled"} />
                                                    {item.name || `未命名节点 ${index + 1}`}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: item.enable ? (theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.2)' : 'rgba(76, 175, 80, 0.15)') : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'), px: 1.5, py: 0.5, borderRadius: 3 }}>
                                                        <Typography variant="caption" sx={{ color: item.enable ? 'success.main' : 'text.disabled', fontWeight: 600 }}>{item.enable ? '已启用运行' : '通讯已停用'}</Typography>
                                                        <Switch size="small" checked={item.enable || false} onChange={e => updateItem(index, 'enable', e.target.checked)} color="success" sx={{ mr: -1 }} />
                                                    </Box>
                                                    <IconButton size="small" color="error" onClick={() => removeItem(index)} sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(244, 67, 54, 0.1)', color: 'error.main', '&:hover': { bgcolor: 'error.main', color: 'white' }, width: 32, height: 32 }}>
                                                        <DeleteOutlineIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </Box>

                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                                {item.name !== undefined && <TextField label="关联配置别名 (Name)" size="small" fullWidth value={item.name} onChange={e => updateItem(index, 'name', e.target.value)} />}

                                                <Grid container spacing={2}>
                                                    {item.host !== undefined && <Grid item xs={12} sm={8}><TextField label="挂载主机地址 (Host)" size="small" fullWidth value={item.host} onChange={e => updateItem(index, 'host', e.target.value)} /></Grid>}
                                                    {item.port !== undefined && <Grid item xs={12} sm={4}><TextField label="监听端口" type="number" size="small" fullWidth value={item.port} onChange={e => updateItem(index, 'port', parseInt(e.target.value) || 0)} /></Grid>}
                                                    {item.url !== undefined && <Grid item xs={12}><TextField label="目标连接地址 (URL)" size="small" fullWidth value={item.url} onChange={e => updateItem(index, 'url', e.target.value)} /></Grid>}
                                                </Grid>

                                                <Grid container spacing={2}>
                                                    {item.token !== undefined && <Grid item xs={12} sm={item.secret !== undefined ? 6 : 12}><TextField label="访问鉴权令牌 (Token)" size="small" fullWidth value={item.token} onChange={e => updateItem(index, 'token', e.target.value)} placeholder={t('config.tokenPlaceholder')} /></Grid>}
                                                    {item.secret !== undefined && <Grid item xs={12} sm={6}><TextField label="数据签名密钥 (Secret)" size="small" fullWidth value={item.secret} onChange={e => updateItem(index, 'secret', e.target.value)} /></Grid>}
                                                </Grid>

                                                <Divider sx={{ my: 1, borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />

                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Box>
                                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>通讯调试模式 (Debug)</Typography>
                                                        <Typography variant="caption" color="text.secondary">在日志中输出该节点的详细收发包信息</Typography>
                                                    </Box>
                                                    <Switch size="small" checked={item.debug || false} onChange={e => updateItem(index, 'debug', e.target.checked)} color="secondary" />
                                                </Box>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    )}
                </Box>
            )}
        </Box>
    );
};


// 文件管理 Tab
const FileManager = ({ name, node_id }: any) => {
    const [files, setFiles] = useState<any[]>([]);
    const [folders, setFolders] = useState<any[]>([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [savingFile, setSavingFile] = useState(false);
    const t = useTranslate();
    const theme = useTheme();

    const loadFiles = async (pathStr = currentPath) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/containers/${name}/files?path=${encodeURIComponent(pathStr)}&node_id=${node_id}`);
            if (res.ok) {
                const data = await res.json();
                setFiles(data.files || []);
                setFolders(data.folders || []);
                setCurrentPath(data.current_path || '');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = async (filename: string) => {
        const fullPath = currentPath ? `${currentPath}/${filename}` : filename;
        setLoading(true);
        try {
            const res = await fetch(`/api/containers/${name}/config/${encodeURIComponent(fullPath)}?node_id=${node_id}`);
            if (res.ok) {
                const data = await res.json();
                setEditContent(data.content || '');
                setEditingFile(fullPath);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveFile = async () => {
        if (!editingFile) return;
        setSavingFile(true);
        try {
            const res = await fetch(`/api/containers/${name}/config/${encodeURIComponent(editingFile)}?node_id=${node_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent })
            });
            if (res.ok) {
                setEditingFile(null);
                loadFiles(currentPath);
            } else {
                alert("Save failed");
            }
        } catch (e) {
            console.error(e);
            alert("Save failed");
        } finally {
            setSavingFile(false);
        }
    };

    const handleFolderClick = (folderName: string) => {
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        loadFiles(newPath);
    };

    const handleUpFolder = () => {
        if (!currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        loadFiles(parts.join('/'));
    };

    useEffect(() => {
        loadFiles();
    }, [name]);

    return (
        <Box sx={{ mt: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={600} display="flex" alignItems="center" gap={1}>
                    <InsertDriveFileIcon color="primary" /> {t('config.configFileList')} {currentPath ? `/ ${currentPath}` : ''}
                </Typography>
                <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />} onClick={() => loadFiles(currentPath)} disabled={loading} size="small" variant="contained" disableElevation sx={{ borderRadius: 2, textTransform: 'none' }}>
                    {t('config.refreshDir')}
                </Button>
            </Box>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 4, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(128,128,128,0.1)', boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Table size="medium" sx={{ minWidth: 600 }}>
                    <TableHead>
                        <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)' }}>
                            <TableCell sx={{ fontWeight: 600, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>{t('config.fileName')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>{t('config.fileSize')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>{t('config.lastModified')}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>{t('config.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}><CircularProgress size={24} /></TableCell></TableRow>
                        ) : files.length === 0 && folders.length === 0 && !currentPath ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3 }}>{t('config.noFiles')}</TableCell></TableRow>
                        ) : (
                            <>
                                {currentPath && (
                                    <TableRow hover onClick={handleUpFolder} sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}>
                                        <TableCell colSpan={4} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                            <ArrowUpwardIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                            <Typography variant="body2" fontWeight={600}>..</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {folders.map(f => (
                                    <TableRow key={`dir-${f.name}`} hover onClick={() => handleFolderClick(f.name)} sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}>
                                        <TableCell colSpan={4} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                            <FolderIcon fontSize="small" sx={{ color: '#fbbf24' }} />
                                            <Typography variant="body2" fontWeight={600}>{f.name}</Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {files.map(f => (
                                    <TableRow key={`file-${f.name}`} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                            <InsertDriveFileIcon fontSize="small" sx={{ color: 'primary.main' }} />
                                            <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }}>{f.name}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}><Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{(f.size / 1024).toFixed(2)} KB</Typography></TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}><Typography variant="body2" color="text.secondary">{new Date(f.mtime * 1000).toLocaleString()}</Typography></TableCell>
                                        <TableCell align="right" sx={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                            <Button size="small" variant="outlined" sx={{ borderRadius: 2, textTransform: 'none', px: 2 }} onClick={() => handleEdit(f.name)}>编辑</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={!!editingFile} onClose={() => setEditingFile(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 4, bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)' } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    编辑文件 / {editingFile}
                </DialogTitle>
                <DialogContent dividers>
                    <TextField
                        multiline fullWidth minRows={20}
                        value={editContent} onChange={e => setEditContent(e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace', bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8fafc' } }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setEditingFile(null)} color="inherit">取消</Button>
                    <Button onClick={handleSaveFile} disabled={savingFile} variant="contained" sx={{ px: 4, borderRadius: 2 }}>
                        {savingFile ? '保存中...' : '保存修改'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default function ConfigEditor() {
    const { name, node_id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(0);
    const t = useTranslate();

    return (
        <Box sx={{ p: { xs: 2, md: 4, lg: 6 }, maxWidth: 1400, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 2 }}>
                <IconButton onClick={() => navigate('/admin')} sx={{ border: '1px solid', borderColor: 'divider' }}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {name}
                </Typography>
            </Box>

            {/* 顶部主分栏区 - 仿照原生 UI */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                    <Tab label={t('config.basicInfo')} sx={{ fontSize: '1.05rem', py: 2 }} />
                    <Tab label={t('config.networkConfig')} sx={{ fontSize: '1.05rem', py: 2 }} />
                    <Tab label={t('config.fileManager')} sx={{ fontSize: '1.05rem', py: 2 }} />
                    <Tab label={t('config.napcatLogs')} sx={{ fontSize: '1.05rem', py: 2 }} />
                </Tabs>
            </Box>

            <Box sx={{ py: 2 }}>
                {activeTab === 0 && <BasicInfo name={name} node_id={node_id} />}
                {activeTab === 1 && <NetworkConfig name={name} node_id={node_id} />}
                {activeTab === 2 && <FileManager name={name} node_id={node_id} />}
                {activeTab === 3 && <NapcatLogs name={name} node_id={node_id} />}
            </Box>
        </Box>
    );
}
