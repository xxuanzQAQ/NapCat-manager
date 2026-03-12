import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Typography,
    Button,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    IconButton,
    useTheme,
} from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import ImageIcon from '@mui/icons-material/Image';
import CodeIcon from '@mui/icons-material/Code';
import StorageIcon from '@mui/icons-material/Storage';
import HomeIcon from '@mui/icons-material/Home';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { useTranslate } from '../i18n';
import { useToast } from './Toast';
import { containerApi, type FileItem, type FolderItem } from '../services/api';

interface FileManagerProps {
    name: string;
    node_id: string;
}

// 文件类型图标映射
const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const iconMap: Record<string, { icon: React.ReactElement; color: string }> = {
        json: { icon: <DataObjectIcon fontSize="small" />, color: '#f59e0b' },
        jsonl: { icon: <DataObjectIcon fontSize="small" />, color: '#f59e0b' },
        js: { icon: <CodeIcon fontSize="small" />, color: '#eab308' },
        mjs: { icon: <CodeIcon fontSize="small" />, color: '#eab308' },
        ts: { icon: <CodeIcon fontSize="small" />, color: '#3b82f6' },
        py: { icon: <CodeIcon fontSize="small" />, color: '#22c55e' },
        md: { icon: <DescriptionIcon fontSize="small" />, color: '#6366f1' },
        txt: { icon: <DescriptionIcon fontSize="small" />, color: '#64748b' },
        log: { icon: <DescriptionIcon fontSize="small" />, color: '#94a3b8' },
        yml: { icon: <SettingsIcon fontSize="small" />, color: '#ec4899' },
        yaml: { icon: <SettingsIcon fontSize="small" />, color: '#ec4899' },
        toml: { icon: <SettingsIcon fontSize="small" />, color: '#ec4899' },
        ini: { icon: <SettingsIcon fontSize="small" />, color: '#ec4899' },
        png: { icon: <ImageIcon fontSize="small" />, color: '#06b6d4' },
        jpg: { icon: <ImageIcon fontSize="small" />, color: '#06b6d4' },
        jpeg: { icon: <ImageIcon fontSize="small" />, color: '#06b6d4' },
        gif: { icon: <ImageIcon fontSize="small" />, color: '#06b6d4' },
        svg: { icon: <ImageIcon fontSize="small" />, color: '#06b6d4' },
        db: { icon: <StorageIcon fontSize="small" />, color: '#8b5cf6' },
        sqlite: { icon: <StorageIcon fontSize="small" />, color: '#8b5cf6' },
    };
    return iconMap[ext] || { icon: <InsertDriveFileIcon fontSize="small" />, color: '#94a3b8' };
};

// 文件大小格式化
const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Grid 列定义
const GRID_COLS = '1fr 100px 160px 60px';

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
            const data = await containerApi.listFiles(name, pathStr, node_id);
            setFiles(data.files || []);
            setFolders(data.folders || []);
            setCurrentPath(data.current_path || '');
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
            const data = await containerApi.getConfig(name, fullPath, node_id);
            setEditContent(data.content || '');
            setEditingFile(fullPath);
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
            await containerApi.saveConfig(name, editingFile, editContent, node_id);
            setEditingFile(null);
            loadFiles(currentPath);
            toast.success(t('config.saveSuccess'));
        } catch (e) {
            console.error(e);
            toast.error(t('config.saveFailed'));
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

    // 排序：文件夹按名称排序，文件按名称排序
    const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.name.localeCompare(b.name)), [folders]);
    const sortedFiles = useMemo(() => [...files].sort((a, b) => a.name.localeCompare(b.name)), [files]);

    // 面包屑路径段
    const breadcrumbs = useMemo(() => {
        if (!currentPath) return [];
        return currentPath.split('/').filter(Boolean);
    }, [currentPath]);

    const navigateToBreadcrumb = (index: number) => {
        if (index < 0) { loadFiles(''); return; }
        const target = breadcrumbs.slice(0, index + 1).join('/');
        loadFiles(target);
    };

    const isDark = theme.palette.mode === 'dark';
    const glassStyle = {
        background: isDark ? 'rgba(20,20,40,0.55)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
    };
    const hoverBg = isDark ? 'rgba(192,132,252,0.07)' : 'rgba(192,132,252,0.05)';
    const itemCount = sortedFolders.length + sortedFiles.length;

    return (
        <Box sx={{ mt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* ── 顶部工具栏：面包屑 + 刷新 ── */}
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2,
                px: 2, py: 1.5, borderRadius: '16px',
                ...glassStyle,
                boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.25)' : '0 4px 24px rgba(192,132,252,0.1)',
                animation: 'fadeInUp 0.4s ease-out',
            }}>
                {/* 面包屑导航 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
                    <IconButton size="small" onClick={() => navigateToBreadcrumb(-1)}
                        sx={{ color: '#c084fc', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(192,132,252,0.15)' } }}>
                        <HomeIcon fontSize="small" />
                    </IconButton>
                    {breadcrumbs.map((seg, i) => (
                        <React.Fragment key={i}>
                            <NavigateNextIcon sx={{ fontSize: 16, color: '#c084fc', opacity: 0.5, flexShrink: 0 }} />
                            <Typography
                                variant="body2"
                                onClick={() => navigateToBreadcrumb(i)}
                                noWrap
                                sx={{
                                    cursor: 'pointer', fontWeight: i === breadcrumbs.length - 1 ? 700 : 400,
                                    color: i === breadcrumbs.length - 1 ? '#c084fc' : 'text.secondary',
                                    '&:hover': { color: '#ff6b9d', textDecoration: 'underline' },
                                    maxWidth: 160,
                                }}
                            >
                                {seg}
                            </Typography>
                        </React.Fragment>
                    ))}
                    {breadcrumbs.length === 0 && (
                        <Typography variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>{t('config.rootDir')}</Typography>
                    )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {!loading && <Typography variant="caption" sx={{ color: '#c084fc', fontWeight: 600, opacity: 0.7 }}>{itemCount} {t('config.items')}</Typography>}
                    <IconButton size="small" onClick={() => loadFiles(currentPath)} disabled={loading}
                        sx={{ color: '#c084fc', borderRadius: '10px', '&:hover': { bgcolor: 'rgba(192,132,252,0.15)', transform: 'rotate(180deg)' }, transition: 'all 0.4s' }}>
                        {loading ? <CircularProgress size={18} thickness={4} sx={{ color: '#c084fc' }} /> : <RefreshIcon fontSize="small" />}
                    </IconButton>
                </Box>
            </Box>

            {/* ── 文件列表容器 ── */}
            <Box sx={{
                flex: 1, borderRadius: '16px',
                ...glassStyle,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.25)' : '0 8px 32px rgba(192,132,252,0.1)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'fadeInUp 0.4s ease-out 0.1s both',
            }}>
                {/* 列头 */}
                <Box sx={{
                    display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
                    px: 2, py: 1,
                    background: isDark ? 'rgba(192,132,252,0.08)' : 'rgba(192,132,252,0.06)',
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(192,132,252,0.15)'}`,
                }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('config.fileName')}</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('config.fileSize')}</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('config.lastModified')}</Typography>
                    <Box />
                </Box>

                {/* 内容区 */}
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress size={28} thickness={4} sx={{ color: '#c084fc' }} />
                        </Box>
                    ) : itemCount === 0 && !currentPath ? (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <InsertDriveFileIcon sx={{ fontSize: 48, color: '#c084fc', opacity: 0.3, mb: 1 }} />
                            <Typography variant="body2" color="text.secondary">{t('config.noFiles')}</Typography>
                        </Box>
                    ) : (
                        <>
                            {/* 返回上级 */}
                            {currentPath && (
                                <Box
                                    onClick={handleUpFolder}
                                    sx={{
                                        display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
                                        px: 2, py: 1.2, cursor: 'pointer', transition: 'all 0.2s',
                                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(192,132,252,0.08)'}`,
                                        '&:hover': { bgcolor: hoverBg },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <ArrowBackIcon fontSize="small" sx={{ color: '#c084fc', opacity: 0.6 }} />
                                        <Typography variant="body2" color="text.secondary">..</Typography>
                                    </Box>
                                    <Box /><Box /><Box />
                                </Box>
                            )}

                            {/* 文件夹列表 */}
                            {sortedFolders.map(f => (
                                <Box
                                    key={`d-${f.name}`}
                                    onClick={() => handleFolderClick(f.name)}
                                    sx={{
                                        display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
                                        px: 2, py: 1.2, cursor: 'pointer', transition: 'all 0.2s',
                                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(192,132,252,0.08)'}`,
                                        '&:hover': { bgcolor: hoverBg, transform: 'translateX(4px)' },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                        <FolderIcon fontSize="small" sx={{ color: '#f59e0b', flexShrink: 0 }} />
                                        <Typography variant="body2" fontWeight={600} noWrap>{f.name}</Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                    <Typography variant="caption" color="text.disabled">—</Typography>
                                    <Box />
                                </Box>
                            ))}

                            {/* 文件列表 */}
                            {sortedFiles.map(f => {
                                const fi = getFileIcon(f.name);
                                return (
                                    <Box
                                        key={`f-${f.name}`}
                                        sx={{
                                            display: 'grid', gridTemplateColumns: GRID_COLS, alignItems: 'center',
                                            px: 2, py: 1.2, transition: 'all 0.2s',
                                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(192,132,252,0.08)'}`,
                                            '&:hover': { bgcolor: hoverBg },
                                            '&:last-child': { borderBottom: 'none' },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                                            <Box sx={{ color: fi.color, display: 'flex', flexShrink: 0 }}>{fi.icon}</Box>
                                            <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>{f.name}</Typography>
                                        </Box>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                            {formatSize(f.size)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {new Date(f.mtime * 1000).toLocaleString()}
                                        </Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleEdit(f.name)}
                                                sx={{ color: '#c084fc', opacity: 0.6, borderRadius: '8px', '&:hover': { color: '#ff6b9d', opacity: 1, bgcolor: 'rgba(255,107,157,0.1)' }, transition: 'all 0.2s' }}
                                            >
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </>
                    )}
                </Box>
            </Box>

            <Dialog
                open={!!editingFile}
                onClose={() => setEditingFile(null)}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: {
                        borderRadius: '24px',
                        background: isDark ? 'rgba(15,15,26,0.92)' : 'rgba(255,255,255,0.92)',
                        backdropFilter: 'blur(24px) saturate(150%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.5, py: 2.5, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
                    <Box sx={{ p: 0.5, borderRadius: '10px', background: 'linear-gradient(135deg, rgba(192,132,252,0.2), rgba(96,165,250,0.2))', display: 'flex' }}>
                        <InsertDriveFileIcon fontSize="small" sx={{ color: '#c084fc' }} />
                    </Box>
                    <Typography sx={{ fontWeight: 700, background: 'linear-gradient(135deg, #c084fc, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        {t('config.editFile')} / {editingFile}
                    </Typography>
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
                                bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(248,250,252,0.8)',
                                borderRadius: 0,
                                '& fieldset': { border: 'none' },
                                p: 2,
                                lineHeight: 1.6,
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
                    <Button onClick={() => setEditingFile(null)} color="inherit" sx={{ borderRadius: '12px', fontWeight: 600 }}>{t('config.cancel')}</Button>
                    <Button
                        onClick={handleSaveFile}
                        disabled={savingFile}
                        variant="contained"
                        sx={{ px: 4, borderRadius: '12px', fontWeight: 700, textTransform: 'none', background: 'linear-gradient(135deg, #c084fc, #60a5fa)', boxShadow: '0 4px 16px rgba(192,132,252,0.4)', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(192,132,252,0.5)' }, transition: 'all 0.25s' }}
                    >
                        {savingFile ? t('config.saving') : t('config.saveChanges')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default FileManager;

