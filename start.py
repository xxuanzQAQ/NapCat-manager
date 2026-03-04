import os
import sys
import subprocess
import shutil

def run_cmd(cmd, cwd=None, exit_on_fail=True, shell=False):
    """跨平台执行系统命令的通用函数"""
    print(f"\n>>> 执行命令: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    try:
        # 在 Windows 上执行 npm 或环境变量中的命令时经常需要 shell=True 或是带扩展名
        result = subprocess.run(cmd, cwd=cwd, shell=shell)
        if result.returncode != 0 and exit_on_fail:
            print(f"命令执行失败，错误码 {result.returncode}")
            sys.exit(result.returncode)
        return result.returncode == 0
    except Exception as e:
        print(f"命令执行异常: {e}")
        if exit_on_fail:
            sys.exit(1)
        return False

def main():
    print("=======================================")
    print("=== 开始自动化配置并构建 Ncqq-Manager ===")
    print("=======================================\n")
    
    # 检测系统环境
    is_windows = sys.platform == "win32"
    
    # 1. 构建前端
    print("[1/3] 检查前端环境并构建产物...")
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    if not os.path.exists(frontend_dir):
        print(f"错误: 找不到 frontend 目录 ({frontend_dir})! 请在项目根目录下运行此脚本。")
        sys.exit(1)
        
    # Windows 环境下 npm 通常以 npm.cmd 形式存在
    npm_cmd = "npm.cmd" if is_windows else "npm"
    if not shutil.which(npm_cmd) and not shutil.which("npm"):
        print("错误: 系统中未检测到 npm，请先安装 Node.js! 下载地址: https://nodejs.org/")
        sys.exit(1)

    print("开始安装前端依赖...")
    # Windows 需要 shell=True 来正确解析 npm.cmd 路径
    run_cmd([npm_cmd, "install"], cwd=frontend_dir, shell=is_windows)
    print("开始构建前端应用...")
    run_cmd([npm_cmd, "run", "build"], cwd=frontend_dir, shell=is_windows)
    print("✅ 前端构建完成，产物已就绪。\n")

    # 2. 检查与安装 uv (Python 极速包管理器)
    print("[2/3] 检查 Python 后端包管理工具 uv...")
    
    # 判断系统中是否存在 uv
    uv_executable = shutil.which("uv.exe" if is_windows else "uv")
    if not uv_executable:
        print("未检测到 uv 工具，正在使用 pip 为您自动安装 uv...")
        run_cmd([sys.executable, "-m", "pip", "install", "uv"])
        uv_executable = shutil.which("uv.exe" if is_windows else "uv")
    
    # 若还是找不到可执行文件路径，则回退到通过 python module 调用
    if uv_executable:
        uv_base_cmd = [uv_executable]
        print(f"✅ 找到 uv 工具: {uv_executable}")
    else:
        print("✅ 找到 uv 工具，将使用 python 模块方式调用 (python -m uv)")
        uv_base_cmd = [sys.executable, "-m", "uv"]

    # 3. 安装后端依赖
    print("\n[3/3] 配置后端 Python 虚拟环境并安装依赖...")
    venv_dir = os.path.join(os.getcwd(), ".venv")
    if not os.path.exists(venv_dir):
        print("正在创建隔离的 Python 虚拟环境 .venv...")
        run_cmd(uv_base_cmd + ["venv"])
    else:
        print("检测到虚拟环境已存在，跳过创建。")
        
    print("正在使用 uv 极速同步后端依赖...")
    run_cmd(uv_base_cmd + ["pip", "install", "-r", "requirements.txt"])
    print("✅ 后端依赖安装完成。\n")
    
    # 4. 启动服务
    print("=======================================")
    print("=== 环境准备就绪，正在一键启动服务! ===")
    print("=======================================")
    start_cmd = uv_base_cmd + ["run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
    run_cmd(start_cmd)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n检测到中断信号，服务已停止。")
        sys.exit(0)

