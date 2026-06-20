<script>
  import { invoke } from '@tauri-apps/api/core';

  let { filePath = $bindable('') } = $props();

  let content = $state('');
  let fileName = $state('');
  let loading = $state(false);

  $effect(() => {
    if (filePath) {
      loadFile(filePath);
    } else {
      content = '';
      fileName = '';
    }
  });

  async function loadFile(path) {
    loading = true;
    fileName = path.split(/[/\\]/).pop() || '';
    try {
      const text = await invoke('read_file_content', { path });
      content = text;
    } catch (e) {
      content = `读取失败: ${e}`;
    } finally {
      loading = false;
    }
  }
</script>

<div class="file-preview">
  <div class="preview-header">
    <span class="file-name">📄 {fileName || '预览'}</span>
  </div>

  {#if filePath}
    {#if loading}
      <div class="loading">加载中...</div>
    {:else}
      <pre class="code"><code>{content}</code></pre>
    {/if}
  {:else}
    <div class="empty">
      <span class="empty-icon">📄</span>
      <span class="empty-text">点击文件查看内容</span>
    </div>
  {/if}
</div>

<style>
  .file-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #12141d;
  }

  .preview-header {
    padding: 8px 12px;
    border-bottom: 1px solid #2a2d3a;
  }

  .file-name {
    font-size: 12px;
    font-weight: 600;
    color: #8b90a0;
  }

  .loading {
    padding: 20px;
    text-align: center;
    color: #6b7080;
    font-size: 12px;
  }

  .code {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: #c8cad0;
    background: transparent;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #4a4d5a;
  }

  .empty-icon {
    font-size: 24px;
  }

  .empty-text {
    font-size: 12px;
  }
</style>
