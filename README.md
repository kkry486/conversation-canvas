# 对话画布 Conversation Canvas

基于节点图的 AI 对话系统，借鉴 ComfyUI 的交互方式，将传统线性对话改造为可视化节点编辑器。

![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-orange) ![LiteGraph.js](https://img.shields.io/badge/LiteGraph.js-0.7.18-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## 功能

- **节点图画布** — 拖拽、缩放、连线，ComfyUI 风格交互
- **多模型支持** — DeepSeek V4 Pro / Flash、MiMo，OpenAI 兼容格式
- **分叉对话** — 从任意节点创建分支，各分支独立回溯上下文
- **流式输出** — SSE 流式响应，逐字渲染 AI 回复
- **System Prompt** — 可配置系统提示词
- **自动扩展** — 回复内容自动扩展节点高度，支持滚轮滚动
- **深色主题** — 沉浸式暗色 UI

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/kkry486/conversation-canvas.git
cd conversation-canvas

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开 `http://localhost:5173`，在模型配置节点填入 API Key，即可开始对话。

## 使用方式

1. **配置模型** — 在左侧「模型配置」节点选择模型、填入 API Key
2. **发送消息** — 在「对话输入」节点输入问题，点击「发送」
3. **查看回复** — 自动生成「AI 回复」节点，流式显示内容
4. **继续对话** — 回复完成后自动创建新的输入节点
5. **创建分支** — 右键画布空白处添加新节点，手动连线到任意历史节点
6. **复制内容** — 点击回复节点底部「选择复制」按钮

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | SvelteKit + Svelte 5 |
| 节点编辑器 | LiteGraph.js |
| 后端 | SvelteKit API Routes |
| AI API | OpenAI 兼容格式（DeepSeek V4） |

## 项目结构

```
src/
├── lib/canvas/          # 节点定义 + 画布逻辑
│   ├── init.js          # 画布初始化、主题、滚轮处理
│   ├── widgets.js       # 共享绘制工具
│   ├── ModelConfigNode.js
│   ├── PromptNode.js
│   └── ResponseNode.js
├── lib/stores/config.js # 模型配置状态
├── routes/
│   ├── +page.svelte     # 主页面
│   └── api/chat/        # AI 对话 API（SSE 流式）
└── app.css              # 深色主题样式
```

## License

MIT
