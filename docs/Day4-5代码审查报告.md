# 代码审查报告 — Day 4-5 体验 P0 修复（修订版）

审查时间：2026-06-21（初次）→ 2026-06-21（修订）
审查范围：Day 4-5 改动
审查文件：
- `big/src/lib/components/TextEditModal.svelte`（新建）
- `big/src/lib/services/textEditService.js`（新建）
- `big/src/routes/+page.svelte`（第 11-12, 31-36, 350-359 行）
- `big/src/lib/canvas/widgets.js`（第 4, 91-106 行）
- `big/src/lib/canvas/PromptNode.js`（第 14 行）⬅️ **遗漏审查**
- `big/src/lib/canvas/ModelConfigNode.js`（第 22, 27, 32 行）⬅️ **遗漏审查**

---

## ⚠️ 审查修订说明

**初次审查评分**：✅ 完全正确
**修订后评分**：❌ 需要重做

**原因**：初次审查遗漏了关键问题 —— 代码改动没有生效。虽然修改了 `widgets.js`，但节点实际使用的是 LiteGraph 内置的 `addWidget('string', ...)`，不走自定义的 `createScrollableInput`。

---

## 任务 13：替换 prompt() 为应用风格模态框

**评分：❌ 需要重做**

### 任务背景

**问题**：文本输入使用浏览器原生 `prompt()` 对话框：
- 与深色主题不搭
- 不支持多行编辑
- 无法自定义样式
- 用户体验差

**审计报告要求**：
- Day 4-5 | 替换 `prompt()` 为模态框 | 🎨 前端 | `widgets.js` + **各节点**

---

## 🔴 关键问题：改动未生效

### 问题描述

**实际行为**：用户点击节点文本输入区域，仍然显示原生 `prompt()` 对话框
**预期行为**：显示应用风格的 TextEditModal 模态框

### 根本原因

**代码改动了错误的位置**：

1. ✅ **修改了** `widgets.js` 的 `createScrollableInput` 函数（第 91-106 行）
2. ❌ **但节点使用的是 LiteGraph 内置 widget**：

```javascript
// PromptNode.js:14
this._inputWidget = this.addWidget('string', '消息', '', (v) => {
  self._promptText = v;
});

// ModelConfigNode.js:22
this.addWidget('string', 'API Key', '', (v) => {
  this._apiKey = v;
  this.syncConfig();
});

// ModelConfigNode.js:27
this._urlWidget = this.addWidget('string', 'Base URL', MODEL_PRESETS[0].baseUrl, (v) => {
  this._baseUrl = v;
  this.syncConfig();
});

// ModelConfigNode.js:32
this.addWidget('string', 'System Prompt', '', (v) => {
  this._systemPrompt = v;
  this.syncConfig();
});
```

3. ❌ **LiteGraph 内置的 `'string'` widget 使用原生 `prompt()`**：
   - `addWidget('string', ...)` 是 LiteGraph 的内置方法
   - 内部实现使用 `node.graph.prompt()` 或原生 `window.prompt()`
   - **不走我们自定义的 `createScrollableInput` 的 `mouse` 回调**

### 数据流分析

**预期数据流**（未生效）：
```
用户点击节点 → widgets.js mouse 回调 → showTextEdit() → TextEditModal
```

**实际数据流**（LiteGraph 内置）：
```
用户点击节点 → LiteGraph string widget → node.graph.prompt() → 原生 prompt()
```

### 影响范围

受影响的节点：
- ❌ **PromptNode**（对话输入）— 第 14 行
- ❌ **ModelConfigNode**（模型配置）— 第 22, 27, 32 行

共 **4 处** `addWidget('string', ...)` 调用未被替换。

---

## 1. TextEditModal.svelte（新建文件）— ✅ 实现正确但未被调用

**位置**：[TextEditModal.svelte](big/src/lib/components/TextEditModal.svelte)

#### 实现方式

```svelte
<script>
  let { title = '编辑', value = '', placeholder = '', multiline = false, onConfirm, onCancel } = $props();
  let editValue = $state(value);

  function handleConfirm() {
    onConfirm(editValue);
  }

  function handleCancel() {
    onCancel();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && !multiline && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }

  function autofocus(node) {
    setTimeout(() => node.focus(), 50);
  }
</script>

<div class="overlay" onclick={handleOverlayClick} onkeydown={handleKeydown}>
  <div class="dialog">
    <div class="header">
      <span class="title">{title}</span>
      <button class="close-btn" onclick={handleCancel}>&times;</button>
    </div>

    <div class="body">
      {#if multiline}
        <textarea bind:value={editValue} {placeholder} rows="8" use:autofocus></textarea>
      {:else}
        <input type="text" bind:value={editValue} {placeholder} use:autofocus />
      {/if}
    </div>

    <div class="actions">
      <button class="btn-cancel" onclick={handleCancel}>取消</button>
      <button class="btn-confirm" onclick={handleConfirm}>确认</button>
    </div>
  </div>
</div>
```

#### 分析

**优点**：
1. ✅ **深色主题设计**：`#1a1d28` 背景，与应用整体风格一致
2. ✅ **支持单行/多行**：通过 `multiline` 属性切换 input/textarea
3. ✅ **键盘快捷键**：
   - ESC 取消
   - Enter 确认（单行模式，避免与换行冲突）
   - Shift+Enter 换行（多行模式）
4. ✅ **自动聚焦**：使用 Svelte 的 `use:autofocus` action
5. ✅ **点击外部关闭**：`handleOverlayClick` 检查 `e.target === e.currentTarget`
6. ✅ **样式完整**：
   - hover 状态
   - 焦点状态（`#e94560` 边框）
   - 过渡动画
7. ✅ **代码简洁**：190 行，逻辑清晰

**问题**：
- ⚠️ **Props 不响应外部更新**：`editValue` 初始化为 `value`，但如果外部更新 `value`，`editValue` 不会同步
  - **影响**：无 — 模态框每次打开都会重新创建，不会出现 props 更新的情况
  - **建议**：可添加 `$effect(() => { editValue = value; })` 但非必要

**新 bug**：无

**遗漏**：无

**⚠️ 关键问题**：组件实现正确，但**从未被实际调用** — 受影响的节点使用 LiteGraph 内置 widget

---

### 2. textEditService.js（新建文件）— ✅ 实现正确但未被调用

**位置**：[textEditService.js](big/src/lib/services/textEditService.js)

#### 实现方式

```javascript
let resolveCallback = null;
let rejectCallback = null;
let currentOptions = null;
let onUpdate = null;

export function showTextEdit(title, defaultValue = '', opts = {}) {
  return new Promise((resolve, reject) => {
    // 如果已有模态框打开，先取消
    if (resolveCallback) {
      resolveCallback(null);
    }

    resolveCallback = resolve;
    rejectCallback = reject;
    currentOptions = {
      title,
      value: defaultValue,
      placeholder: opts.placeholder || '',
      multiline: opts.multiline !== false, // 默认多行
    };

    // 通知 Svelte 组件更新
    if (onUpdate) {
      onUpdate({ visible: true, ...currentOptions });
    }
  });
}

export function confirmEdit(value) {
  if (resolveCallback) {
    resolveCallback(value);
    resolveCallback = null;
    rejectCallback = null;
    currentOptions = null;

    if (onUpdate) {
      onUpdate({ visible: false });
    }
  }
}

export function cancelEdit() {
  if (resolveCallback) {
    resolveCallback(null);
    resolveCallback = null;
    rejectCallback = null;
    currentOptions = null;

    if (onUpdate) {
      onUpdate({ visible: false });
    }
  }
}

export function setUpdateCallback(callback) {
  onUpdate = callback;
}

export function getState() {
  return {
    visible: !!currentOptions,
    ...currentOptions,
  };
}
```

#### 分析

**优点**：
1. ✅ **Promise-based API**：替代同步的原生 prompt，支持异步操作
2. ✅ **全局服务模式**：允许从非 Svelte 代码（如 widgets.js）触发模态框
3. ✅ **冲突处理**：如果已有模态框打开，先取消旧的（第 23-25 行）
4. ✅ **状态同步**：通过 `onUpdate` 回调通知 Svelte 组件更新
5. ✅ **接口完整**：导出了 `showTextEdit`, `confirmEdit`, `cancelEdit`, `setUpdateCallback`, `getState`

**问题**：

1. ⚠️ **rejectCallback 未使用**（第 28, 50, 66 行）：
   - `rejectCallback` 被保存但从未调用
   - 如果 Promise 被创建但既不 confirm 也不 cancel，reject 不会被触发
   - **影响**：低 — 当前使用场景中，用户总会点击确认或取消
   - **建议**：删除 `rejectCallback` 或在超时/错误时调用

2. ⚠️ **内存泄漏风险**：
   - 如果 `showTextEdit()` 被调用但模态框被意外关闭（如页面卸载），`resolveCallback` 会一直被持有
   - **影响**：低 — 桌面应用不会频繁创建/销毁
   - **建议**：可在页面卸载时调用 `cancelEdit()`

**新 bug**：无

**遗漏**：无

**⚠️ 关键问题**：服务实现正确，但**从未被实际调用** — 受影响的节点使用 LiteGraph 内置 widget

---

### 3. +page.svelte 修改 — ✅ 实现正确但未被触发

**位置**：[+page.svelte:11-12, 31-36, 350-359](big/src/routes/+page.svelte)

#### 实现方式

```svelte
<script>
  // 导入（第 11-12 行）
  import TextEditModal from '$lib/components/TextEditModal.svelte';
  import { setUpdateCallback, confirmEdit, cancelEdit, getState } from '$lib/services/textEditService.js';

  // 状态变量（第 31 行）
  let textEditState = $state({ visible: false });

  // 初始化服务回调（第 33-36 行）
  setUpdateCallback((state) => {
    textEditState = state;
  });
</script>

<!-- 模板（第 350-359 行） -->
{#if textEditState.visible}
  <TextEditModal
    title={textEditState.title}
    value={textEditState.value}
    placeholder={textEditState.placeholder}
    multiline={textEditState.multiline}
    onConfirm={confirmEdit}
    onCancel={cancelEdit}
  />
{/if}
```

#### 分析

**优点**：
1. ✅ **正确导入**：TextEditModal 组件和 textEditService 的所有导出函数
2. ✅ **状态管理**：使用 `$state` 响应式变量 `textEditState`
3. ✅ **服务初始化**：通过 `setUpdateCallback` 将 Svelte 响应式系统与服务连接
4. ✅ **条件渲染**：`{#if textEditState.visible}` 控制模态框显示/隐藏
5. ✅ **Props 传递**：正确传递所有必要的 props（title, value, placeholder, multiline）
6. ✅ **回调绑定**：正确绑定 `onConfirm={confirmEdit}` 和 `onCancel={cancelEdit}`

**问题**：无

**新 bug**：无

**遗漏**：无

**⚠️ 关键问题**：集成正确，但**从未被触发** — `textEditState.visible` 永远为 `false`

---

### 4. widgets.js 修改 — ❌ 改动无效

**位置**：[widgets.js:4, 91-106](big/src/lib/canvas/widgets.js)

#### 实现方式

```javascript
// 导入（第 4 行）
import { showTextEdit } from '../services/textEditService.js';

// 使用（第 91-106 行）
mouse: function (event, pos, node) {
  if (event.type === 'pointerdown') {
    // 使用应用风格的模态框替代原生 prompt
    showTextEdit('输入 ' + label, this._text || '', {
      placeholder: opts.placeholder || label,
      multiline: opts.multiline !== false
    }).then((v) => {
      if (v !== null) {
        this._text = v;
        this.value = v;
        this.autoExpand(node);
        if (onChange) onChange(v);
      }
    });
    return true;
  }
},
```

#### 分析

**优点**：
1. ✅ **正确导入**：`showTextEdit` 函数
2. ✅ **代码逻辑正确**：Promise 处理、取消处理、功能完整
3. ✅ **默认多行**：`multiline: opts.multiline !== false` 默认启用多行编辑

**🔴 关键问题**：

❌ **`createScrollableInput` 从未被任何节点调用**

- `createScrollableInput` 函数在 `widgets.js` 中定义
- 但 **PromptNode.js** 和 **ModelConfigNode.js** 使用的是 LiteGraph 内置的 `addWidget('string', ...)`
- LiteGraph 内置的 string widget 有自己的输入机制（原生 prompt）
- **不走 `createScrollableInput` 的 `mouse` 回调**

**受影响的调用**：
```javascript
// PromptNode.js:14 — 使用 addWidget，不使用 createScrollableInput
this._inputWidget = this.addWidget('string', '消息', '', (v) => {...});

// ModelConfigNode.js:22 — 使用 addWidget
this.addWidget('string', 'API Key', '', (v) => {...});

// ModelConfigNode.js:27 — 使用 addWidget
this._urlWidget = this.addWidget('string', 'Base URL', ..., (v) => {...});

// ModelConfigNode.js:32 — 使用 addWidget
this.addWidget('string', 'System Prompt', '', (v) => {...});
```

**结论**：`widgets.js` 的修改**完全无效**，需要重做。

**新 bug**：是 — 改动未生效

**遗漏**：是 — 未检查节点是否实际使用 `createScrollableInput`

---

### 5. 全局检查：是否还有遗漏的 prompt() 调用 — ⚠️ 检查不完整

**检查结果**：

```bash
$ grep -rn "prompt(" big/src --include="*.js" --include="*.svelte"
# 无结果
```

**❌ 检查遗漏**：

只检查了直接的 `prompt()` 调用，但**没有检查间接调用**：
- LiteGraph 内置的 `'string'` widget 内部使用 `node.graph.prompt()`
- `node.graph.prompt()` 是 LiteGraph 的方法，不是直接的 `window.prompt()`
- grep 无法捕获这种间接调用

**正确检查方式**：
```bash
# 应该检查 addWidget('string', ...) 调用
$ grep -rn "addWidget('string'" big/src --include="*.js"
# 结果：4 处未替换的调用
```

**结论**：❌ 全局检查不完整，遗漏了 LiteGraph 内置 widget 的间接调用

---

## 技术方案评估

### 架构设计

```
widgets.js (非 Svelte 代码)
    ↓ 调用
showTextEdit() (textEditService.js)
    ↓ 触发
onUpdate 回调
    ↓ 更新
textEditState ($state)
    ↓ 响应式
TextEditModal (Svelte 组件)
    ↓ 用户操作
confirmEdit() / cancelEdit()
    ↓ resolve
Promise 结果返回 widgets.js
```

**优点**：
1. ✅ **解耦**：非 Svelte 代码（widgets.js）通过全局服务与 Svelte 组件通信
2. ✅ **单向数据流**：服务 → 状态 → 组件 → 用户操作 → 服务
3. ✅ **Promise API**：替代同步的 prompt，支持现代异步编程
4. ✅ **可复用**：任何地方都可以调用 `showTextEdit()`，无需直接访问 DOM

**问题**：
- ⚠️ **全局状态**：`resolveCallback` 等变量是全局的，如果同时打开多个模态框会冲突
  - **影响**：无 — 当前使用场景中，同一时间只有一个模态框
  - **建议**：如果未来需要支持多模态框，可改为实例化模式

---

## 用户体验对比

### 修复前（原生 prompt）

```javascript
// 原代码
const text = node.graph.prompt('输入内容', defaultValue);
if (text !== null) {
  this._text = text;
  // ...
}
```

**问题**：
- ❌ 浏览器原生弹框，与深色主题不搭
- ❌ 不支持多行编辑（System Prompt 等场景）
- ❌ 无法自定义样式
- ❌ 阻塞主线程（同步 API）

### 修复后（应用风格模态框）

```javascript
// 新代码
showTextEdit('输入 ' + label, this._text || '', {
  placeholder: opts.placeholder || label,
  multiline: opts.multiline !== false
}).then((v) => {
  if (v !== null) {
    this._text = v;
    // ...
  }
});
```

**改进**：
- ✅ 深色主题设计，与应用风格一致
- ✅ 支持多行编辑（默认启用）
- ✅ 自定义样式（圆角、阴影、动画）
- ✅ 异步 API（不阻塞主线程）
- ✅ 键盘快捷键（ESC 取消、Enter 确认）
- ✅ 自动聚焦
- ✅ 点击外部关闭

---

## 总结（修订版）

| 组件 | 初次评分 | 修订评分 | 说明 |
|------|----------|----------|------|
| TextEditModal.svelte | ✅ 完全正确 | ✅ 实现正确 | 组件本身无问题，但未被调用 |
| textEditService.js | ✅ 完全正确 | ✅ 实现正确 | 服务本身无问题，但未被调用 |
| +page.svelte 修改 | ✅ 完全正确 | ✅ 集成正确 | 集成本身无问题，但未被触发 |
| widgets.js 修改 | ✅ 完全正确 | ❌ **改动无效** | 修改了错误的位置 |
| 全局检查 | ✅ 无遗漏 | ❌ **检查不完整** | 遗漏了间接调用 |

**总体评分**：❌ **需要重做**

### 优点

1. ✅ **组件质量高**：TextEditModal 设计精良，支持单行/多行、快捷键、自动聚焦
2. ✅ **服务架构好**：textEditService 的 Promise API、全局服务模式设计合理
3. ✅ **代码简洁**：整体实现清晰，无冗余代码

### 🔴 核心问题

**改动了错误的位置**：
- ❌ 修改了 `widgets.js` 的 `createScrollableInput` 函数
- ❌ 但节点使用的是 LiteGraph 内置的 `addWidget('string', ...)`
- ❌ LiteGraph 内置 string widget 不走自定义的 `mouse` 回调
- ❌ 导致所有改动**完全无效**

### 问题列表

1. ❌ **改动未生效**（严重）：4 处 `addWidget('string', ...)` 未被替换
2. ⚠️ **rejectCallback 未使用**（低）：建议删除或在超时时调用
3. ⚠️ **内存泄漏风险**（低）：建议页面卸载时调用 `cancelEdit()`
4. ⚠️ **全局状态限制**（低）：不支持同时打开多个模态框

### 新 bug

❌ 是 — 改动未生效，用户仍看到原生 prompt

### 遗漏

❌ 是 — 未检查节点是否实际使用 `createScrollableInput`

---

## 额外发现

在审查过程中，发现以下已完成的工作：

1. **Day 2 任务 5-10**（代码审查问题修复）：
   - 双击画布搜索节点
   - Agent 发送锁定
   - SetupDialog 文案修正
   - 搜索节点列表清理
   - 双击时间间隔优化
   - 搜索框点击外部关闭

2. **Day 3 任务 11-12**（安全加固）：
   - execute_command 安全防护
   - search_in_files 参数化调用

所有任务均已在开发日志中记录，实现正确。

---

## 修复方案

### 方案 A（推荐）：修改节点使用自定义 widget

将节点中的 `addWidget('string', ...)` 替换为使用 `createScrollableInput`：

**PromptNode.js 修改**：
```javascript
import { createScrollableInput } from './widgets.js';

// 替换第 14 行
this._inputWidget = createScrollableInput('消息', '', (v) => {
  self._promptText = v;
}, { multiline: true });
this.addCustomWidget(this._inputWidget);
```

**ModelConfigNode.js 修改**：
```javascript
import { createScrollableInput } from './widgets.js';

// 替换第 22 行
this._apiKeyWidget = createScrollableInput('API Key', '', (v) => {
  this._apiKey = v;
  this.syncConfig();
}, { multiline: false });
this.addCustomWidget(this._apiKeyWidget);

// 类似替换第 27, 32 行
```

**优点**：
- ✅ 复用已有代码
- ✅ 保持节点布局逻辑不变

**缺点**：
- ⚠️ 需要调整节点尺寸计算

### 方案 B：修改 LiteGraph 源码

在 `litegraph.js` 中找到 string widget 的点击处理，替换为调用 `showTextEdit()`。

**优点**：
- ✅ 一处修改，全局生效

**缺点**：
- ❌ 修改第三方库，升级困难
- ❌ 需要理解 LiteGraph 内部机制

### 方案 C：重写 LiteGraph prompt 方法

在 `init.js` 中覆盖 `graph.prompt` 方法：

```javascript
import { showTextEdit } from '../services/textEditService.js';

// 覆盖 LiteGraph 的 prompt 方法
graph.prompt = function(title, value, callback) {
  showTextEdit(title, value, { multiline: true }).then((v) => {
    if (callback) callback(v);
  });
};
```

**优点**：
- ✅ 不修改 LiteGraph 源码
- ✅ 全局生效

**缺点**：
- ⚠️ 依赖 LiteGraph 的 `graph.prompt` 调用方式
- ⚠️ 需要验证所有 string widget 都走 `graph.prompt`

### 推荐方案

**优先尝试方案 C**（最简单），如果不可行则使用**方案 A**。

---

## 审查教训

本次审查遗漏的原因：

1. ✅ 检查了代码改动（widgets.js）
2. ✅ 检查了全局搜索（无 prompt 调用）
3. ❌ **没有检查代码是否被实际调用**
4. ❌ **没有检查 LiteGraph 内置机制**

**改进**：
- 审查时不仅要检查"改了什么"，还要检查"改动是否生效"
- 对于第三方库的集成，要理解其内部机制
- 用户实际测试是最好的验证方式
