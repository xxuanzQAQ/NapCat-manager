import React, { useEffect, useState } from 'react';
import {
    Box, Typography, TextField, Button, CircularProgress, Card, CardContent, Grid, useTheme, Alert, Link
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';

export default function ClusterSettings() {
    const theme = useTheme();
    const t = useTranslate();
    const [config, setConfig] = useState({ docker_image: "mlikiowa/napcat-docker:latest", webui_base_port: 6000, http_base_port: 3000, ws_base_port: 3001, api_key: "", data_dir: "" });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/cluster/config', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setConfig(data.config);
                }
            } catch (e) {
                console.error("Failed to fetch cluster config", e);
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleChange = (e: any) => {
        const value = (e.target.type === 'number') ? (parseInt(e.target.value) || 0) : e.target.value;
        setConfig({ ...config, [e.target.name]: value });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/cluster/config', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (res.ok) {
                alert(t('config.saved') || 'Saved Successfully');
            } else {
                alert('Save failed');
            }
        } catch (e) {
            console.error(e);
            alert('Save failed');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 4 } }}>
            <Box sx={{ mb: 4, pb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>
                    实例初始化设置
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    配置快速创建实例时的默认参数模板，新建实例将自动从基础端口递增分配。
                </Typography>
            </Box>

            <Card variant="outlined" sx={{
                borderRadius: 4,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}>
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                Docker Image (部署镜像)
                            </Typography>
                            <TextField
                                fullWidth
                                name="docker_image"
                                value={config.docker_image || ''}
                                onChange={handleChange}
                                placeholder="mlikiowa/napcat-docker:latest"
                                helperText="每次「初始化 Agent」时默认拉取并部署的 NapCat Docker 镜像地址。"
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                WebUI Base Port
                            </Typography>
                            <TextField
                                fullWidth
                                name="webui_base_port"
                                type="number"
                                value={config.webui_base_port}
                                onChange={handleChange}
                                helperText="WebUI 访问端口起始值"
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                HTTP Base Port
                            </Typography>
                            <TextField
                                fullWidth
                                name="http_base_port"
                                type="number"
                                value={config.http_base_port}
                                onChange={handleChange}
                                helperText="分配给 HTTP API"
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                WebSocket Base Port
                            </Typography>
                            <TextField
                                fullWidth
                                name="ws_base_port"
                                type="number"
                                value={config.ws_base_port}
                                onChange={handleChange}
                                helperText="分配给 WebSocket API"
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                实例挂载目录 (DATA_DIR)
                            </Typography>
                            <TextField
                                fullWidth
                                name="data_dir"
                                value={config.data_dir}
                                onChange={handleChange}
                                helperText="实例的数据挂载目录。不同系统下可手动指定，如 /opt/ncqq_data。更改后请注意迁移原有数据。"
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>
                    </Grid>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 5, pt: 3, borderTop: `1px dashed ${theme.palette.divider}` }}>
                        <Button
                            variant="contained"
                            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                            onClick={handleSave}
                            disabled={saving}
                            disableElevation
                            sx={{
                                borderRadius: 2,
                                px: 5,
                                py: 1.2,
                                fontWeight: 700,
                                background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                                '&:hover': {
                                    boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
                                }
                            }}
                        >
                            {t('config.saveConfig') || 'Save'}
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
}
