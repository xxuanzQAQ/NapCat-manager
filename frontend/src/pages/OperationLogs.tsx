import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    Select,
    MenuItem,
    Button,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    CircularProgress,
} from '@mui/material';
import { Refresh as RefreshIcon, FiberManualRecord as DotIcon } from '@mui/icons-material';

interface OperationLog {
    id: string;
    type: string;
    level: 'info' | 'warning' | 'error';
    time: string;
    timestamp: number;
    operator?: string;
    operator_ip?: string;
    target?: string;
    [key: string]: any;
}

const OperationLogs: React.FC = () => {
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(50);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/operation_logs?limit=${limit}`, {
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                setLogs(data.reverse());
            }
        } catch (error) {
            console.error('Failed to fetch operation logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [limit]);

    const getLevelColor = (level: string): 'info' | 'warning' | 'error' | 'grey' => {
        switch (level) {
            case 'info':
                return 'info';
            case 'warning':
                return 'warning';
            case 'error':
                return 'error';
            default:
                return 'grey';
        }
    };

    const formatLogText = (log: OperationLog): string => {
        const operator = log.operator || log.id;
        const target = log.target || '';

        switch (log.type) {
            case 'container_start':
                return `${operator} 启动了容器 ${target}`;
            case 'container_stop':
                return `${operator} 停止了容器 ${target}`;
            case 'container_restart':
                return `${operator} 重启了容器 ${target}`;
            case 'container_create':
                return `${operator} 创建了容器 ${target}`;
            case 'container_delete':
                return `${operator} 删除了容器 ${target}`;
            case 'user_login':
                return `${operator} 登录系统 (${log.operator_ip || 'unknown'})`;
            case 'user_create':
                return `${operator} 创建了用户 ${target}`;
            case 'user_delete':
                return `${operator} 删除了用户 ${target}`;
            case 'config_change':
                return `${operator} 修改了配置`;
            case 'node_create':
                return `${operator} 创建了节点 ${target}`;
            case 'node_delete':
                return `${operator} 删除了节点 ${target}`;
            default:
                return `${operator} 执行了操作: ${log.type}`;
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5">操作日志</Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                            >
                                <MenuItem value={20}>20 条</MenuItem>
                                <MenuItem value={50}>50 条</MenuItem>
                                <MenuItem value={100}>100 条</MenuItem>
                                <MenuItem value={200}>200 条</MenuItem>
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={fetchLogs}
                            disabled={loading}
                        >
                            刷新
                        </Button>
                 </Box>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : logs.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                        <Typography variant="body1">暂无操作日志</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            系统操作记录将显示在这里
                        </Typography>
                    </Box>
                ) : (
                    <List dense>
                        {logs.map((log) => (
                            <ListItem key={log.id || log.timestamp} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                    <DotIcon sx={{ fontSize: 12, color: getLevelColor(log.level) === 'info' ? 'info.main' : getLevelColor(log.level) === 'warning' ? 'warning.main' : getLevelColor(log.level) === 'error' ? 'error.main' : 'grey.500' }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={formatLogText(log)}
                                    secondary={log.time}
                                />
                                <Chip label={log.level} size="small" color={getLevelColor(log.level) as any} variant="outlined" />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>
        </Box>
    );
};

export default OperationLogs;

