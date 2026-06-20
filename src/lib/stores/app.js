/**
 * 全局应用状态管理
 * 统一管理所有分散的状态
 */

// ═══════════════════════════════════════════════════
//  模型配置
// ═══════════════════════════════════════════════════

export const MODEL_PRESETS = [
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { id: 'mimo', name: 'MiMo', baseUrl: 'https://api.xiaomi.com', model: 'mimo' },
  { id: 'gpt-4o', name: 'GPT-4o', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-128k' },
  { id: 'qwen-max', name: '通义千问 Max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
  { id: 'qwen-plus', name: '通义千问 Plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { id: 'custom', name: '自定义模型', baseUrl: '', model: '' }
];

let _config = {
  modelPreset: 'deepseek-v4-pro',
  apiKey: '',
  baseUrl: MODEL_PRESETS[0].baseUrl,
  model: MODEL_PRESETS[0].model,
  systemPrompt: ''
};

let _configListeners = [];

export function getConfig() {
  return _config;
}

export function setConfig(keyOrObj, value) {
  if (typeof keyOrObj === 'object' && keyOrObj !== null) {
    Object.assign(_config, keyOrObj);
  } else {
    _config[keyOrObj] = value;
  }
  _configListeners.forEach(fn => fn(_config));
}

export function setModelPreset(presetId) {
  const preset = MODEL_PRESETS.find(p => p.id === presetId);
  if (preset) {
    _config.modelPreset = presetId;
    _config.baseUrl = preset.baseUrl;
    _config.model = preset.model;
    _configListeners.forEach(fn => fn(_config));
  }
}

export function onConfigChange(fn) {
  _configListeners.push(fn);
  return () => { _configListeners = _configListeners.filter(f => f !== fn); };
}

// ═══════════════════════════════════════════════════
//  应用状态
// ═══════════════════════════════════════════════════

let _app = {
  agentMode: false,
  workDir: '未设置',
  mcpConnected: false,
  previewFilePath: '',
  leftWidth: 220,
  rightWidth: 280,
};

let _appListeners = [];

export function getApp() {
  return _app;
}

export function setApp(key, value) {
  _app[key] = value;
  _appListeners.forEach(fn => fn(_app));
}

export function onAppChange(fn) {
  _appListeners.push(fn);
  return () => { _appListeners = _appListeners.filter(f => f !== fn); };
}
