<script>
  let { onSend, placeholder = '输入你的任务...' } = $props();
  let value = $state('');

  function send() {
    const text = value.trim();
    if (!text) return;
    value = '';
    onSend?.(text);
  }
</script>

<div class="fixed-input">
  <input
    type="text"
    bind:value
    {placeholder}
    onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
  />
  <button onclick={send} disabled={!value.trim()}>▸ 发送</button>
</div>

<style>
  .fixed-input {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(12px);
    border-top: 1px solid #2a2d3a;
    z-index: 100;
  }

  input {
    flex: 1;
    padding: 10px 14px;
    background: #1a1d28;
    color: #e8eaf0;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }

  input:focus {
    border-color: #e94560;
    box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.15);
  }

  button {
    background: #e94560;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    background: #ff6b81;
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.35);
  }

  button:disabled {
    background: #3a3d4a;
    color: #6b7080;
    cursor: not-allowed;
  }
</style>
