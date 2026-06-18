// 模型配置预设
export const MODEL_PRESETS = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro'
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  },
  {
    id: 'mimo',
    name: 'MiMo',
    baseUrl: 'https://api.xiaomi.com',
    model: 'mimo'
  }
];

// 当前会话配置
let currentConfig = {
  modelPreset: 'deepseek-v4-pro',
  apiKey: '',
  baseUrl: MODEL_PRESETS[0].baseUrl,
  model: MODEL_PRESETS[0].model,
  systemPrompt: ''
};

export function getConfig() {
  return currentConfig;
}

export function setConfig(key, value) {
  currentConfig[key] = value;
}

export function setModelPreset(presetId) {
  const preset = MODEL_PRESETS.find(p => p.id === presetId);
  if (preset) {
    currentConfig.modelPreset = presetId;
    currentConfig.baseUrl = preset.baseUrl;
    currentConfig.model = preset.model;
  }
}
