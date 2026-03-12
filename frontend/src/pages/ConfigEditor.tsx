import { useState } from 'react';
import {
    Box, Typography, Tabs, Tab, useTheme
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import { useTranslate } from '../i18n';
import { BasicInfo } from '../components/BasicInfo';
import { NetworkConfig } from '../components/NetworkConfig';
import FileManager from '../components/FileManager';
import { NapcatLogs } from '../components/NapcatLogs';

export default function ConfigEditor() {
    const { name, node_id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(0);
    const t = useTranslate();
    const theme = useTheme();

    const isDark = theme.palette.mode === 'dark';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'transparent' }}>
            {/* 顶部毛玻璃导航栏 */}
            <Box sx={{
                width: '100%',
                background: isDark
                    ? 'rgba(15,15,26,0.75)'
                    : 'rgba(255,255,255,0.65)',
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)'}`,
                boxShadow: isDark
                    ? '0 4px 32px rgba(192,132,252,0.08)'
                    : '0 4px 32px rgba(192,132,252,0.12)',
                position: 'sticky',
                top: 0,
                zIndex: 1100,
                px: { xs: 2, md: 4 },
                display: 'flex',
                alignItems: 'center',
                gap: 3,
            }}>
                {/* 顶部渐变装饰线 */}
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, #ff6b9d, #c084fc, #60a5fa)',
                }} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 'fit-content', py: 2 }}>
                    <Box
                        onClick={() => navigate('/admin')}
                        sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 36, height: 36, borderRadius: '12px', cursor: 'pointer',
                            background: isDark ? 'rgba(192,132,252,0.15)' : 'rgba(192,132,252,0.12)',
                            border: `1px solid ${isDark ? 'rgba(192,132,252,0.3)' : 'rgba(192,132,252,0.25)'}`,
                            color: '#c084fc',
                            transition: 'all 0.2s',
                            '&:hover': {
                                background: 'rgba(192,132,252,0.25)',
                                transform: 'translateX(-2px)',
                                boxShadow: '0 0 12px rgba(192,132,252,0.4)',
                            },
                        }}
                    >
                        <ArrowBackIcon fontSize="small" />
                    </Box>
                    <Typography variant="subtitle1" sx={{
                        fontWeight: 800,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: 'linear-gradient(135deg, #ff6b9d, #c084fc)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        letterSpacing: '0.02em',
                    }}>
                        {name}
                    </Typography>
                </Box>

                <Tabs
                    orientation="horizontal"
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 64,
                        '& .MuiTabs-flexContainer': { height: '100%', alignItems: 'center', gap: 0.5 },
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontSize: '0.9rem',
                            minHeight: 40,
                            height: 40,
                            borderRadius: '12px',
                            px: 2,
                            color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 0.75,
                            transition: 'all 0.25s',
                            '&:hover': {
                                color: '#c084fc',
                                background: isDark ? 'rgba(192,132,252,0.1)' : 'rgba(192,132,252,0.08)',
                            },
                        },
                        '& .Mui-selected': {
                            background: 'linear-gradient(135deg, rgba(255,107,157,0.18) 0%, rgba(192,132,252,0.2) 100%) !important',
                            color: '#c084fc !important',
                            fontWeight: 700,
                            boxShadow: '0 0 14px rgba(192,132,252,0.2)',
                        },
                        '& .MuiTabs-indicator': { display: 'none' },
                    }}
                >
                    <Tab icon={<InfoRoundedIcon fontSize="small" />} iconPosition="start" label={t('config.basicInfo')} />
                    <Tab icon={<HubRoundedIcon fontSize="small" />} iconPosition="start" label={t('config.networkConfig')} />
                    <Tab icon={<FolderRoundedIcon fontSize="small" />} iconPosition="start" label={t('config.fileManager')} />
                    <Tab icon={<TerminalRoundedIcon fontSize="small" />} iconPosition="start" label={t('config.napcatLogs')} />
                </Tabs>
            </Box>

            {/* 主内容区 */}
            <Box sx={{ flex: 1, p: { xs: 2, md: 4 }, overflowY: 'auto' }}>
                <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
                    {activeTab === 0 && <BasicInfo name={name as string} node_id={node_id as string} />}
                    {activeTab === 1 && <NetworkConfig name={name as string} node_id={node_id as string} />}
                    {activeTab === 2 && <FileManager name={name as string} node_id={node_id as string} />}
                    {activeTab === 3 && <NapcatLogs name={name as string} node_id={node_id as string} />}
                </Box>
            </Box>
        </Box>
    );
}

