/**
 * 全局文本编辑服务
 * 用于从非 Svelte 代码（如 widgets.js）触发文本编辑模态框
 */

let resolveCallback = null;
let rejectCallback = null;
let currentOptions = null;

// 状态更新回调（由 Svelte 组件设置）
let onUpdate = null;

/**
 * 显示文本编辑模态框
 * @param {string} title - 模态框标题
 * @param {string} defaultValue - 默认值
 * @param {object} opts - 选项
 * @returns {Promise<string|null>} 用户输入的文本，取消返回 null
 */
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

/**
 * 确认编辑
 * @param {string} value - 用户输入的值
 */
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

/**
 * 取消编辑
 */
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

/**
 * 设置状态更新回调
 * @param {function} callback - 回调函数
 */
export function setUpdateCallback(callback) {
  onUpdate = callback;
}

/**
 * 获取当前状态
 */
export function getState() {
  return {
    visible: !!currentOptions,
    ...currentOptions,
  };
}
