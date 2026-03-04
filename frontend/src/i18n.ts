import { useContext } from 'react';
import { LanguageContext } from './App';

export const translations = {
    zh: {
        admin: {
            title: 'NapCat 管理面板',
            subtitle: '控制中心',
            dashboardOverview: '仪表盘总览',
            clusterSettings: '集群初始化设置',
            clusterSettingsDesc: '配置新建实例时的参数模板，包括动态基础端口和镜像标签等。',
            managedInstances: '托管实例',
            online: '在线',
            coreDeployment: '核心部署引擎',
            instances: '实例群',
            initAgent: '初始化新节点',
            initHint: '提供一个仅包含字母数字的容器名称以供部署。',
            deployBtn: '部署',
            fleet: '活动节点',
            noEnv: '暂无已部署的运行环境。',
            confirmDelete: '确定要删除节点 {name} 吗？',
            nodes: '节点管理'
        },
        config: {
            basicInfo: '基础信息',
            networkConfig: '网络配置',
            fileManager: '文件管理',
            napcatLogs: '猫猫日志',
            systemInfo: '系统信息',
            runningStatus: '运行状态',
            instanceName: '实例名称',
            resourceOverview: '资源概览',
            cpuUsage: 'CPU 占用',
            memUsage: '内存占用',
            realtimeLogs: '实时运行日志',
            refresh: '刷新',
            noLogs: '暂无日志产生...',
            wsServer: 'Websocket 服务器',
            wsClient: 'Websocket 客户端',
            httpServer: 'HTTP 服务器',
            httpClient: 'HTTP 客户端',
            toggleGui: '返回交互模式',
            toggleSource: '切换源码模式',
            saveConfig: '保存配置',
            enableService: '启用服务',
            tokenPlaceholder: '可选访问密钥',
            enableDebug: '启用调试模式 (DEBUG)',
            demoNotice: '说明: 当下界面仅展示交互框架，双向数据同步能力将于稍后接入底层 OneBot JSON 解析器。',
            configFileList: '配置文件列表',
            refreshDir: '刷新目录',
            fileName: '文件名称',
            fileSize: '文件大小 (Bytes)',
            lastModified: '最后修改',
            actions: '操作',
            noFiles: '暂未扫描到配置落地',
            details: '详情',
            saveSuccess: '配置保存成功',
            saveFailed: '保存失败',
            funcSettings: '功能设置'
        },
        user: {
            title: 'NapCat 用户控制台',
            subtitle: '本地原生管理您的 QQ 机器人节点。',
            adminLogin: '管理员登录',
            refreshStatus: '刷新状态',
            waitingQr: '等待生成...',
            offline: '离线'
        },
        login: {
            title: '管理员登录',
            subtitle: '进入 NapCat 集群控制面板',
            agentTitle: 'NapCat 代理中心',
            agentSubtitle: '优雅地进行容器生命周期管理。',
            username: '用户名',
            password: '密码',
            submit: '登录',
            error: '登录失败，请检查凭据。'
        }
    },
    en: {
        admin: {
            title: 'NapCat Manager',
            subtitle: 'CONTROL PANEL',
            dashboardOverview: 'Dashboard Overview',
            clusterSettings: 'Cluster Settings',
            clusterSettingsDesc: 'Configure new instance configurations, such as dynamic base ports and docker image tags.',
            managedInstances: 'Managed Instances',
            online: 'ONLINE',
            coreDeployment: 'Core Deployment Engine',
            instances: 'Instances',
            initAgent: 'Initialize New Agent',
            initHint: 'Provide an alphanumeric name for container binding and volume generation.',
            deployBtn: 'Deploy',
            fleet: 'Deployed Fleet',
            noEnv: 'No environments deployed yet.',
            confirmDelete: 'Are you sure you want to delete {name}?',
            nodes: 'Nodes'
        },
        config: {
            basicInfo: 'Basic Info',
            networkConfig: 'Network Config',
            fileManager: 'File Manager',
            napcatLogs: 'NapCat Logs',
            systemInfo: 'System Info',
            runningStatus: 'Running Status',
            instanceName: 'Instance Name',
            resourceOverview: 'Resource Overview',
            cpuUsage: 'CPU Usage',
            memUsage: 'Memory',
            realtimeLogs: 'Real-time Logs',
            refresh: 'Refresh',
            noLogs: 'No logs generated yet...',
            wsServer: 'Websocket Server',
            wsClient: 'Websocket Client',
            httpServer: 'HTTP Server',
            httpClient: 'HTTP Client',
            toggleGui: 'Return to GUI',
            toggleSource: 'Toggle Source Mode',
            saveConfig: 'Save Config',
            enableService: 'Enable Service',
            tokenPlaceholder: 'Optional Access Token',
            enableDebug: 'Enable Debug Mode',
            demoNotice: 'Note: This interface currently displays an interactive framework. Two-way data synchronization will be integrated soon.',
            configFileList: 'Config File List',
            refreshDir: 'Refresh Dir',
            fileName: 'File Name',
            fileSize: 'File Size (Bytes)',
            lastModified: 'Last Modified',
            actions: 'Actions',
            noFiles: 'No configuration files scanned',
            details: 'Details',
            saveSuccess: 'Save successful',
            saveFailed: 'Save failed',
            funcSettings: 'Settings'
        },
        user: {
            title: 'NapCat User Dashboard',
            subtitle: 'Manage your QQ Bots natively.',
            adminLogin: 'ADMIN LOGIN',
            waitingQr: 'Waiting for QR code...',
            activeLogged: 'Starting or Logged In',
            offline: 'Instance Offline',
            refreshStatus: 'Refresh Status'
        },
        login: {
            title: 'Admin Login',
            subtitle: 'Enter NapCat Cluster Control Panel',
            agentTitle: 'NapCat Agent',
            agentSubtitle: 'Elegant container lifecycle management.',
            username: 'Username',
            password: 'Password',
            submit: 'Login',
            error: 'Login failed, check credentials.'
        }
    }
};

export const useTranslate = () => {
    const { language } = useContext(LanguageContext);
    const t = (keyStr: string) => {
        const keys = keyStr.split('.');
        let val: any = translations[language as keyof typeof translations];
        for (const k of keys) {
            if (val === undefined) break;
            val = val[k];
        }
        return val || keyStr;
    }
    return t;
};
