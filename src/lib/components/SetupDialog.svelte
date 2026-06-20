<script>
  import { invoke } from '@tauri-apps/api/core';

  let { onSetup } = $props();

  let model = $state('deepseek-chat');
  let apiKey = $state('');
  let baseUrl = $state('https://api.deepseek.com/v1');
  let systemPrompt = $state('');
  let remember = $state(true);

  const models = [
    { id: 'deepseek-chat', name: 'DeepSeek V4 Pro', url: 'https://api.deepseek.com/v1' },
    { id: 'deepseek-reasoner', name: 'DeepSeek V4 Flash', url: 'https://api.deepseek.com/v1' },
    { id: 'gpt-4o', name: 'GPT-4o', url: 'https://api.openai.com/v1' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', url: 'https://api.openai.com/v1' },
    { id: 'qwen-max', name: '通义千问 Max', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', url: 'https://api.moonshot.cn/v1' },
    { id: 'glm-4-plus', name: 'GLM-4 Plus', url: 'https://open.bigmodel.cn/api/paas/v4' },
  ];

  function onModelChange() {
    const m = models.find(m => m.id === model);
    if (m) baseUrl = m.url;
  }

  async function save() {
    if (!apiKey.trim()) {
      alert('请输入 API Key');
      return;
    }
    const config = { model, apiKey, baseUrl, systemPrompt, remember };
    await invoke('save_config', { config });
    onSetup(config);
  }

  function skip() {
    onSetup(null);
  }
</script>

<div class="overlay">
  <div class="dialog">
    <div class="header">
      <span class="logo">◆</span>
      <h1>对话画布</h1>
      <p class="subtitle">首次使用，请配置 AI 模型</p>
    </div>

    <div class="form">
      <label>
        <span class="label">模型</span>
        <select bind:value={model} onchange={onModelChange}>
          {#each models as m}
            <option value={m.id}>{m.name}</option>
          {/each}
          <option value="custom">自定义模型</option>
        </select>
      </label>

      <label>
        <span class="label">API Key</span>
        <input type="password" bind:value={apiKey} placeholder="sk-..." />
      </label>

      <label>
        <span class="label">Base URL</span>
        <input type="text" bind:value={baseUrl} />
      </label>

      <label>
        <span class="label">System Prompt <span class="optional">（可选）</span></span>
        <textarea bind:value={systemPrompt} placeholder="你是一个专业的编程助手..." rows="3"></textarea>
      </label>

      <label class="checkbox">
        <input type="checkbox" bind:checked={remember} />
        <span>记住我的配置（加密存储到本地）</span>
      </label>
    </div>

    <div class="actions">
      <button class="btn-skip" onclick={skip}>跳过</button>
      <button class="btn-save" onclick={save}>保存并进入</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: #1a1d28;
    border: 1px solid #2a2d3a;
    border-radius: 16px;
    width: 440px;
    padding: 32px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  .header {
    text-align: center;
    margin-bottom: 28px;
  }

  .logo {
    font-size: 28px;
    color: #e94560;
  }

  h1 {
    font-size: 20px;
    color: #e8eaf0;
    margin: 8px 0 4px;
  }

  .subtitle {
    font-size: 13px;
    color: #8b90a0;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: 12px;
    font-weight: 600;
    color: #8b90a0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .optional {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #6b7080;
  }

  input, select, textarea {
    width: 100%;
    padding: 10px 12px;
    background: #12141d;
    color: #e8eaf0;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  input:focus, select:focus, textarea:focus {
    border-color: #e94560;
    box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.15);
  }

  select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238b90a0'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  textarea {
    resize: vertical;
    line-height: 1.6;
  }

  .checkbox {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #8b90a0;
    cursor: pointer;
  }

  .checkbox input {
    width: auto;
    accent-color: #e94560;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: 24px;
  }

  .btn-skip {
    background: transparent;
    color: #8b90a0;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-skip:hover {
    color: #e8eaf0;
    border-color: #4a4d5a;
  }

  .btn-save {
    background: #e94560;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-save:hover {
    background: #ff6b81;
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.35);
  }
</style>
