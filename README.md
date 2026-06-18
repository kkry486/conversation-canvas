# 对话画布 Conversation Canvas

> 基于节点图的 AI 对话系统，支持 Agent 自动调用本地工具。

![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-orange) ![Tauri](https://img.shields.io/badge/Tauri-2.x-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## 功能

### 对话模式
- **节点图画布** — 拖拽、缩放、连线，ComfyUI 风格交互
- **分叉对话** — 从任意节点创建分支，各分支独立回溯上下文
- **多模型支持** — DeepSeek V4、GPT-4o、通义千问、Moonshot、GLM-4 等
- **分支对比** — 选中多个回复节点并排对比
- **搜索定位** — 关键词搜索历史对话，自动跳转到匹配节点
- **保存/加载** — 对话图导出为 JSON，随时恢复

### Agent 模式
- **自动调用工具** — AI 可读写文件、执行命令、搜索内容
- **节点图可视化** — 实时展示 Agent 的思考过程和工具调用链
- **文件产物节点** — 创建的文件可一键打开
- **5 个内置工具**：read_file、write_file、list_directory、execute_command、search_in_files

## 快速开始

### 方式一：下载 exe（推荐）

从 [Releases](https://github.com/kkry486/conversation-canvas/releases) 下载最新版本，双击运行。

### 方式二：从源码运行

```bash
git clone https://github.com/kkry486/conversation-canvas.git
cd conversation-canvas
npm install
cargo tauri dev
```

### 方式三：浏览器开发模式

```bash
npm run dev
# 打开 http://localhost:5173
```

> 浏览器模式下 Agent 工具不可用（需要 Tauri 后端）。

## 使用方式

1. 打开应用，在「⚙ 模型配置」节点选择模型、填入 API Key
2. 在「✦ 对话输入」节点输入问题，点击「发送」
3. 工具栏点击 **🤖 对话** 切换到 **🤖 Agent** 模式
4. Agent 模式下，点击 📁 选择工作目录
5. 输入任务（如"帮我创建一个 hello.py"），AI 会自动调用工具完成

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | SvelteKit + Svelte 5 |
| 节点编辑器 | LiteGraph.js |
| 桌面应用 | Tauri 2.x |
| 后端 | Rust（reqwest + tokio） |
| AI API | OpenAI 兼容格式 |

## 项目结构

```
├── src/
│   ├── lib/
│   │   ├── canvas/            # 节点定义 + 画布逻辑
│   │   │   ├── init.js        # 画布初始化 + Agent 响应处理
│   │   │   ├── ThinkingNode.js       # 🧠 思考节点
│   │   │   ├── ToolCallNode.js       # 🔧 工具调用节点
│   │   │   ├── ToolResultNode.js     # 📋 工具结果节点
│   │   │   └── FileProductNode.js    # 📄 文件产物节点
│   │   └── tools/
│   │       └── index.js       # Agent 工具定义 + 执行器
│   └── routes/
│       └── api/               # 开发模式 API（Tauri 打包后不使用）
├── src-tauri/
│   ├── src/lib.rs             # Rust 后端（chat/agent/open_file）
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/
    ├── 开发文档.md
    ├── 开发日志.md
    └── 任务报告.md
```

## License

MIT
