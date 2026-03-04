/**
 * 统一 API 客户端
 * 封装所有后端 API 调用，提供类型安全和错误处理
 */

const API_BASE = '/api';

// 通用请求封装
async function request<T>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// ============ 容器相关 API ============

export const containerApi = {
    // 获取容器列表
    list: () => request<{ status: string; containers: any[] }>('/containers'),

    // 获取容器统计信息
    getStats: (name: string, nodeId: string = 'local') =>
        request<any>(`/containers/${name}/stats?node_id=${nodeId}`),

    // 获取容器日志
    getLogs: (name: string, lines: number = 200, nodeId: string = 'local') =>
        request<{ status: string; logs: string }>(`/containers/${name}/logs?lines=${lines}&node_id=${nodeId}`),

    // 容器操作 (start/stop/restart/delete)
    action: (name: string, action: string, nodeId: string = 'local') =>
        request<{ status: string }>(`/containers/${name}/action?action=${action}&node_id=${nodeId}`, {
            method: 'POST',
        }),

    // 创建容器
    create: (name: string, nodeId: string = 'local') =>
        request<{ status: string; container_id: string }>('/containers', {
            method: 'POST',
            body: JSON.stringify({ name, node_id: nodeId }),
        }),

    // 获取配置文件
    getConfig: (name: string, filename: string, nodeId: string = 'local') =>
        request<{ status: string; content: string }>(`/containers/${name}/config/${filename}?node_id=${nodeId}`),

    // 保存配置文件
    saveConfig: (name: string, filename: string, content: string, nodeId: string = 'local') =>
        request<{ status: string }>(`/containers/${name}/config/${filename}?node_id=${nodeId}`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        }),

    // 获取文件列表
    listFiles: (name: string, path: string = '', nodeId: string = 'local') =>
        request<{ status: string; files: any[]; folders: any[]; current_path: string }>(
            `/containers/${name}/files?path=${encodeURIComponent(path)}&node_id=${nodeId}`
        ),
};

// ============ 节点相关 API ============

export const nodeApi = {
    // 获取节点列表
    list: () => request<{ status: string; nodes: any[] }>('/nodes'),

    // 添加节点
    add: (name: string, address: string, apiKey: string) =>
        request<{ status: string }>('/nodes', {
            method: 'POST',
            body: JSON.stringify({ name, address, api_key: apiKey }),
        }),

    // 编辑节点
    edit: (nodeId: string, name: string, address: string, apiKey: string) =>
        request<{ status: string }>(`/nodes/${nodeId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, address, api_key: apiKey }),
        }),

    // 删除节点
    delete: (nodeId: string) =>
        request<{ status: string }>(`/nodes/${nodeId}`, {
            method: 'DELETE',
        }),

    // 获取集群配置
    getClusterConfig: () => request<any>('/cluster/config'),

    // 保存集群配置
    saveClusterConfig: (config: any) =>
        request<{ status: string }>('/cluster/config', {
            method: 'POST',
            body: JSON.stringify(config),
        }),
};

// ============ 用户相关 API ============

export const userApi = {
    // 获取用户列表
    list: (page: number = 1, pageSize: number = 20, search: string = '') =>
        request<any>(`/users?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`),

    // 创建用户
    create: (username: string, password: string, permission: number = 1) =>
        request<{ status: string; uuid: string; userName: string }>('/users', {
            method: 'POST',
            body: JSON.stringify({ username, password, permission }),
        }),

    // 编辑用户
    edit: (uuid: string, data: any) =>
        request<{ status: string }>(`/users/${uuid}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    // 删除用户
    delete: (uuid: string) =>
        request<{ status: string }>(`/users/${uuid}`, {
            method: 'DELETE',
        }),

    // 分配实例
    assignInstances: (uuid: string, instances: any[]) =>
        request<{ status: string }>(`/users/${uuid}/instances`, {
            method: 'PUT',
            body: JSON.stringify({ instances }),
        }),
};

// ============ 认证相关 API ============

export const authApi = {
    // 登录
    login: (username: string, password: string) =>
        request<{ status: string; user: any }>('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }),

    // 登出
    logout: () =>
        request<{ status: string }>('/logout', {
            method: 'POST',
        }),

    // 获取认证状态
    getStatus: () => request<{ status: string; user: any }>('/auth/status'),
}
