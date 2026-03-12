import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    IconButton,
    useTheme,
    CircularProgress,
    Fade,
    InputAdornment
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { authApi } from '../services/api';

export default function LoginPage() {
    const navigate = useNavigate();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [bgLoaded, setBgLoaded] = useState(false);
    const [bgUrl, setBgUrl] = useState('');

    // 随机二次元背景
    useEffect(() => {
        const img = new Image();
        // 移除 crossOrigin='anonymous'，避免跨域拦截重定向的图片
        img.onload = () => {
            setBgUrl(img.src);
            setBgLoaded(true);
        };
        img.src = 'https://t.alcy.cc/ycy?' + Date.now();
    }, []);

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!username || !password) {
            setError(t('login.error'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const data = await authApi.login(username, password);
            if (data.status === 'ok') {
                navigate('/admin');
            } else {
                setError(data.message || t('login.error'));
            }
        } catch (err) {
            setError(t('login.error'));
        } finally {
            setLoading(false);
        }
    };

    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
            background: isDark
                ? 'linear-gradient(135deg, #0f0f1a 0%, #1a1028 30%, #0f172a 70%, #0f0f1a 100%)'
                : 'linear-gradient(135deg, #fdf2f8 0%, #ede9fe 30%, #dbeafe 70%, #f0f9ff 100%)',
        }}>
            {/* 全屏二次元背景 */}
            {bgLoaded && (
                <Box sx={{
                    position: 'fixed', inset: 0, zIndex: 0,
                    backgroundImage: `url(${bgUrl})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    opacity: isDark ? 0.25 : 0.35,
                    animation: 'bgSlideIn 1.2s ease-out',
                    '&::after': {
                        content: '""', position: 'absolute', inset: 0,
                        background: isDark
                            ? 'linear-gradient(180deg, rgba(15,15,26,0.3) 0%, rgba(15,15,26,0.6) 60%, rgba(15,15,26,0.9) 100%)'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(253,242,248,0.5) 60%, rgba(253,242,248,0.9) 100%)',
                    },
                }} />
            )}

            {/* 装饰性渐变光球 */}
            <Box sx={{
                position: 'fixed', top: '-20%', right: '-10%', width: '50vw', height: '50vw',
                background: 'radial-gradient(circle, rgba(255,107,157,0.15) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'fixed', bottom: '-20%', left: '-10%', width: '40vw', height: '40vw',
                background: 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, transparent 70%)',
                filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none',
            }} />

            {/* 右上角工具栏 */}
            <Box sx={{
                position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1, zIndex: 10,
            }}>
                <IconButton onClick={toggleLanguage} size="small" aria-label="Toggle language"
                    sx={{
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(10px)',
                        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
                        borderRadius: '12px',
                        '&:hover': { background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)' },
                    }}>
                    <TranslateIcon fontSize="small" />
                </IconButton>
                <IconButton onClick={colorMode.toggleTheme} size="small" aria-label="Toggle theme"
                    sx={{
                        color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(10px)',
                        background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.6)',
                        borderRadius: '12px',
                        '&:hover': { background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)' },
                    }}>
                    {isDark ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                </IconButton>
            </Box>

            {/* 中央登录卡片 */}
            <Fade in timeout={600}>
                <Box sx={{
                    position: 'relative', zIndex: 1,
                    width: { xs: '90%', sm: 440 }, maxWidth: 440,
                    animation: 'fadeInUp 0.8s ease-out',
                }}>
                    {/* 二次元描边标题 */}
                    <Box sx={{ textAlign: 'center', mb: 3 }}>
                        <Typography variant="h3" className="acg-title" sx={{
                            fontSize: { xs: '1.8rem', sm: '2.2rem' },
                            mb: 0.5,
                        }}>
                            {t('login.agentTitle')}
                        </Typography>
                        <Typography variant="body2" className="acg-subtitle" sx={{ fontSize: '0.9rem' }}>
                            {t('login.agentSubtitle')}
                        </Typography>
                    </Box>

                    {/* 毛玻璃登录表单 */}
                    <Paper elevation={0} component="form" onSubmit={handleLogin} sx={{
                        p: 4,
                        background: isDark ? 'rgba(30,30,46,0.55)' : 'rgba(255,255,255,0.35)',
                        backdropFilter: 'blur(24px) saturate(160%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.5)',
                        borderRadius: '28px',
                        boxShadow: isDark
                            ? '0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : '0 16px 48px rgba(192,132,252,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
                        transition: 'all 0.4s ease',
                        '&:hover': {
                            boxShadow: isDark
                                ? '0 20px 60px rgba(192,132,252,0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
                                : '0 20px 60px rgba(192,132,252,0.2), inset 0 1px 0 rgba(255,255,255,0.7)',
                        },
                    }}>
                        <Typography variant="h5" sx={{
                            mb: 0.5, fontWeight: 700, textAlign: 'center',
                            background: 'linear-gradient(135deg, #ff6b9d, #c084fc, #60a5fa)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            {t('login.title')}
                        </Typography>
                        <Typography variant="body2" sx={{
                            mb: 3, textAlign: 'center',
                            color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
                        }}>
                            {t('login.subtitle')}
                        </Typography>

                        {error && (
                            <Alert severity="error" sx={{
                                mb: 3, borderRadius: '16px',
                                background: 'rgba(239,68,68,0.12)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(239,68,68,0.2)',
                            }}>
                                {error}
                            </Alert>
                        )}

                        <TextField fullWidth label={t('login.username')} variant="outlined" margin="normal" value={username} onChange={e => setUsername(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><PersonIcon sx={{ color: '#c084fc' }} /></InputAdornment>,
                            }}
                            sx={{
                                mb: 2,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: '16px',
                                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.4)',
                                    backdropFilter: 'blur(8px)',
                                    '& fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(192,132,252,0.2)' },
                                    '&:hover fieldset': { borderColor: '#c084fc' },
                                    '&.Mui-focused fieldset': { borderColor: '#c084fc', borderWidth: '2px' },
                                },
                            }}
                        />

                        <TextField fullWidth label={t('login.password')} type="password" variant="outlined" margin="normal" value={password} onChange={e => setPassword(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: '#ff6b9d' }} /></InputAdornment>,
                            }}
                            sx={{
                                mb: 4,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: '16px',
                                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.4)',
                                    backdropFilter: 'blur(8px)',
                                    '& fieldset': { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,107,157,0.2)' },
                                    '&:hover fieldset': { borderColor: '#ff6b9d' },
                                    '&.Mui-focused fieldset': { borderColor: '#ff6b9d', borderWidth: '2px' },
                                },
                            }}
                        />

                        <Button fullWidth variant="contained" type="submit" disabled={loading}
                            className="acg-btn"
                            sx={{
                                py: 1.5,
                                borderRadius: '16px',
                                fontWeight: 700,
                                fontSize: '1.05rem',
                                background: 'linear-gradient(135deg, #ff6b9d 0%, #c084fc 50%, #60a5fa 100%)',
                                backgroundSize: '200% 200%',
                                border: 'none',
                                boxShadow: '0 4px 16px rgba(192,132,252,0.3)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #ff6b9d 0%, #c084fc 50%, #60a5fa 100%)',
                                    backgroundSize: '200% 200%',
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 8px 24px rgba(255,107,157,0.3), 0 4px 12px rgba(192,132,252,0.2)',
                                },
                                '&:disabled': { opacity: 0.6 },
                            }}
                        >
                            {loading ? <CircularProgress size={24} color="inherit" /> : t('login.submit')}
                        </Button>
                    </Paper>
                </Box>
            </Fade>
        </Box>
    );
}
