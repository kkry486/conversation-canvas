import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { registerModelConfigNode } from './ModelConfigNode.js';
import { registerPromptNode } from './PromptNode.js';
import { registerResponseNode } from './ResponseNode.js';
import { registerThinkingNode } from './ThinkingNode.js';
import { registerToolCallNode } from './ToolCallNode.js';
import { registerToolResultNode } from './ToolResultNode.js';
import { registerFileProductNode } from './FileProductNode.js';

export function initCanvas(canvasElement) {
  const LiteGraph = window.LiteGraph;
  const LGraph = window.LGraph;
  const LGraphCanvas = window.LGraphCanvas;

  if (!LiteGraph || !LGraph || !LGraphCanvas) {
    console.error('LiteGraph 未加载');
    return null;
  }

  // 注册自定义节点
  registerModelConfigNode(LiteGraph);
  registerPromptNode(LiteGraph);
  registerResponseNode(LiteGraph);
  registerThinkingNode(LiteGraph);
  registerToolCallNode(LiteGraph);
  registerToolResultNode(LiteGraph);
  registerFileProductNode(LiteGraph);

  // 清除 LiteGraph 默认节点类型，只保留自定义的
  const allowedTypes = new Set([
    'AI/模型配置', 'Chat/输入', 'Chat/回复',
    'Agent/思考', 'Agent/工具调用', 'Agent/工具结果', 'Agent/文件产物'
  ]);
  for (const key of Object.keys(LiteGraph.registered_node_types)) {
    if (!allowedTypes.has(key)) {
      delete LiteGraph.registered_node_types[key];
    }
  }

  // ========== 设置 canvas 实际像素尺寸 ==========
  const rect = canvasElement.getBoundingClientRect();
  canvasElement.width = rect.width;
  canvasElement.height = rect.height;

  // 创建图实例
  const graph = new LGraph();

  // 创建画布实例
  const canvas = new LGraphCanvas(canvasElement, graph);
  canvas.resize();

  // 配置交互
  canvas.allow_searchbox = false;
  canvas.allow_dragnodes = true;
  canvas.allow_interaction = true;
  canvas.render_canvas_border = false;
  canvas.render_connections_arrows = true;
  canvas.connections_arrows_size = 8;
  canvas.render_curved_connections = true;

  // 替换 LiteGraph 的滚轮处理：回复节点上滚动内容，其他地方缩放
  canvasElement.removeEventListener('mousewheel', canvas._mousewheel_callback);
  canvasElement.addEventListener('mousewheel', function (e) {
    canvas.adjustMouseEvent(e);
    const node = graph.getNodeOnPos(e.canvasX, e.canvasY);
    if (node && node._scrollable && node._responseText !== undefined) {
      e.preventDefault();
      const maxScroll = node._maxScroll || 0;
      node._scrollY = Math.max(0, Math.min(maxScroll, (node._scrollY || 0) + (e.deltaY > 0 ? 2 : -2)));
      canvas.dirty_canvas = true;
      return;
    }
    canvas.processMouseWheel(e);
  }, false);

  // 监听窗口尺寸变化
  window.addEventListener('resize', () => {
    const r = canvasElement.getBoundingClientRect();
    canvasElement.width = r.width;
    canvasElement.height = r.height;
    canvas.resize();
  });

  // ========== 深色主题 ==========
  LiteGraph.NODE_TITLE_COLOR = '#e8eaf0';
  LiteGraph.NODE_DEFAULT_COLOR = '#1a1d28';
  LiteGraph.NODE_DEFAULT_BGCOLOR = '#1a1d28';
  LiteGraph.NODE_DEFAULT_BOXCOLOR = '#e94560';
  LiteGraph.NODE_TEXT_COLOR = '#e8eaf0';
  LiteGraph.NODE_SUBTEXT_SIZE = 11;
  LiteGraph.NODE_TITLE_TEXT_FONT = 'bold 12px "SF Pro Display", "Segoe UI", sans-serif';
  LiteGraph.NODE_TEXT_SIZE = 12;
  LiteGraph.DEFAULT_BACKGROUND_IMAGE = '';
  LiteGraph.CONNECTING_LINK_COLOR = '#e94560';
  LiteGraph.LINK_COLOR = '#3a3d5a';

  canvas.background_image = '';
  canvas.clear_background = true;
  canvas.clear_background_color = '#0f1117';
  canvas.default_link_color = '#3a3d5a';
  canvas.highquality_render = true;

  // ========== 缩略图（Minimap）==========
  const minimap = {
    w: 180, h: 120, pad: 8, margin: 12,
    bg: 'rgba(15,17,23,0.85)',
    border: 'rgba(255,255,255,0.08)',
    viewportColor: 'rgba(233,69,96,0.3)',
    nodeColors: {
      'AI/模型配置': '#e94560',
      'Chat/输入': '#34d399',
      'Chat/回复': '#fbbf24',
      'Agent/思考': '#a78bfa',
      'Agent/工具调用': '#60a5fa',
      'Agent/工具结果': '#34d399',
      'Agent/文件产物': '#60a5fa'
    }
  };

  function drawMinimap(ctx) {
    const nodes = graph._nodes;
    if (!nodes || nodes.length === 0) return;

    const cw = canvasElement.width;
    const ch = canvasElement.height;
    const mx = cw - minimap.w - minimap.margin;
    const my = ch - minimap.h - minimap.margin;

    // 计算所有节点的包围盒
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.pos[0]);
      minY = Math.min(minY, n.pos[1]);
      maxX = Math.max(maxX, n.pos[0] + (n.size ? n.size[0] : 140));
      maxY = Math.max(maxY, n.pos[1] + (n.size ? n.size[1] : 60));
    }

    const graphW = Math.max(maxX - minX + 100, 1);
    const graphH = Math.max(maxY - minY + 100, 1);
    const scale = Math.min((minimap.w - minimap.pad * 2) / graphW, (minimap.h - minimap.pad * 2) / graphH);
    const offsetX = mx + minimap.pad + (minimap.w - minimap.pad * 2 - graphW * scale) / 2;
    const offsetY = my + minimap.pad + (minimap.h - minimap.pad * 2 - graphH * scale) / 2;

    // 背景
    ctx.fillStyle = minimap.bg;
    ctx.fillRect(mx, my, minimap.w, minimap.h);
    ctx.strokeStyle = minimap.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, minimap.w, minimap.h);

    // 画连线
    ctx.strokeStyle = 'rgba(58,61,90,0.5)';
    ctx.lineWidth = 0.5;
    for (const linkId in graph.links) {
      const link = graph.links[linkId];
      if (!link) continue;
      const originNode = graph.getNodeById(link.origin_id);
      const targetNode = graph.getNodeById(link.target_id);
      if (!originNode || !targetNode) continue;
      const x1 = offsetX + (originNode.pos[0] + (originNode.size ? originNode.size[0] : 70) - minX + 50) * scale;
      const y1 = offsetY + (originNode.pos[1] + 15 - minY + 50) * scale;
      const x2 = offsetX + (targetNode.pos[0] - minX + 50) * scale;
      const y2 = offsetY + (targetNode.pos[1] + 15 - minY + 50) * scale;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 画节点
    for (const n of nodes) {
      const nx = offsetX + (n.pos[0] - minX + 50) * scale;
      const ny = offsetY + (n.pos[1] - minY + 50) * scale;
      const nw = Math.max((n.size ? n.size[0] : 140) * scale, 3);
      const nh = Math.max((n.size ? n.size[1] : 60) * scale, 2);
      ctx.fillStyle = minimap.nodeColors[n.type] || '#4a4d5a';
      ctx.fillRect(nx, ny, nw, nh);
    }

    // 画当前视口
    const vpX = offsetX + (-canvas.ds.offset[0] - minX + 50) * scale;
    const vpY = offsetY + (-canvas.ds.offset[1] - minY + 50) * scale;
    const vpW = (canvasElement.width / canvas.ds.scale) * scale;
    const vpH = (canvasElement.height / canvas.ds.scale) * scale;
    ctx.strokeStyle = minimap.viewportColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }

  // 绘制缩略图（重置坐标系为屏幕坐标，固定在右下角）
  canvas.onDrawForeground = function (ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawMinimap(ctx);
    ctx.restore();
  };

  // 点击缩略图跳转
  canvasElement.addEventListener('mousedown', function (e) {
    const nodes = graph._nodes;
    if (!nodes || nodes.length === 0) return;

    const rect = canvasElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const mx = canvasElement.width - minimap.w - minimap.margin;
    const my = canvasElement.height - minimap.h - minimap.margin;

    if (px < mx || px > mx + minimap.w || py < my || py > my + minimap.h) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.pos[0]);
      minY = Math.min(minY, n.pos[1]);
      maxX = Math.max(maxX, n.pos[0] + (n.size ? n.size[0] : 140));
      maxY = Math.max(maxY, n.pos[1] + (n.size ? n.size[1] : 60));
    }
    const graphW = Math.max(maxX - minX + 100, 1);
    const graphH = Math.max(maxY - minY + 100, 1);
    const scale = Math.min((minimap.w - minimap.pad * 2) / graphW, (minimap.h - minimap.pad * 2) / graphH);
    const offsetX = mx + minimap.pad + (minimap.w - minimap.pad * 2 - graphW * scale) / 2;
    const offsetY = my + minimap.pad + (minimap.h - minimap.pad * 2 - graphH * scale) / 2;

    const graphX = (px - offsetX) / scale + minX - 50;
    const graphY = (py - offsetY) / scale + minY - 50;
    canvas.ds.offset[0] = -graphX + canvasElement.width / canvas.ds.scale / 2;
    canvas.ds.offset[1] = -graphY + canvasElement.height / canvas.ds.scale / 2;
    canvas.dirty_canvas = true;
    canvas.dirty_bgcanvas = true;
  });

  // 创建默认节点
  const configNode = LiteGraph.createNode('AI/模型配置');
  configNode.pos = [100, 220];
  graph.add(configNode);

  const promptNode = LiteGraph.createNode('Chat/输入');
  promptNode.pos = [460, 220];
  graph.add(promptNode);

  // 自动连线
  configNode.connect(0, promptNode, 0);

  // 限制右键菜单只显示自定义节点类型
  graph._allowedNodeTypes = [
    'AI/模型配置',
    'Chat/输入',
    'Chat/回复',
    'Agent/思考',
    'Agent/工具调用',
    'Agent/工具结果',
    'Agent/文件产物'
  ];

  graph.start();

  return { graph, canvas, LiteGraph, LGraph, LGraphCanvas };
}

/**
 * 创建回复节点并触发 API 流式调用
 */
export async function createResponseAndSend(graphData, promptNode, config, userMessage) {
  const { graph, LiteGraph } = graphData;

  // 从图中回溯祖先路径，组装对话历史
  const history = buildHistoryFromGraph(promptNode);

  const responseNode = LiteGraph.createNode('Chat/回复');
  responseNode.pos = [promptNode.pos[0] + 400, promptNode.pos[1]];
  graph.add(responseNode);

  promptNode.connect(0, responseNode, 0);

  responseNode._userMessage = userMessage;
  responseNode.setStatus('生成中');

  try {
    const text = await invoke('chat', {
      request: {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        systemPrompt: config.systemPrompt,
        message: userMessage,
        history
      }
    });

    responseNode.setText(text);
    responseNode._aiResponse = text;
    responseNode.setStatus('完成');
    return { responseNode, text };

  } catch (err) {
    responseNode.setText(`请求失败: ${err}`);
    responseNode.setStatus('错误');
    return { responseNode, text: '' };
  }
}

/**
 * 从当前输入节点回溯图路径，组装对话历史
 * 路径：当前Prompt → 上一个Response → 上一个Prompt → ... → 根
 * 返回 OpenAI 格式的 messages 数组（不含当前消息）
 */
export function buildHistoryFromGraph(promptNode) {
  const path = getAncestorPath(promptNode);
  const messages = [];

  for (const node of path) {
    if (node.type === 'Chat/输入' && node._promptText) {
      messages.push({ role: 'user', content: node._promptText });
    } else if (node.type === 'Chat/回复' && node._aiResponse) {
      messages.push({ role: 'assistant', content: node._aiResponse });
    }
  }

  return messages;
}

/**
 * 从节点沿输入口回溯，返回从根到当前节点的路径（不含当前节点）
 */
function getAncestorPath(node) {
  const path = [];
  const visited = new Set();
  let current = node;

  while (current) {
    // 沿 input[1]（上下文）回溯，没有就沿 input[0]（配置）回溯
    let inputSlot = null;
    if (current.inputs && current.inputs.length > 1 && current.inputs[1].link) {
      inputSlot = current.inputs[1];
    } else if (current.inputs && current.inputs.length > 0 && current.inputs[0].link) {
      inputSlot = current.inputs[0];
    } else {
      break;
    }

    const linkInfo = current.graph.links[inputSlot.link];
    if (!linkInfo) break;

    const parentNode = current.graph.getNodeById(linkInfo.origin_id);
    if (!parentNode || visited.has(parentNode.id)) break;

    visited.add(parentNode.id);
    path.push(parentNode);
    current = parentNode;
  }

  path.reverse();
  return path;
}

/**
 * 创建下一个输入节点并连线
 */
export function createNextPromptNode(graphData, responseNode) {
  const { graph, canvas, LiteGraph } = graphData;

  const newPromptNode = LiteGraph.createNode('Chat/输入');
  newPromptNode.pos = [responseNode.pos[0] + 440, responseNode.pos[1]];
  graph.add(newPromptNode);

  // 回复节点 → 新输入节点（上下文，输入口 1）
  responseNode.connect(0, newPromptNode, 1);

  // 配置节点 → 新输入节点（配置，输入口 0）
  const configNode = graph._nodes.find(n => n.type === 'AI/模型配置');
  if (configNode) {
    configNode.connect(0, newPromptNode, 0);
  }

  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;

  return newPromptNode;
}

/**
 * 导出对话图为 JSON 文件
 */
export async function exportGraph(graphData) {
  const data = graphData.graph.serialize();
  for (const node of graphData.graph._nodes) {
    const extra = {};
    if (node._promptText) extra._promptText = node._promptText;
    if (node._aiResponse) extra._aiResponse = node._aiResponse;
    if (node._responseText) extra._responseText = node._responseText;
    if (node._statusText) extra._statusText = node._statusText;
    if (node._apiKey) extra._apiKey = node._apiKey;
    if (node._systemPrompt) extra._systemPrompt = node._systemPrompt;
    if (node._selectedPreset) extra._selectedPresetId = node._selectedPreset.id;
    const nodeData = data.nodes.find(n => n.id === node.id);
    if (nodeData && Object.keys(extra).length > 0) {
      nodeData._customData = extra;
    }
  }

  const json = JSON.stringify(data, null, 2);
  const defaultName = `conversation-canvas-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (path) {
      await writeTextFile(path, json);
    }
  } catch {
    // 降级：浏览器下载
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * 从 JSON 导入对话图
 */
export function importGraph(graphData, jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    graphData.graph.configure(data);

    // 恢复自定义数据
    for (const nodeData of data.nodes) {
      if (!nodeData._customData) continue;
      const node = graphData.graph.getNodeById(nodeData.id);
      if (!node) continue;
      const extra = nodeData._customData;
      if (extra._promptText) node._promptText = extra._promptText;
      if (extra._aiResponse) {
        node._aiResponse = extra._aiResponse;
        node.setText && node.setText(extra._aiResponse);
      }
      if (extra._responseText) {
        node._responseText = extra._responseText;
        node.setText && node.setText(extra._responseText);
      }
      if (extra._statusText) {
        node.setStatus && node.setStatus(extra._statusText.replace(/^[^\s]+\s/, ''));
      }
    }

    graphData.canvas.dirty_canvas = true;
    graphData.canvas.dirty_bgcanvas = true;
    return true;
  } catch (e) {
    console.error('导入失败:', e);
    return false;
  }
}

/**
 * Agent 模式：调用 /api/agent，通过 SSE 接收 Agent 循环事件
 * 在节点图上实时创建 思考/工具调用/工具结果 节点
 */
export async function createAgentResponse(graphData, promptNode, config, userMessage, useMcp = false) {
  const { graph, canvas, LiteGraph } = graphData;

  const history = buildHistoryFromGraph(promptNode);

  // 创建回复节点
  const responseNode = LiteGraph.createNode('Chat/回复');
  responseNode.pos = [promptNode.pos[0] + 400, promptNode.pos[1]];
  graph.add(responseNode);
  promptNode.connect(0, responseNode, 0);
  responseNode._userMessage = userMessage;
  responseNode.setStatus('生成中');

  let lastNode = responseNode;
  let lastY = responseNode.pos[1] + responseNode.size[1];
  let fullText = '';
  let currentThinkingNode = null;
  let currentToolCallNode = null;

  function nextPos(baseX, offset) {
    lastY += offset;
    return [baseX, lastY];
  }

  // 监听 Rust 后端推送的 agent 事件
  const unlisten = await listen('agent-event', (event) => {
    const ev = event.payload;

    switch (ev.type) {
      case 'thinking': {
        if (!currentThinkingNode || currentThinkingNode._statusText.includes('完成')) {
          currentThinkingNode = LiteGraph.createNode('Agent/思考');
          const pos = nextPos(responseNode.pos[0] - 60, 180);
          currentThinkingNode.pos = pos;
          graph.add(currentThinkingNode);
          lastNode.connect(0, currentThinkingNode, 0);
          lastNode = currentThinkingNode;
          canvas.dirty_canvas = true;
        }
        currentThinkingNode.appendText(ev.content);
        break;
      }

      case 'text_delta': {
        fullText += ev.content;
        responseNode.appendText(ev.content);
        break;
      }

      case 'tool_call': {
        if (currentThinkingNode && !currentThinkingNode._statusText.includes('完成')) {
          currentThinkingNode.setStatus('完成');
        }
        currentThinkingNode = null;

        currentToolCallNode = LiteGraph.createNode('Agent/工具调用');
        const pos = nextPos(responseNode.pos[0] - 60, 180);
        currentToolCallNode.pos = pos;
        graph.add(currentToolCallNode);
        lastNode.connect(0, currentToolCallNode, 0);
        lastNode = currentToolCallNode;
        currentToolCallNode.setToolCall(ev.name, ev.arguments);
        canvas.dirty_canvas = true;
        break;
      }

      case 'tool_result': {
        if (currentToolCallNode) {
          currentToolCallNode.setResult(ev.success);
        }

        const resultNode = LiteGraph.createNode('Agent/工具结果');
        const pos = nextPos(responseNode.pos[0] - 60, 180);
        resultNode.pos = pos;
        graph.add(resultNode);
        lastNode.connect(0, resultNode, 0);
        lastNode = resultNode;
        resultNode.setResult(ev.name, ev.success, ev.content);

        // write_file 成功时，创建文件产物节点
        if (ev.name === 'write_file' && ev.success && ev.filePath) {
          const fileNode = LiteGraph.createNode('Agent/文件产物');
          const filePos = nextPos(responseNode.pos[0] - 60, 180);
          fileNode.pos = filePos;
          graph.add(fileNode);
          lastNode.connect(0, fileNode, 0);
          lastNode = fileNode;
          fileNode.setFile(ev.fileName, ev.filePath);
        }

        currentToolCallNode = null;
        canvas.dirty_canvas = true;
        canvas.dirty_bgcanvas = true;
        break;
      }

      case 'done': {
        if (currentThinkingNode && !currentThinkingNode._statusText.includes('完成')) {
          currentThinkingNode.setStatus('完成');
        }
        if (currentToolCallNode) {
          currentToolCallNode.setResult(true);
        }
        responseNode._aiResponse = fullText;
        responseNode.setStatus('完成');
        canvas.dirty_canvas = true;
        canvas.dirty_bgcanvas = true;
        break;
      }

      case 'error': {
        responseNode.setText(`Agent 错误: ${ev.content}`);
        responseNode.setStatus('错误');
        break;
      }
    }
  });

  try {
    // 调用 Rust 后端的 agent 命令（异步，通过事件推送进度）
    await invoke('agent', {
      request: {
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        systemPrompt: config.systemPrompt,
        message: userMessage,
        history,
        useMcp
      }
    });

    return { responseNode, text: fullText };

  } catch (err) {
    responseNode.setText(`请求失败: ${err}`);
    responseNode.setStatus('错误');
    return { responseNode, text: '' };
  } finally {
    unlisten();
  }
}
