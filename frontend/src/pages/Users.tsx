import { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField, Skeleton, IconButton, useTheme, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import SettingsIcon from '@mui/icons-material/Settings';

export default function Users() {
    const navigate = useNavigate();
    const theme = useTheme();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<any[]>([]);
    const [allContainers, setAllContainers] = useState<any[]>([]);
    
    // UI state
    const [openDialog, setOpenDialog] = useState(false);
    const [openInstancesDialog, setOpenInstancesDialog] = useState(false);
    const [editUuid, setEditUuid] = useState<string | null>(null);

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [permission, setPermission] = useState(1);
    
    // Assign instances state
    const [assignTargetUuid, setAssignTargetUuid] = useState<string | null>(null);
    const [selectedInstances, setSelectedInstances] = useState<string[]>([]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/users', { credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            const data = await res.json();
            if (data.status === 'ok') {
                setUsers(data.data || []);
            }
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchContainers = async () => {
        try {
            const res = await fetch('/api/containers', { credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            const data = await res.json();
            if (data.status === 'ok') {
                setAllContainers(data.containers || []);
            } else if (data.containers) {
                setAllContainers(data.containers);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchUsers();
        fetchContainers();
    }, []);

    const handleOpenAdd = () => {
        setEditUuid(null);
        setUsername('');
        setPassword('');
        setPermission(1);
        setOpenDialog(true);
    };

    const handleOpenEdit = (u: any) => {
        setEditUuid(u.uuid);
        setUsername(u.userName);
        setPassword('');
        setPermission(u.permission);
        setOpenDialog(true);
    };

    const handleOpenAssign = (u: any) => {
        setAssignTargetUuid(u.uuid);
        const insts = (u.instances || []).map((i: any) => `${i.node_id}/${i.container_name}`);
        setSelectedInstances(insts);
        setOpenInstancesDialog(true);
    };

    const handleSaveUser = async () => {
        try {
            let res;
            if (editUuid) {
                const payload: any = { userName: username, permission };
                if (password) payload.passWord = password;
                res = await fetch(`/api/users/${editUuid}`, {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/users', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, permission })
                });
            }
            if (res.status === 401) { navigate('/login'); return; }
            setOpenDialog(false);
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    const handleDeleteUser = async (uuid: string, name: string) => {
        if (!window.confirm(`确定删除用户 ${name} 吗？`)) return;
        try {
            const res = await fetch(`/api/users/${uuid}`, { method: 'DELETE', credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            if (res.ok) { fetchUsers(); }
        } catch (e) { console.error(e); }
    };

    const handleRegenerateKey = async (uuid: string) => {
        if (!window.confirm('重新生成 API Key 会导致原有的调用失效，确认继续？')) return;
        try {
            const res = await fetch(`/api/users/${uuid}/apikey`, { method: 'PUT', credentials: 'include' });
            if (res.status === 401) { navigate('/login'); return; }
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    const handleSaveInstances = async () => {
        if (!assignTargetUuid) return;
        try {
            const payloadInstances = selectedInstances.map(s => {
                const parts = s.split('/');
                const node_id = parts[0];
                const container_name = parts.slice(1).join('/');
                return { node_id, container_name };
            });
            const res = await fetch(`/api/users/${assignTargetUuid}/instances`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instances: payloadInstances })
            });
            if (res.status === 401) { navigate('/login'); return; }
            setOpenInstancesDialog(false);
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    return (
        <Box sx={{ p: { xs: 3, md: 6 }, maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>管理面板 / 用户管理</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PeopleIcon sx={{ color: '#3b82f6' }} /> 用户管理
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="outlined" color="inherit" onClick={fetchUsers} startIcon={<RefreshIcon />} sx={{ borderRadius: 2 }}>
                            刷新
                        </Button>
                        <Button variant="contained" onClick={handleOpenAdd} startIcon={<AddIcon />} sx={{ borderRadius: 2, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, boxShadow: 'none' }}>
                            新建用户
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 3 }}>
                {loading ? (
                    [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: 3 }} />)
                ) : users.length === 0 ? (
                    <Box sx={{ gridColumn: '1 / -1', p: 8, textAlign: 'center', border: `1px dashed ${theme.palette.divider}`, borderRadius: 3 }}>
                        <Typography color="text.secondary">无数据</Typography>
                    </Box>
                ) : (
                    users.map(u => (
                        <Box key={u.uuid} sx={{ p: 3, borderRadius: 3, background: theme.palette.mode === 'dark' ? '#1e293b' : '#fff', border: `1px solid ${theme.palette.divider}`, boxShadow: '0 4px 20px rgba(0,0,0,0.03)', position: 'relative' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{u.userName}</Typography>
                                <Typography variant="caption" sx={{ px: 1.5, py: 0.5, borderRadius: 8, bgcolor: u.permission >= 10 ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: u.permission >= 10 ? '#3b82f6' : '#10b981', fontWeight: 600 }}>
                                    {u.permission >= 10 ? '管理员' : '普通用户'}
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">UUID</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{u.uuid}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">API Key (点击右侧重置)</Typography>
                                    <Typography variant="body2" sx={{ filter: 'blur(3px)', transition: '0.3s', cursor: 'pointer', '&:hover': { filter: 'blur(0)' }, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {u.apiKey}
                                        <IconButton size="small" onClick={() => handleRegenerateKey(u.uuid)} sx={{ color: '#3b82f6' }}><KeyIcon fontSize="small" /></IconButton>
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">分配的实例</Typography>
                                    <Typography variant="body2">{u.instances && u.instances.length > 0 ? `${u.instances.length} 个实例` : '全部 (或无权限)'}</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', gap: 1, borderTop: `1px solid ${theme.palette.divider}`, pt: 2 }}>
                                <Button variant="outlined" size="small" onClick={() => handleOpenEdit(u)} startIcon={<EditIcon />} sx={{ flex: 1, borderRadius: 2 }}>
                                    编辑
                                </Button>
                                {u.permission < 10 && (
                                    <Button variant="outlined" size="small" onClick={() => handleOpenAssign(u)} startIcon={<SettingsIcon />} sx={{ flex: 1, borderRadius: 2 }}>
                                        实例分配
                                    </Button>
                                )}
                                <Button variant="outlined" size="small" color="error" onClick={() => handleDeleteUser(u.uuid, u.userName)} sx={{ flex: 1, borderRadius: 2 }}>
                                    删除
                                </Button>
                            </Box>
                        </Box>
                    ))
                )}
            </Box>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editUuid ? '编辑用户' : '新建用户'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                    <TextField label="用户名" value={username} onChange={e => setUsername(e.target.value)} fullWidth size="small" sx={{ mt: 1 }} />
                    <TextField label={editUuid ? "密码 (留空则不修改)" : "密码"} value={password} onChange={e => setPassword(e.target.value)} fullWidth size="small" type="password" />
                    <FormControl fullWidth size="small">
                        <InputLabel>权限组</InputLabel>
                        <Select value={permission} label="权限组" onChange={e => setPermission(Number(e.target.value))}>
                            <MenuItem value={1}>普通用户 (仅管理分配的实例)</MenuItem>
                            <MenuItem value={10}>管理员 (最高权限)</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenDialog(false)} color="inherit">取消</Button>
                    <Button onClick={handleSaveUser} variant="contained" disabled={!username || (!editUuid && !password)}>
                        保存
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openInstancesDialog} onClose={() => setOpenInstancesDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>分配实例</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        勾选允许该用户管理的实例。注意：格式为 `节点ID/实例名`。
                    </Typography>
                    <FormControl fullWidth>
                        <InputLabel>选择实例</InputLabel>
                        <Select
                            multiple
                            value={selectedInstances}
                            onChange={(e) => setSelectedInstances(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                            renderValue={(selected) => (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {selected.map((value) => (
                                        <Chip key={value} label={value} size="small" />
                                    ))}
                                </Box>
                            )}
                        >
                            {allContainers.map(c => {
                                const val = `${c.node_id}/${c.name}`;
                                return (
                                    <MenuItem key={val} value={val}>
                                        {val}
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenInstancesDialog(false)} color="inherit">取消</Button>
                    <Button onClick={handleSaveInstances} variant="contained">
                        保存分配
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

