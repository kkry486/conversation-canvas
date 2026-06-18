<script>
  import { onMount } from 'svelte';
  import { initCanvas, createResponseAndSend, createNextPromptNode } from '$lib/canvas/init.js';
  import { getConfig } from '$lib/stores/config.js';

  let canvasEl;
  let graphData = $state(null);
  let nodeCount = $state(2);

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

    // 绑定初始节点
    const nodes = graphData.graph._nodes;
    const initialPrompt = nodes.find(n => n.type === 'Chat/输入');
    if (initialPrompt) {
      bindSend(initialPrompt);
    }

    // 自动绑定新创建的输入节点
    graphData.graph.onNodeAdded = (node) => {
      if (node.type === 'Chat/输入') {
        bindSend(node);
      }
    };

    return () => {
      if (graphData) graphData.graph.stop();
    };
  });

  function bindSend(promptNode) {
    promptNode.sendCallback = async () => {
      const text = promptNode._promptText.trim();
      if (!text) return;

      promptNode._sent = true;
      const config = getConfig();

      // 不再传 history —— 由 init.js 内部从图路径回溯组装
      const result = await createResponseAndSend(
        graphData, promptNode, config, text
      );

      if (result && result.text) {
        const newPrompt = createNextPromptNode(graphData, result.responseNode);
        nodeCount += 2;
        bindSend(newPrompt);
      }
    };
  }
</script>

<div class="canvas-container">
  <canvas bind:this={canvasEl}></canvas>

  <header class="toolbar">
    <div class="toolbar-left">
      <span class="logo-icon">◆</span>
      <span class="logo-text">对话画布</span>
    </div>
    <div class="toolbar-right">
      <span class="hint">双击空白处搜索节点 · 右键打开菜单</span>
    </div>
  </header>
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

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
  }

  .logo-icon {
    color: #e94560;
    font-size: 16px;
  }

  .logo-text {
    font-size: 14px;
    font-weight: 700;
    color: #e8eaf0;
  }

  .hint {
    font-size: 11px;
    color: #4a4d5a;
  }
</style>
