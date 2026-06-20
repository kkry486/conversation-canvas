<script>
  import { listen } from '@tauri-apps/api/event';

  let { onAgentStart, onAgentDone } = $props();

  let logs = $state([]);
  let autoScroll = $state(true);
  let logContainer;
  let agentRunning = $state(false);

  $effect(() => {
    let unlisten;
    listen('agent-event', (event) => {
      const ev = event.payload;
      const entry = formatEvent(ev);
      if (entry) {
        logs = [...logs, entry];
        if (autoScroll && logContainer) {
          setTimeout(() => {
            logContainer.scrollTop = logContainer.scrollHeight;
          }, 50);
        }
      }
      // Agent 开始
      if (ev.type === 'thinking' || ev.type === 'tool_call') {
        if (!agentRunning) {
          agentRunning = true;
          onAgentStart?.();
        }
      }
      // Agent 完成
      if (ev.type === 'done' || ev.type === 'error') {
        agentRunning = false;
        setTimeout(() => onAgentDone?.(), 500);
      }
    }).then(fn => { unlisten = fn; });

    return () => unlisten?.();
  });

  function formatEvent(ev) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    switch (ev.type) {
      case 'thinking':
        return { time, type: '思考', icon: '🧠', content: ev.content, color: '#a78bfa' };
      case 'text_delta':
        return null; // 文本增量不单独显示
      case 'tool_call':
        return { time, type: '调用', icon: '🔧', content: `${ev.name}(${formatArgs(ev.arguments)})`, color: '#60a5fa' };
      case 'tool_result':
        return { time, type: '结果', icon: ev.success ? '✅' : '❌', content: ev.content?.slice(0, 200) || '', color: ev.success ? '#34d399' : '#e94560' };
      case 'done':
        return { time, type: '完成', icon: '✓', content: `Agent 完成（${ev.iterations || '?'} 轮）`, color: '#34d399' };
      case 'error':
        return { time, type: '错误', icon: '⚠️', content: ev.content, color: '#e94560' };
      default:
        return null;
    }
  }

  function formatArgs(args) {
    if (!args) return '';
    if (typeof args === 'string') return args.slice(0, 60);
    const str = JSON.stringify(args);
    return str.length > 60 ? str.slice(0, 60) + '...' : str;
  }

  function clearLogs() {
    logs = [];
  }
</script>

<div class="agent-log">
  <div class="log-header">
    <span class="log-title">📋 Agent 日志</span>
    <div class="log-actions">
      <span class="log-count">{logs.length}</span>
      <button class="clear-btn" onclick={clearLogs} title="清空">🗑</button>
    </div>
  </div>

  <div class="log-content" bind:this={logContainer}>
    {#if logs.length === 0}
      <div class="empty-hint">Agent 运行时会在这里显示思考过程</div>
    {:else}
      {#each logs as entry}
        <div class="log-entry">
          <span class="log-time">{entry.time}</span>
          <span class="log-icon" style="color: {entry.color}">{entry.icon}</span>
          <span class="log-type" style="color: {entry.color}">{entry.type}</span>
          <span class="log-text">{entry.content}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .agent-log {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #12141d;
    border-left: 1px solid #2a2d3a;
  }

  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid #2a2d3a;
  }

  .log-title {
    font-size: 12px;
    font-weight: 600;
    color: #8b90a0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .log-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .log-count {
    font-size: 10px;
    color: #6b7080;
    background: rgba(255,255,255,0.06);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: #6b7080;
    font-size: 12px;
    cursor: pointer;
    padding: 2px;
  }

  .clear-btn:hover { color: #e94560; }

  .log-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .empty-hint {
    padding: 20px 12px;
    font-size: 12px;
    color: #6b7080;
    text-align: center;
  }

  .log-entry {
    display: flex;
    gap: 6px;
    padding: 4px 12px;
    font-size: 11px;
    line-height: 1.5;
    align-items: flex-start;
  }

  .log-entry:hover {
    background: rgba(255,255,255,0.02);
  }

  .log-time {
    color: #4a4d5a;
    font-family: monospace;
    font-size: 10px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .log-icon {
    flex-shrink: 0;
    font-size: 11px;
  }

  .log-type {
    font-weight: 600;
    flex-shrink: 0;
    min-width: 30px;
  }

  .log-text {
    color: #c8cad0;
    word-break: break-all;
  }
</style>
