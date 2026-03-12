import { useState, useMemo, createContext, useEffect, lazy, Suspense } from 'react';
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery, CircularProgress, Box } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import SetupPage from './pages/Setup';
import AdminLayout from './layouts/AdminLayout';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setupApi } from './services/api';

// 路由懒加载 — 首屏只加载 Login/Setup/AdminLayout
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserDashboard = lazy(() => import('./pages/UserDashboard'));
const ConfigEditor = lazy(() => import('./pages/ConfigEditor'));
const ClusterSettings = lazy(() => import('./pages/ClusterSettings'));
const Nodes = lazy(() => import('./pages/Nodes'));
const OperationLogs = lazy(() => import('./pages/OperationLogs'));
const Users = lazy(() => import('./pages/Users'));
const ImageManager = lazy(() => import('./pages/ImageManager'));
const AlertSettings = lazy(() => import('./pages/AlertSettings'));
const BackupRestore = lazy(() => import('./pages/BackupRestore'));
const ScheduledTasks = lazy(() => import('./pages/ScheduledTasks'));

export const ThemeModeContext = createContext({ toggleTheme: () => { } });
export const LanguageContext = createContext({ language: 'zh', toggleLanguage: () => { } });

// 二次元 ACG 主题配色
const getDesignTokens = (mode: 'light' | 'dark') => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
        primary: { main: '#c084fc', light: '#e0b4fe', dark: '#a855f7' },
        secondary: { main: '#ff6b9d' },
        background: { default: 'transparent', paper: 'rgba(255,255,255,0.15)' },
        text: { primary: '#1f2937', secondary: '#6b7280' },
      }
      : {
        primary: { main: '#c084fc', light: '#e0b4fe', dark: '#a855f7' },
        secondary: { main: '#ff6b9d' },
        background: { default: 'transparent', paper: 'rgba(30,30,46,0.4)' },
        text: { primary: '#f0e6ff', secondary: '#a5b4c8' },
      }),
  },
  typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  shape: { borderRadius: 16 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', backdropFilter: 'blur(20px) saturate(150%)', WebkitBackdropFilter: 'blur(20px) saturate(150%)' } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: 'none' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none' as const, borderRadius: '16px', fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none' as const, fontWeight: 600 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: '24px', backdropFilter: 'blur(20px) saturate(150%)' } } },
  },
});

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<'light' | 'dark'>(prefersDarkMode ? 'dark' : 'light');
  const [language, setLanguage] = useState('zh');
  const [initialized, setInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
    const savedLang = localStorage.getItem('appLang');
    if (savedLang) setLanguage(savedLang);

    // 检查系统是否已初始化
    setupApi.getStatus()
      .then(data => setInitialized(data.initialized))
      .catch(() => setInitialized(true)); // 出错时默认已初始化，走正常登录流程
  }, []);

  const colorMode = useMemo(
    () => ({
      toggleTheme: () => {
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          localStorage.setItem('themeMode', next);
          return next;
        });
      },
    }),
    [],
  );

  const langMode = useMemo(
    () => ({
      language,
      toggleLanguage: () => {
        setLanguage((prev) => {
          const next = prev === 'zh' ? 'en' : 'zh';
          localStorage.setItem('appLang', next);
          return next;
        });
      }
    }),
    [language]
  );

  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

  // 等待初始化状态检查完成
  if (initialized === null) {
    return (
      <ThemeModeContext.Provider value={colorMode}>
        <LanguageContext.Provider value={langMode}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
              <CircularProgress />
            </Box>
          </ThemeProvider>
        </LanguageContext.Provider>
      </ThemeModeContext.Provider>
    );
  }

  return (
    <ErrorBoundary>
    <ThemeModeContext.Provider value={colorMode}>
      <LanguageContext.Provider value={langMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>}>
              <Routes>
                {/* 首次部署：未初始化时所有路由重定向到 /setup */}
                <Route path="/setup" element={initialized ? <Navigate to="/login" replace /> : <ErrorBoundary><SetupPage /></ErrorBoundary>} />
                <Route path="/" element={initialized ? <ErrorBoundary><UserDashboard /></ErrorBoundary> : <Navigate to="/setup" replace />} />
                <Route path="/login" element={initialized ? <ErrorBoundary><LoginPage /></ErrorBoundary> : <Navigate to="/setup" replace />} />
                <Route path="/admin" element={initialized ? <AdminLayout /> : <Navigate to="/setup" replace />}>
                  <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                  <Route path="config/:node_id/:name" element={<ErrorBoundary><ConfigEditor /></ErrorBoundary>} />
                  <Route path="cluster-settings" element={<ErrorBoundary><ClusterSettings /></ErrorBoundary>} />
                  <Route path="nodes" element={<ErrorBoundary><Nodes /></ErrorBoundary>} />
                  <Route path="users" element={<ErrorBoundary><Users /></ErrorBoundary>} />
                  <Route path="images" element={<ErrorBoundary><ImageManager /></ErrorBoundary>} />
                  <Route path="alerts" element={<ErrorBoundary><AlertSettings /></ErrorBoundary>} />
                  <Route path="backup" element={<ErrorBoundary><BackupRestore /></ErrorBoundary>} />
                  <Route path="scheduler" element={<ErrorBoundary><ScheduledTasks /></ErrorBoundary>} />
                  <Route path="operation-logs" element={<ErrorBoundary><OperationLogs /></ErrorBoundary>} />
                </Route>
                <Route path="*" element={<Navigate to={initialized ? "/" : "/setup"} replace />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </LanguageContext.Provider>
    </ThemeModeContext.Provider>
    </ErrorBoundary>
  );
}

export default App;
