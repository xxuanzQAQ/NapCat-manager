import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, TextField, Skeleton, IconButton, useTheme,
    Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
    Collapse, FormControlLabel, Checkbox, Chip, Divider, Pagination
} from '@mui/material';
import { useNavigate, useOutletContext } from 'react-router-dom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import NapCatIcon from '../components/NapCatIcon';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslate } from '../i18n';

export default function Dashboard() {
    const navigate = useNavigate();
    const theme = useTheme();
    const t = useTranslate();
    const [containers, setContainers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [nodes, setNodes] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState('local');

    // 批量操作状态
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [selectedContainers, setSelectedContainers] = useState<string[]>([]);

    // 分页状态
    const [page, setPage] = useState(1);
    const rowsPerPage = 12;
    const filteredContainers = selectedNode === 'all' ? containers : containers.filter(c => c.node_id === selectedNode);
    const totalPages = Math.ceil(filteredContainers.length / rowsPerPage);
    const displayedContainers = filteredContainers.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const handleSelectAll = () => {
        if (selectedContainers.length === filteredContainers.length) {
            setSelectedContainers([]);
        } else {
            setSelectedContainers(filteredContainers.map(c => c.name));
        }
    };

    // 监听退出批量模式时清空选项
    useEffect(() => {
        if (!isBatchMode) setSelectedContainers([]);
    }, [isBatchMode]);

    const handleBatchSelect = (name: string) => {
        setSelectedContainers(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        );
    };

    const handleBatchAction = async (action: string) => {
        if (selectedContainers.length === 0) return;

        try {
            await Promise.all(
                selectedContainers.map(name =>
                    fetch(`/api/containers/${name}/action?action=${action}&node_id=${selectedNode}`, { method: 'POST', credentials: 'include' })
                        .then(res => { if (res.status === 401) navigate('/login'); })
                )
            );
            fetchContainers();
            if (context?.fetchContainers) context.fetchContainers();
            setIsBatchMode(false);
        } catch (e) { console.error(e); }
    };
    const [openCreate, setOpenCreate] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', docker_image: '', webui_port: 0, http_port: 0, ws_port: 0,
        memory_limit: 0, restart_policy: 'always', network_mode: 'bridge', env_vars: ''
    });

    // 删除确认对话框状态
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; name: string; node_id: string; deleteData: boolean }>({
        open: false, name: '', node_id: 'local', deleteData: false
    });

    const context = useOutletContext<{ fetchContainers?: () => void }>();

    const fetchNodes = async () => {
        try {
            const res = await fetch('/api/nodes', { credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            const data = await res.json();
            if (data.status === 'ok') {
                setNodes(data.nodes || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchContainers = async () => {
        try {
            const res = await fetch('/api/containers', { credentials: 'include' });
            if (res.status === 401) {
                navigate('/login');
                return;
            }
            const data = await res.json();
            const fetchedContainers = data.containers || [];
            setContainers(fetchedContainers);

            // Fetch stats for running containers to get QQ avatar (uin)
            fetchedContainers.forEach(async (c: any) => {
                if (c.status === 'running') {
                    try {
                        const statsRes = await fetch(`/api/containers/${c.name}/stats?node_id=${c.node_id}`, { credentials: 'include' });
                        if (statsRes.ok) {
                            const statsData = await statsRes.json();
                            if (statsData.uin && statsData.uin !== '未登录 / Not Logged In') {
                                setContainers(prev => prev.map(container =>
                                    (container.name === c.name && container.node_id === c.node_id)
                                    ? { ...container, uin: statsData.uin }
                                    : container
                                ));
                            }
                        }
                    } catch (e) {
                        // ignore error for stats fetch
                    }
                }
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContainers();
        fetchNodes();

        // Handle initial node selection from URL
        const params = new URLSearchParams(window.location.search);
        const nodeParam = params.get('node');
        if (nodeParam) {
            setSelectedNode(nodeParam);
        }

        const interval = setInterval(fetchContainers, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleAction = async (e: React.MouseEvent, name: string, action: string, node_id: string = 'local') => {
        if (e) e.stopPropagation();
        if (action === 'delete') {
            setDeleteDialog({ open: true, name, node_id, deleteData: false });
            return;
        }
        try {
            const res = await fetch(`/api/containers/${name}/action?action=${action}&node_id=${node_id}`, { method: 'POST', credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            if (res.ok) {
                fetchContainers();
                if (context?.fetchContainers) context.fetchContainers();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const confirmDelete = async () => {
        const { name, node_id, deleteData } = deleteDialog;
        try {
            const res = await fetch(`/api/containers/${name}/action?action=delete&node_id=${node_id}&delete_data=${deleteData}`, {
                method: 'POST', credentials: 'include'
            });
            if (res.status === 401) { navigate('/login'); return; }
            if (res.ok) {
                fetchContainers();
                if (context?.fetchContainers) context.fetchContainers();
            }
        } catch (e) { console.error(e); }
        setDeleteDialog({ open: false, name: '', node_id: 'local', deleteData: false });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.name) return;
        const body: any = { name: createForm.name, node_id: selectedNode === 'all' ? 'local' : selectedNode };
        if (showAdvanced) {
            if (createForm.docker_image) body.docker_image = createForm.docker_image;
            if (createForm.webui_port > 0) body.webui_port = createForm.webui_port;
            if (createForm.http_port > 0) body.http_port = createForm.http_port;
            if (createForm.ws_port > 0) body.ws_port = createForm.ws_port;
            if (createForm.memory_limit > 0) body.memory_limit = createForm.memory_limit;
            body.restart_policy = createForm.restart_policy;
            body.network_mode = createForm.network_mode;
            if (createForm.env_vars.trim()) body.env_vars = createForm.env_vars.split('\n').filter(Boolean);
        }
        try {
            const res = await fetch('/api/containers', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.status === 401) { navigate('/login'); return; }
            if (res.ok) {
                setCreateForm({ name: '', docker_image: '', webui_port: 0, http_port: 0, ws_port: 0, memory_limit: 0, restart_policy: 'always', network_mode: 'bridge', env_vars: '' });
                setOpenCreate(false);
                setShowAdvanced(false);
                fetchContainers();
                if (context?.fetchContainers) context.fetchContainers();
            }
        } catch (e) { console.error(e); }
    };

    return (
        <Box sx={{ p: { xs: 3, md: 6 }, pt: 2, maxWidth: 1200, mx: 'auto' }}>
            {/* Fleet Title and Top Right Actions */}
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                        {t('admin.instances').toUpperCase()}
                    </Typography>
                </Box>
                <Button
                    variant="text"
                    size="small"
                    onClick={() => navigate('/admin/cluster-settings')}
                    startIcon={<SettingsIcon fontSize="small" />}
                    sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.75rem', '&:hover': { bgcolor: 'rgba(37,99,235,0.05)' } }}
                >
                    实例初始化设置
                </Button>
            </Box>

            {/* Header Toolbar */}
            <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    {isBatchMode ? (
                        <>
                            <Button variant="outlined" color="primary" onClick={handleSelectAll} sx={{ borderRadius: 2, height: 38 }}>
                                {selectedContainers.length === containers.length ? '取消全选' : '全选'}
                            </Button>
                            <Button variant="outlined" color="inherit" onClick={() => setIsBatchMode(false)} sx={{ borderRadius: 2, height: 38 }}>
                                取消
                            </Button>
                            <Button variant="contained" color="success" onClick={() => handleBatchAction('start')} disabled={selectedContainers.length === 0} sx={{ borderRadius: 2, height: 38 }}>
                                启动
                            </Button>
                            <Button variant="contained" color="warning" onClick={() => handleBatchAction('stop')} disabled={selectedContainers.length === 0} sx={{ borderRadius: 2, height: 38 }}>
                                停止
                            </Button>
                            <Button variant="contained" color="error" onClick={() => handleBatchAction('delete')} disabled={selectedContainers.length === 0} sx={{ borderRadius: 2, height: 38 }}>
                                删除
                            </Button>
                            <Typography variant="body2" sx={{ ml: 1 }}>已选 {selectedContainers.length} 项</Typography>
                        </>
                    ) : (
                        <Button variant="outlined" color="inherit" onClick={() => setIsBatchMode(true)} sx={{ borderRadius: 2, height: 38, fontSize: '0.875rem', color: 'text.primary', borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff', whiteSpace: 'nowrap' }}>
                            批量操作
                        </Button>
                    )}
                    <IconButton onClick={fetchContainers} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: 38, width: 38, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                    <Button variant="contained" onClick={() => setOpenCreate(true)} startIcon={<AddIcon />} sx={{ borderRadius: 2, background: '#2563eb', height: 38, px: 3, fontSize: '0.875rem', whiteSpace: 'nowrap', boxShadow: 'none', '&:hover': { background: '#1d4ed8', boxShadow: 'none' } }}>
                        新建实例
                    </Button>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Select
                        size="small"
                        value={selectedNode}
                        onChange={(e) => setSelectedNode(e.target.value)}
                        sx={{ minWidth: 220, height: 38, borderRadius: 2, fontSize: '0.875rem', borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}
                    >
                        <MenuItem value="all">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                所有节点
                            </Box>
                        </MenuItem>
                        {nodes.map((node: any) => (
                            <MenuItem key={node.id} value={node.id}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: node.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                    {node.name} - {node.address}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 3 }}>
                {loading ? [...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={200} sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 3 }} />)
                    : containers.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1', p: 8, textAlign: 'center', borderRadius: 3, border: `1px dashed ${theme.palette.divider}`, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                            <Typography color="text.secondary">{t('admin.noEnv')}</Typography>
                        </Box>
                    ) : displayedContainers.map(c => (
                        <Box key={c.id} onClick={(e) => {
                            if (isBatchMode) {
                                e.stopPropagation();
                                handleBatchSelect(c.name);
                            } else {
                                navigate(`/admin/config/${c.node_id}/${c.name}`);
                            }
                        }} sx={{ position: 'relative', cursor: 'pointer', borderRadius: 3, background: theme.palette.mode === 'dark' ? 'rgba(45, 45, 50, 0.4)' : '#fff', border: `1px solid ${selectedContainers.includes(c.name) ? '#3b82f6' : theme.palette.divider}`, overflow: 'hidden', transition: 'all 0.3s', '&:hover': { border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' } }}>
                            {isBatchMode && (
                                <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                                    <Checkbox checked={selectedContainers.includes(c.name)} onChange={() => handleBatchSelect(c.name)} onClick={e => e.stopPropagation()} />
                                </Box>
                            )}
                            <Box sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ p: 0.5, borderRadius: 2, background: theme.palette.mode === 'dark' ? 'linear-gradient(135deg, #1e293b, #000)' : 'linear-gradient(135deg, #e0f2fe, #f0f9ff)', border: `1px solid ${theme.palette.divider}`, display: 'flex' }}>
                                        {c.uin && c.uin !== '未登录 / Not Logged In' ? (
                                            <Box component="img" src={`https://q1.qlogo.cn/g?b=qq&nk=${String(c.uin).replace(/\D/g, '')}&s=640`} sx={{ width: 35, height: 35, borderRadius: 1.5 }} />
                                        ) : (
                                            <NapCatIcon fontSize="large" />
                                        )}
                                    </Box>
                                    {c.status === 'running' ? (
                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, borderRadius: 8, bgcolor: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600, mr: isBatchMode ? 4 : 0 }}>
                                            <Box sx={{ width: 6, height: 6, bgcolor: '#10b981', borderRadius: '50%' }} /> {t('admin.online')}
                                        </Typography>
                                    ) : (
                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, borderRadius: 8, bgcolor: 'rgba(100,116,139,0.1)', color: theme.palette.text.secondary, border: '1px solid rgba(100,116,139,0.2)', fontWeight: 600, mr: isBatchMode ? 4 : 0 }}>
                                            <Box sx={{ width: 6, height: 6, bgcolor: '#64748b', borderRadius: '50%' }} /> {c.status.toUpperCase()}
                                        </Typography>
                                    )}
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }} noWrap>{c.name}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>ID: {c.id}</Typography>
                            </Box>

                            {!isBatchMode && (
                                <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8fafc', borderTop: `1px solid ${theme.palette.divider}`, p: 2, display: 'flex', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        {c.status === 'running' && (
                                            <>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'pause', c.node_id)} sx={{ color: '#f59e0b', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><PauseIcon fontSize="small" /></IconButton>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'stop', c.node_id)} sx={{ color: '#ef4444', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><StopIcon fontSize="small" /></IconButton>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'restart', c.node_id)} sx={{ color: '#3b82f6', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><RefreshIcon fontSize="small" /></IconButton>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'kill', c.node_id)} sx={{ color: '#b91c1c', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><PowerSettingsNewIcon fontSize="small" /></IconButton>
                                            </>
                                        )}
                                        {c.status === 'paused' && (
                                            <>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'unpause', c.node_id)} sx={{ color: '#10b981', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><PlayArrowIcon fontSize="small" /></IconButton>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'stop', c.node_id)} sx={{ color: '#ef4444', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><StopIcon fontSize="small" /></IconButton>
                                                <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'kill', c.node_id)} sx={{ color: '#b91c1c', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><PowerSettingsNewIcon fontSize="small" /></IconButton>
                                            </>
                                        )}
                                        {(c.status === 'exited' || c.status === 'created' || c.status === 'dead') && (
                                            <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'start', c.node_id)} sx={{ color: '#10b981', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><PlayArrowIcon fontSize="small" /></IconButton>
                                        )}
                                    </Box>
                                    <IconButton size="small" onClick={(e) => handleAction(e, c.name, 'delete', c.node_id)} sx={{ color: '#ef4444', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                                </Box>
                            )}
                        </Box>
                    ))}
            </Box>

            {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <Pagination
                        count={totalPages}
                        page={page}
                        onChange={(_, value) => setPage(value)}
                        color="primary"
                        shape="rounded"
                    />
                </Box>
            )}

            {/* 创建实例对话框 - 简洁版 */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>新建实例</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        输入实例名称即可快速创建，端口将自动从初始化设置的基础端口递增分配（跳过已占用端口）。
                    </Typography>
                    <TextField
                        autoFocus fullWidth size="small" label="实例名称"
                        placeholder="ncqq-bot-1"
                        value={createForm.name}
                        onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    {nodes.length > 1 && (
                        <Select fullWidth size="small" value={selectedNode} onChange={e => setSelectedNode(e.target.value)}
                            sx={{ mb: 2, borderRadius: 2 }}>
                            {nodes.map((n: any) => (
                                <MenuItem key={n.id} value={n.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: n.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                        {n.name}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    )}
                    <Typography variant="caption" color="text.secondary">
                        数据目录：data/{createForm.name || '<实例名>'}/  ·  镜像/端口等默认参数在「实例初始化设置」中配置
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setOpenCreate(false)} color="inherit" sx={{ borderRadius: 2 }}>取消</Button>
                    <Button onClick={handleCreate} disabled={!createForm.name} variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#2563eb' }}>快速创建</Button>
                </DialogActions>
            </Dialog>

            {/* 删除确认对话框 - 二次确认 + 可选删除数据 */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    确认删除实例
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        即将删除实例 <strong>{deleteDialog.name}</strong>，此操作将停止并移除 Docker 容器。
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={deleteDialog.deleteData}
                                onChange={e => setDeleteDialog({ ...deleteDialog, deleteData: e.target.checked })}
                                color="error"
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>同时删除本地数据</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    删除 data/{deleteDialog.name}/ 下所有文件（QQ数据、配置、插件、缓存），不可恢复
                                </Typography>
                            </Box>
                        }
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} color="inherit" sx={{ borderRadius: 2 }}>取消</Button>
                    <Button onClick={confirmDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {deleteDialog.deleteData ? '删除实例和数据' : '仅删除实例'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
