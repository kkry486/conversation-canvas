<script>
  import { onMount } from 'svelte';
  import { initCanvas, createResponseAndSend, createNextPromptNode, exportGraph, importGraph } from '$lib/canvas/init.js';
  import { getConfig } from '$lib/stores/config.js';

  let canvasEl;
  let graphData = $state(null);
  let nodeCount = $state(2);
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searchIndex = $state(-1);
  let showPicker = $state(false);
  let showCompare = $state(false);
  let pickedNodes = $state([]);
  let allResponseNodes = $state([]);
  let selectedRespNodes = new Set(); // 画布上当前选中的回复节点

  onMount(async () => {
    if (!window.LiteGraph) {
      const script = document.createElement('script');
      script.src = '/litegraph/litegraph.js';
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }

    graphData = initCanvas(canvasEl);
    if (!graphData) return;

    const nodes = graphData.graph._nodes;
    const initialPrompt = nodes.find(n => n.type === 'Chat/输入');
    if (initialPrompt) bindSend(initialPrompt);

    graphData.graph.onNodeAdded = (node) => {
      if (node.type === 'Chat/输入') bindSend(node);
    };

    // 跟踪选中的回复节点
    graphData.canvas.onNodeSelected = (node) => {
      if (node.type === 'Chat/回复') selectedRespNodes.add(node);
    };
    graphData.canvas.onNodeDeselected = (node) => {
      selectedRespNodes.delete(node);
    };

    return () => { if (graphData) graphData.graph.stop(); };
  });

  function bindSend(promptNode) {
    promptNode.sendCallback = async () => {
      const text = promptNode._promptText.trim();
      if (!text) return;
      promptNode._sent = true;
      const config = getConfig();
      const result = await createResponseAndSend(graphData, promptNode, config, text);
      if (result && result.text) {
        const newPrompt = createNextPromptNode(graphData, result.responseNode);
        nodeCount += 2;
        bindSend(newPrompt);
      }
    };
  }

  function doSearch() {
    if (!graphData || !searchQuery.trim()) {
      searchResults = [];
      searchIndex = -1;
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const matches = graphData.graph._nodes.filter(n => {
      const text = (n._promptText || n._aiResponse || n._responseText || '').toLowerCase();
      return text.includes(q);
    });
    searchResults = matches;
    searchIndex = matches.length > 0 ? 0 : -1;
    if (searchIndex >= 0) focusNode(matches[0]);
  }

  function focusNode(node) {
    if (!graphData || !node) return;
    const canvas = graphData.canvas;
    const cw = canvasElement ? canvasElement.width / canvas.ds.scale : 800;
    const ch = canvasElement ? canvasElement.height / canvas.ds.scale : 600;
    canvas.ds.offset[0] = -node.pos[0] + cw / 2 - (node.size ? node.size[0] / 2 : 70);
    canvas.ds.offset[1] = -node.pos[1] + ch / 2 - (node.size ? node.size[1] / 2 : 30);
    // 高亮选中
    graphData.graph.selectNodes([node]);
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  }

  function nextResult() {
    if (searchResults.length === 0) return;
    searchIndex = (searchIndex + 1) % searchResults.length;
    focusNode(searchResults[searchIndex]);
  }

  function prevResult() {
    if (searchResults.length === 0) return;
    searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
    focusNode(searchResults[searchIndex]);
  }

  function onSearchKey(e) {
    if (e.key === 'Enter') {
      if (e.shiftKey) prevResult();
      else if (searchResults.length > 0) nextResult();
      else doSearch();
    } else if (e.key === 'Escape') {
      searchQuery = '';
      searchResults = [];
      searchIndex = -1;
    }
  }

  // 引用 canvasEl 给搜索用
  let canvasElement = $state(null);
  $effect(() => { canvasElement = canvasEl; });

  // 对比分支按钮点击
  function onCompareClick() {
    if (!graphData) return;
    allResponseNodes = graphData.graph._nodes.filter(n => n.type === 'Chat/回复' && n._responseText);

    // 过滤出当前选中的回复节点
    const selected = allResponseNodes.filter(n => selectedRespNodes.has(n));

    if (selected.length >= 2) {
      // 选中 2+ 个：直接对比
      pickedNodes = selected;
      showCompare = true;
    } else {
      // 选中 0~1 个：弹窗选择，已选中的预勾选
      pickedNodes = selected.length === 1 ? [selected[0]] : [];
      showPicker = true;
    }
  }

  function togglePick(node) {
    const idx = pickedNodes.indexOf(node);
    if (idx >= 0) pickedNodes.splice(idx, 1);
    else pickedNodes.push(node);
    pickedNodes = pickedNodes;
  }

  function startCompare() {
    if (pickedNodes.length >= 2) {
      showPicker = false;
      showCompare = true;
    }
  }

  // 保存/加载
  function saveGraph() {
    if (graphData) exportGraph(graphData);
  }

  function loadGraph() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const ok = importGraph(graphData, ev.target.result);
        if (!ok) alert('导入失败，请检查文件格式');
      };
      reader.readAsText(file);
    };
    input.click();
  }
</script>

<div class="canvas-container">
  <canvas bind:this={canvasEl}></canvas>

  <header class="toolbar">
    <div class="toolbar-left">
      <span class="logo-icon">◆</span>
      <span class="logo-text">对话画布</span>
      <button class="toolbar-btn" onclick={saveGraph} title="保存对话">💾</button>
      <button class="toolbar-btn" onclick={loadGraph} title="加载对话">📂</button>
    </div>

    <div class="toolbar-center">
      <div class="search-box">
        <input
          type="text"
          placeholder="搜索对话内容..."
          bind:value={searchQuery}
          oninput={doSearch}
          onkeydown={onSearchKey}
        />
        {#if searchResults.length > 0}
          <span class="search-count">{searchIndex + 1}/{searchResults.length}</span>
          <button class="search-nav" onclick={prevResult}>‹</button>
          <button class="search-nav" onclick={nextResult}>›</button>
        {/if}
      </div>
    </div>

    <div class="toolbar-right">
      <button class="compare-btn" onclick={onCompareClick}>⚡ 对比分支</button>
      <span class="hint">双击空白处搜索节点 · 右键打开菜单</span>
    </div>
  </header>

  <!-- 选择对比节点弹窗 -->
  {#if showPicker}
    <div class="compare-overlay" onclick={(e) => { if (e.target === e.currentTarget) showPicker = false; }}>
      <div class="picker-modal">
        <div class="compare-header">
          <span>选择要对比的回复节点</span>
          <button class="compare-close" onclick={() => showPicker = false}>✕</button>
        </div>
        <div class="picker-list">
          {#if allResponseNodes.length === 0}
            <div class="picker-empty">暂无回复节点</div>
          {:else}
            {#each allResponseNodes as node, i}
              <label class="picker-item" class:picked={pickedNodes.includes(node)}>
                <input type="checkbox" checked={pickedNodes.includes(node)} onchange={() => togglePick(node)} />
                <span class="picker-label">回复 #{i + 1}</span>
                <span class="picker-preview">{(node._responseText || '').slice(0, 60)}...</span>
              </label>
            {/each}
          {/if}
        </div>
        <div class="picker-footer">
          <span class="picker-count">已选 {pickedNodes.length} 个</span>
          <button class="picker-confirm" disabled={pickedNodes.length < 2} onclick={startCompare}>开始对比</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- 对比弹窗 -->
  {#if showCompare}
    <div class="compare-overlay" onclick={(e) => { if (e.target === e.currentTarget) showCompare = false; }}>
      <div class="compare-modal" style="max-width: {Math.min(pickedNodes.length * 400, 1400)}px;">
        <div class="compare-header">
          <span>分支对比（{pickedNodes.length} 个分支）</span>
          <button class="compare-close" onclick={() => showCompare = false}>✕</button>
        </div>
        <div class="compare-body">
          {#each pickedNodes as node, i}
            {#if i > 0}<div class="compare-divider"></div>{/if}
            <div class="compare-col">
              <div class="compare-title">分支 {String.fromCharCode(65 + i)}</div>
              <div class="compare-text">{node._responseText || '（无内容）'}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .canvas-container {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    background: rgba(15, 17, 23, 0.85);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 100;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    user-select: none;
  }

  .toolbar-left, .toolbar-center, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-left { flex: 1; }
  .toolbar-center { flex: 0 0 auto; }
  .toolbar-right { flex: 1; justify-content: flex-end; }

  .logo-icon {
    color: #e94560;
    font-size: 16px;
  }

  .logo-text {
    font-size: 14px;
    font-weight: 700;
    color: #e8eaf0;
  }

  .toolbar-btn {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 4px 10px;
  }

  .search-box:focus-within {
    border-color: rgba(233, 69, 96, 0.5);
  }

  .search-box input {
    background: none;
    border: none;
    color: #e8eaf0;
    font-size: 13px;
    width: 180px;
    outline: none;
  }

  .search-box input::placeholder {
    color: #4a4d5a;
  }

  .search-count {
    font-size: 11px;
    color: #8b90a0;
    white-space: nowrap;
  }

  .search-nav {
    background: none;
    border: none;
    color: #8b90a0;
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .search-nav:hover {
    color: #e8eaf0;
  }

  .hint {
    font-size: 11px;
    color: #4a4d5a;
  }

  /* 对比按钮 */
  .compare-btn {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .compare-btn:hover {
    background: rgba(251, 191, 36, 0.25);
  }

  /* 选择器弹窗 */
  .picker-modal {
    background: #1a1d28;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    width: 500px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .picker-empty {
    padding: 20px;
    text-align: center;
    color: #4a4d5a;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .picker-item:hover { background: rgba(255, 255, 255, 0.04); }
  .picker-item.picked { background: rgba(251, 191, 36, 0.1); }

  .picker-item input[type="checkbox"] {
    accent-color: #fbbf24;
  }

  .picker-label {
    font-size: 13px;
    font-weight: 600;
    color: #e8eaf0;
    white-space: nowrap;
  }

  .picker-preview {
    font-size: 11px;
    color: #6b7080;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .picker-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-top: 1px solid #2a2d3a;
  }

  .picker-count {
    font-size: 12px;
    color: #8b90a0;
  }

  .picker-confirm {
    padding: 6px 16px;
    background: #fbbf24;
    color: #0f1117;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .picker-confirm:disabled {
    background: #3a3d4a;
    color: #6b7080;
    cursor: not-allowed;
  }

  .picker-confirm:not(:disabled):hover {
    background: #fcd34d;
  }

  /* 对比弹窗 */
  .compare-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .compare-modal {
    background: #1a1d28;
    border: 1px solid #2a2d3a;
    border-radius: 12px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .compare-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid #2a2d3a;
    font-weight: 600;
    color: #fbbf24;
  }

  .compare-close {
    background: none;
    border: none;
    color: #8b90a0;
    font-size: 18px;
    cursor: pointer;
  }

  .compare-close:hover { color: #e8eaf0; }

  .compare-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .compare-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .compare-divider {
    width: 1px;
    background: #2a2d3a;
  }

  .compare-title {
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 600;
    color: #8b90a0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .compare-text {
    flex: 1;
    padding: 16px;
    font-size: 13px;
    line-height: 1.7;
    color: #e8eaf0;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: "JetBrains Mono", "Fira Code", monospace, "Microsoft YaHei";
  }
</style>
