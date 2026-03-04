import { useState, useMemo, createContext, useEffect } from 'react';
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import UserDashboard from './pages/UserDashboard';
import AdminLayout from './layouts/AdminLayout';
import ConfigEditor from './pages/ConfigEditor';
import ClusterSettings from './pages/ClusterSettings';
import Nodes from './pages/Nodes';
import OperationLogs from './pages/OperationLogs';
import Users from './pages/Users';
import { ToastProvider } from './components/Toast';

export const ThemeModeContext = createContext({ toggleTheme: () => { } });
export const LanguageContext = createContext({ language: 'zh', toggleLanguage: () => { } });

// We define exact standard colors that match Napcat native
const getDesignTokens = (mode: 'light' | 'dark') => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
        primary: { main: '#3b82f6' },
        background: { default: '#f3f4f6', paper: '#ffffff' },
        text: { primary: '#1f2937', secondary: '#4b5563' },
      }
      : {
        primary: { main: '#3b82f6' },
        background: { default: '#1e1e1e', paper: '#252526' },
        text: { primary: '#e5e7eb', secondary: '#9ca3af' },
      }),
  },
  typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: 'none' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: '8px' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } }
  },
});

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<'light' | 'dark'>(prefersDarkMode ? 'dark' : 'light');
  const [language, setLanguage] = useState('zh');

  useEffect(() => {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
    const savedLang = localStorage.getItem('appLang');
    if (savedLang) setLanguage(savedLang);
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

  return (
    <ThemeModeContext.Provider value={colorMode}>
      <LanguageContext.Provider value={langMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<UserDashboard />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="config/:node_id/:name" element={<ConfigEditor />} />
                  <Route path="cluster-settings" element={<ClusterSettings />} />
                  <Route path="nodes" element={<Nodes />} />
                  <Route path="users" element={<Users />} />
                  <Route path="operation-logs" element={<OperationLogs />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </LanguageContext.Provider>
    </ThemeModeContext.Provider>
  );
}

export default App;
