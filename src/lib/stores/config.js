// 模型配置预设（全部使用 OpenAI 兼容格式）
export const MODEL_PRESETS = [
  // DeepSeek
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
  // MiMo
  {
    id: 'mimo',
    name: 'MiMo',
    baseUrl: 'https://api.xiaomi.com',
    model: 'mimo'
  },
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  // Moonshot (Kimi)
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot v1 128K',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k'
  },
  // 通义千问
  {
    id: 'qwen-max',
    name: '通义千问 Max',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-max'
  },
  {
    id: 'qwen-plus',
    name: '通义千问 Plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  },
  // 智谱 GLM
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus'
  },
  // 自定义
  {
    id: 'custom',
    name: '自定义模型',
    baseUrl: '',
    model: ''
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
