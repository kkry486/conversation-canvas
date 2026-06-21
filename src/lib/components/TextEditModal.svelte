<script>
  let { title = '编辑', value = '', placeholder = '', multiline = false, onConfirm, onCancel } = $props();
  let editValue = $state(value);
  let textareaEl = $state(null);

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

  // 自动聚焦
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
        <textarea
          bind:this={textareaEl}
          bind:value={editValue}
          {placeholder}
          rows="8"
          use:autofocus
        ></textarea>
      {:else}
        <input
          type="text"
          bind:value={editValue}
          {placeholder}
          use:autofocus
        />
      {/if}
    </div>

    <div class="actions">
      <button class="btn-cancel" onclick={handleCancel}>取消</button>
      <button class="btn-confirm" onclick={handleConfirm}>确认</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .dialog {
    background: #1a1d28;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    width: 480px;
    max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2d3a;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: #e8eaf0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #8b90a0;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #e8eaf0;
  }

  .body {
    padding: 16px 20px;
  }

  input, textarea {
    width: 100%;
    padding: 10px 12px;
    background: #12141d;
    color: #e8eaf0;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    font-size: 13px;
    font-family: "JetBrains Mono", "Fira Code", monospace, "Microsoft YaHei";
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  input:focus, textarea:focus {
    border-color: #e94560;
    box-shadow: 0 0 0 3px rgba(233, 69, 96, 0.15);
  }

  textarea {
    resize: vertical;
    line-height: 1.6;
    min-height: 120px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #2a2d3a;
  }

  .btn-cancel {
    background: transparent;
    color: #8b90a0;
    border: 1px solid #2a2d3a;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel:hover {
    color: #e8eaf0;
    border-color: #4a4d5a;
  }

  .btn-confirm {
    background: #e94560;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-confirm:hover {
    background: #ff6b81;
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.35);
  }
</style>
