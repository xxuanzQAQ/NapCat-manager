import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    useTheme,
} from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FolderIcon from '@mui/icons-material/Folder';
import { useTranslate } from '../i18n';
import { useToast } from './Toast';

interface FileManagerProps {
    name: string;
    node_id: string;
}

interface FileItem {
    name: string;
    size: number;
    mtime: number;
}

interface FolderItem {
    name: string;
}

const FileManager: React.FC<FileManagerProps> = ({ name, node_id }) => {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [folders, setFolders] = useState<FolderItem[]>([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(true);
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [savingFile, setSavingFile] = useState(false);
    const t = useTranslate();
    const theme = useTheme();
    const toast = useToast();

    const loadFiles = async (pathStr = currentPath) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/containers/${name}/files?path=${encodeURIComponent(pathStr)}&node_id=${node_id}`, { credentials: 'include' });
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
            const res = await fetch(`/api/containers/${name}/config/${encodeURIComponent(fullPath)}?node_id=${node_id}`, { credentials: 'include' });
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent })
            });
            if (res.ok) {
                setEditingFile(null);
                loadFiles(currentPath);
                toast.success('文件保存成功');
            } else {
                toast.error('保存失败，请重试');
            }
        } catch (e) {
            console.error(e);
            toast.error('保存失败，请检查网络连接');
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
        <Box sx={{ mt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: 3,
                background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(99,102,241,0.1)', display: 'flex' }}>
                        <InsertDriveFileIcon sx={{ fontSize: 24, color: '#6366f1' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('config.configFileList')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {currentPath ? `/ ${currentPath}` : '根目录'}
                        </Typography>
                    </Box>
                </Box>
                <Button
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                    onClick={() => loadFiles(currentPath)}
                    disabled={loading}
                    variant="outlined"
                    sx={{ borderRadius: 2, textTransform: 'none', px: 3, fontWeight: 600 }}
                >
                    {t('config.refreshDir')}
                </Button>
            </Box>

            <TableContainer
                component={Paper}
                variant="outlined"
                sx={{
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : '#fff',
                    boxShadow: 'none',
                    overflow: 'hidden'
                }}
            >
                <Table size="medium" sx={{ minWidth: 600 }}>
                    <TableHead>
                        <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600, borderBottom: `1px solid ${theme.palette.divider}`, color: 'text.secondary' }}>{t('config.fileName')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, borderBottom: `1px solid ${theme.palette.divider}`, color: 'text.secondary' }}>{t('config.fileSize')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, borderBottom: `1px solid ${theme.palette.divider}`, color: 'text.secondary' }}>{t('config.lastModified')}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, borderBottom: `1px solid ${theme.palette.divider}`, color: 'text.secondary' }}>{t('config.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><CircularProgress size={32} thickness={4} color="primary" /></TableCell></TableRow>
                        ) : files.length === 0 && folders.length === 0 && !currentPath ? (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>{t('config.noFiles')}</TableCell></TableRow>
                        ) : (
                            <>
                                {currentPath && (
                                    <TableRow hover onClick={handleUpFolder} sx={{ cursor: 'pointer', transition: 'background-color 0.2s', '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' } }}>
                                        <TableCell colSpan={4} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <ArrowUpwardIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                            <Typography variant="body2" fontWeight={600} color="text.primary">返回上一级</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {folders.map(f => (
                                    <TableRow key={`dir-${f.name}`} hover onClick={() => handleFolderClick(f.name)} sx={{ cursor: 'pointer', transition: 'background-color 0.2s', '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' } }}>
                                        <TableCell colSpan={4} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <FolderIcon fontSize="small" sx={{ color: '#f59e0b' }} />
                                            <Typography variant="body2" fontWeight={600} color="text.primary">{f.name}</Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {files.map(f => (
                                    <TableRow key={`file-${f.name}`} hover sx={{ transition: 'background-color 0.2s', '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }, '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <InsertDriveFileIcon fontSize="small" sx={{ color: '#6366f1' }} />
                                            <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', color: 'text.primary' }}>{f.name}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                {(f.size / 1024).toFixed(2)} KB
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Typography variant="body2" color="text.secondary">
                                                {new Date(f.mtime * 1000).toLocaleString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{
                                                        borderRadius: 2, textTransform: 'none', px: 2, py: 0.5,
                                                        fontWeight: 600, borderColor: theme.palette.divider, color: 'text.primary',
                                                        '&:hover': { bgcolor: 'rgba(59,130,246,0.05)', borderColor: '#3b82f6', color: '#3b82f6' }
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEdit(f.name);
                                                    }}
                                                >
                                                    {t('编辑')}
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog
                open={!!editingFile}
                onClose={() => setEditingFile(null)}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: 3,
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.98)' : 'rgba(255,255,255,0.98)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: `1px solid ${theme.palette.divider}`
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.5, py: 2.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Box sx={{ p: 0.5, borderRadius: 1.5, bgcolor: 'rgba(99,102,241,0.1)', display: 'flex' }}>
                        <InsertDriveFileIcon fontSize="small" sx={{ color: '#6366f1' }} />
                    </Box>
                    编辑文件 / {editingFile}
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    <TextField
                        multiline
                        fullWidth
                        minRows={24}
                        maxRows={30}
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                fontFamily: '"Fira Code", Consolas, monospace',
                                fontSize: '0.85rem',
                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                                borderRadius: 0,
                                '& fieldset': { border: 'none' },
                                p: 2,
                                lineHeight: 1.6
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Button onClick={() => setEditingFile(null)} color="inherit" sx={{ borderRadius: 2, fontWeight: 600 }}>取消</Button>
                    <Button
                        onClick={handleSaveFile}
                        disabled={savingFile}
                        variant="contained"
                        sx={{ px: 4, borderRadius: 2, fontWeight: 600, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', textTransform: 'none' }}
                    >
                        {savingFile ? '保存中...' : '保存修改'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default FileManager;

