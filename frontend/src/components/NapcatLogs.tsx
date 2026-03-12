/**
 * NapcatLogs 组件 - 容器日志查看器
 * 从 ConfigEditor.tsx 提取，保留原有 UI 风格
 */
import { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Button, TextField, CircularProgress, useTheme
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslate } from '../i18n';
import { containerApi } from '../services/api';

interface NapcatLogsProps {
    name: string;
    node_id: string;
}

export const NapcatLogs = ({ name, node_id }: NapcatLogsProps) => {
    const [logs, setLogs] = useState('');
    const [lines, setLines] = useState(200);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const t = useTranslate();
    const theme = useTheme();

    const fetchLogs = async () => {
        if (!autoRefresh && logs) return; // if not auto refreshing, only fetch when triggered manually or logs are empty
        setLoading(true);
        try {
            const data = await containerApi.getLogs(name, lines, node_id);
            setLogs(data.logs || '');
            // 自动滚动到底部
            setTimeout(() => {
                logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleManualRefresh = () => {
        setLoading(true);
        containerApi.getLogs(name, lines, node_id)
            .then(data => {
                setLogs(data.logs || '');
                setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchLogs();
        let interval: NodeJS.Timeout;
        const start = () => { if (autoRefresh) interval = setInterval(fetchLogs, 3000); };
        const stop = () => { if (interval) clearInterval(interval); };
        const onVis = () => { document.hidden ? stop() : start(); };
        if (!document.hidden) start();
        document.addEventListener('visibilitychange', onVis);
        return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    }, [name, node_id, lines, autoRefresh]);

    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{ mt: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 工具栏 */}
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: '20px', flexWrap: 'wrap', gap: 2,
                background: isDark ? 'rgba(20,20,40,0.55)' : 'rgba(255,255,255,0.55)',
                backdropFilter: 'blur(20px) saturate(150%)',
                WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(236,72,153,0.1)',
                position: 'relative', overflow: 'hidden',
                animation: 'fadeInUp 0.4s ease-out',
            }}>
                {/* 顶部渐变装饰线 */}
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #ff6b9d, #c084fc, #60a5fa)' }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: '12px', bgcolor: 'rgba(236,72,153,0.15)', display: 'flex', boxShadow: '0 0 12px rgba(236,72,153,0.35)' }}>
                        <TerminalIcon sx={{ fontSize: 24, color: '#ec4899' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, background: 'linear-gradient(135deg, #ff6b9d, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('config.containerLogs')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('config.logsSubtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        type="number"
                        label={t('config.fetchLines')}
                        value={lines}
                        onChange={(e) => setLines(parseInt(e.target.value) || 200)}
                        sx={{ width: 100, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                    />
                    <Button
                        variant={autoRefresh ? "contained" : "outlined"}
                        size="medium"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        sx={{
                            borderRadius: '12px', textTransform: 'none', px: 2, fontWeight: 700, height: 40, boxShadow: 'none',
                            ...(autoRefresh ? {
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
                                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(16,185,129,0.5)' },
                            } : {
                                borderColor: 'rgba(148,163,184,0.4)', color: 'text.secondary',
                                '&:hover': { borderColor: '#c084fc', color: '#c084fc', bgcolor: 'rgba(192,132,252,0.08)' },
                            }),
                            transition: 'all 0.25s',
                        }}
                    >
                        {autoRefresh ? t('config.autoRefreshOn') : t('config.autoRefreshOff')}
                    </Button>
                    <Button
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        onClick={handleManualRefresh}
                        disabled={loading}
                        size="medium"
                        variant="contained"
                        sx={{
                            borderRadius: '12px', textTransform: 'none', px: 2, fontWeight: 700, height: 40,
                            background: 'linear-gradient(135deg, #60a5fa, #3b82f6)',
                            boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(59,130,246,0.5)' },
                            transition: 'all 0.25s',
                        }}
                    >
                        {t('config.manualRefresh')}
                    </Button>
                    <Button
                        startIcon={<DownloadIcon />}
                        size="medium"
                        variant="outlined"
                        onClick={() => { window.open(`/api/containers/${name}/logs/download?lines=${lines}&node_id=${node_id}`, '_blank'); }}
                        sx={{
                            borderRadius: '12px', textTransform: 'none', px: 2, fontWeight: 600, height: 40,
                            borderColor: 'rgba(192,132,252,0.4)', color: '#c084fc',
                            '&:hover': { borderColor: '#c084fc', bgcolor: 'rgba(192,132,252,0.1)', transform: 'translateY(-2px)' },
                            transition: 'all 0.25s',
                        }}
                    >
                        {t('config.exportLogs')}
                    </Button>
                </Box>
            </Box>

            {/* 日志区域 - 终端风格保持深色 */}
            <Box
                sx={{
                    p: 2.5,
                    bgcolor: isDark ? '#0a0a14' : '#0f172a',
                    color: '#e2e8f0',
                    fontFamily: '"Fira Code", Consolas, Monaco, monospace',
                    fontSize: '0.85rem',
                    lineHeight: 1.7,
                    maxHeight: 'calc(100vh - 300px)',
                    minHeight: '400px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    borderRadius: '20px',
                    border: `1px solid ${isDark ? 'rgba(192,132,252,0.15)' : 'rgba(192,132,252,0.2)'}`,
                    boxShadow: `inset 0 2px 10px rgba(0,0,0,0.3), 0 8px 32px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.25)'}`,
                    animation: 'fadeInUp 0.4s ease-out 0.15s both',
                    '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                    '&::-webkit-scrollbar-track': { background: 'rgba(0,0,0,0.2)', borderRadius: '4px' },
                    '&::-webkit-scrollbar-thumb': {
                        background: 'linear-gradient(180deg, #ff6b9d40, #c084fc40)',
                        borderRadius: '4px',
                        '&:hover': { background: 'linear-gradient(180deg, #ff6b9d80, #c084fc80)' },
                    },
                }}
            >
                {logs ? (
                    <Box component="pre" sx={{ m: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {logs}
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '300px', opacity: 0.4 }}>
                        <Typography sx={{ fontFamily: 'inherit', color: '#c084fc' }}>{loading ? t('config.loadingLogs') : t('config.noLogs2')}</Typography>
                    </Box>
                )}
                <div ref={logsEndRef} />
            </Box>
        </Box>
    );
};

