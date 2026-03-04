import { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField, Skeleton, IconButton, useTheme, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import HubIcon from '@mui/icons-material/Hub';
import RefreshIcon from '@mui/icons-material/Refresh';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import TerminalIcon from '@mui/icons-material/Terminal';
import LinearProgress from '@mui/material/LinearProgress';

export default function Nodes() {
    const navigate = useNavigate();
    const theme = useTheme();
    const [loading, setLoading] = useState(true);
    const [nodes, setNodes] = useState<any[]>([]);
    const [openDialog, setOpenDialog] = useState(false);

    // form state
    const [editNodeId, setEditNodeId] = useState<string | null>(null);
    const [nodeName, setNodeName] = useState('');
    const [nodeAddress, setNodeAddress] = useState('');
    const [nodeApiKey, setNodeApiKey] = useState('');

    const fetchNodes = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/nodes', { credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            const data = await res.json();
            if (data.status === 'ok') {
                setNodes(data.nodes || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNodes();
    }, []);

    const handleOpenAdd = () => {
        setEditNodeId(null);
        setNodeName('');
        setNodeAddress('127.0.0.1:8000');
        setNodeApiKey('');
        setOpenDialog(true);
    };

    const handleOpenEdit = (node: any) => {
        setEditNodeId(node.id);
        setNodeName(node.name);
        setNodeAddress(node.address);
        setNodeApiKey(''); // Don't show existing key 
        setOpenDialog(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`确定要删除节点 ${name} 吗？`)) return;
        try {
            const res = await fetch(`/api/nodes/${id}`, { method: 'DELETE', credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            fetchNodes();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        try {
            const payload = {
                name: nodeName,
                address: nodeAddress,
                api_key: nodeApiKey
            };
            let res;
            if (editNodeId) {
                res = await fetch(`/api/nodes/${editNodeId}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/nodes', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (res.status === 401) { navigate('/login'); return; }
            setOpenDialog(false);
            fetchNodes();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <Box sx={{ p: { xs: 3, md: 6 }, maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>管理面板 / 节点</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HubIcon sx={{ color: '#3b82f6' }} /> 远程节点列表
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Button variant="outlined" color="inherit" onClick={fetchNodes} startIcon={<RefreshIcon />} sx={{ borderRadius: 2, height: 38, borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                            刷新
                        </Button>
                        <Button variant="contained" onClick={handleOpenAdd} startIcon={<AddIcon />} sx={{ borderRadius: 2, background: '#2563eb', height: 38, px: 3, boxShadow: 'none', '&:hover': { background: '#1d4ed8', boxShadow: 'none' } }}>
                            新增节点
                        </Button>
                        <Button variant="outlined" color="inherit" sx={{ borderRadius: 2, height: 38, borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                            使用手册
                        </Button>
                    </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 3, maxWidth: 600, lineHeight: 1.6 }}>
                    远程节点上的应用实例的控制台，文件上传，文件下载都需要网页能够直接连接远程节点。
                    因此必须避免使用除 localhost 外的局域网段任何 IP，必须使用外网 IP 或域名进行连接。
                </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 3 }}>
                {loading ? (
                    [...Array(2)].map((_, i) => <Skeleton key={i} variant="rounded" height={300} sx={{ borderRadius: 3 }} />)
                ) : nodes.map(node => (
                    <Box key={node.id} sx={{ borderRadius: 3, background: theme.palette.mode === 'dark' ? 'rgba(45, 45, 50, 0.4)' : '#fff', border: `1px solid ${theme.palette.divider}`, overflow: 'hidden', transition: 'all 0.3s', '&:hover': { border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' } }}>
                        <Box sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <DesktopWindowsIcon fontSize="small" color="action" /> {node.name}
                                    {node.id === 'local' && (
                                        <Box component="span" sx={{ fontSize: '0.65rem', bgcolor: '#3b82f6', color: '#fff', px: 0.8, py: 0.2, borderRadius: 1, ml: 1 }}>
                                            LOCAL
                                        </Box>
                                    )}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                    <IconButton size="small" title="文件管理" onClick={() => navigate(`/admin?node=${node.id}`)}><FolderOpenIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" title="控制台" onClick={() => navigate(`/admin?node=${node.id}`)}><TerminalIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" title="节点设置" onClick={() => handleOpenEdit(node)}><SettingsIcon fontSize="small" /></IconButton>
                                    {node.id !== 'local' && (
                                        <IconButton size="small" title="删除节点" onClick={() => handleDelete(node.id, node.name)} color="error"><DeleteOutlineIcon fontSize="small" /></IconButton>
                                    )}
                                </Box>
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">连接地址</Typography>
                                    <Typography variant="body2">{node.address}</Typography>
                                </Box>
                                {node.api_key && (
                                    <Box sx={{ gridColumn: 'span 2' }}>
                                        <Typography variant="caption" color="text.secondary" display="block">唯一标识 / 节点指纹 (API Key)</Typography>
                                        <Typography variant="body2" sx={{ filter: 'blur(3px)', transition: '0.3s', cursor: 'pointer', '&:hover': { filter: 'blur(0)' } }} title="悬停查看">{node.api_key}</Typography>
                                    </Box>
                                )}
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">节点状态</Typography>
                                    <Typography variant="body2" sx={{ color: node.status === 'online' ? '#10b981' : '#f43f5e', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: node.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                        {node.status === 'online' ? '在线' : '离线'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">网页直连</Typography>
                                    <Typography variant="body2" sx={{ color: node.status === 'online' ? '#10b981' : '#f43f5e', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: node.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                        {node.status === 'online' ? '正常' : '不可达'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">延迟</Typography>
                                    <Typography variant="body2" sx={{ color: node.ping < 100 ? '#10b981' : (node.ping < 300 ? '#f59e0b' : '#f43f5e') }}>
                                        {node.status === 'online' ? `${node.ping}ms` : '-'}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">平台</Typography>
                                    <Typography variant="body2">{node.system?.platform || '-'} / {node.system?.python_version || '-'}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">负载 (CPU / MEM)</Typography>
                                    <Typography variant="body2">{node.system?.cpu_percent?.toFixed(1) || 0}% / {node.system?.mem_percent?.toFixed(1) || 0}%</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">实例状态</Typography>
                                    <Typography variant="body2">{node.instances?.running || 0} / {node.instances?.total || 0}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">核心版本</Typography>
                                    <Typography variant="body2" sx={{ color: '#10b981' }}>{node.system?.python_version ? `v${node.system?.python_version}` : '-'}</Typography>
                                </Box>
                                <Box sx={{ gridColumn: 'span 2' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">Node ID</Typography>
                                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#3b82f6', cursor: 'pointer' }}>
                                        {node.id}... <ContentCopyIcon sx={{ fontSize: 12 }} />
                                    </Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', gap: 4 }}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>CPU 使用率</Typography>
                                    <LinearProgress variant="determinate" value={node.system?.cpu_percent || 0} sx={{
                                        height: 6, borderRadius: 3, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: node.system?.cpu_percent > 80 ? '#f43f5e' : (node.system?.cpu_percent > 50 ? '#f59e0b' : '#3b82f6') }
                                    }} />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>内存使用率</Typography>
                                    <LinearProgress variant="determinate" value={node.system?.mem_percent || 0} sx={{
                                        height: 6, borderRadius: 3, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                        '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: node.system?.mem_percent > 80 ? '#f43f5e' : (node.system?.mem_percent > 50 ? '#f59e0b' : '#10b981') }
                                    }} />
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                ))}
            </Box>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none', bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff' } }}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
                    <SettingsIcon color="primary" /> {editNodeId ? '编辑节点信息' : '新增节点配置'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>备注信息 *</Typography>
                            <TextField fullWidth size="small" placeholder="机器人" value={nodeName} onChange={e => setNodeName(e.target.value)} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>远程节点连接地址 *</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                必须使用外网地址或 localhost 地址，否则将导致远程实例无法连接。包含端口号。
                            </Typography>
                            <TextField fullWidth size="small" placeholder="127.0.0.1:8000" value={nodeAddress} onChange={e => setNodeAddress(e.target.value)} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>唯一标识 / 节点指纹 (API Key)</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                通过远程节点生成的密钥来认证身份，以确保多台机器集成工作的安全性。
                            </Typography>
                            <TextField fullWidth size="small" type="password" placeholder="填写远程节点指纹" value={nodeApiKey} onChange={e => setNodeApiKey(e.target.value)} />
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3, pt: 0 }}>
                    <Button onClick={() => setOpenDialog(false)} color="inherit" sx={{ borderRadius: 2 }}>取消</Button>
                    <Button variant="contained" onClick={handleSave} disabled={!nodeName || !nodeAddress} sx={{ borderRadius: 2, boxShadow: 'none' }}>保存节点</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
