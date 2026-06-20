/**
 * 画布初始化
 * 职责：初始化 LiteGraph 画布、注册节点、配置主题
 */

import { registerModelConfigNode } from './ModelConfigNode.js';
import { registerPromptNode } from './PromptNode.js';
import { registerResponseNode } from './ResponseNode.js';
import { registerThinkingNode } from './ThinkingNode.js';
import { registerToolCallNode } from './ToolCallNode.js';
import { registerToolResultNode } from './ToolResultNode.js';
import { registerFileProductNode } from './FileProductNode.js';

export { createResponseAndSend, buildHistoryFromGraph, createNextPromptNode } from './chat.js';
export { createAgentResponse } from './agent.js';
export { exportGraph, importGraph } from './io.js';

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

  // 清除默认节点类型，只保留自定义的
  const allowedTypes = new Set([
    'AI/模型配置', 'Chat/输入', 'Chat/回复',
    'Agent/思考', 'Agent/工具调用', 'Agent/工具结果', 'Agent/文件产物'
  ]);
  for (const key of Object.keys(LiteGraph.registered_node_types)) {
    if (!allowedTypes.has(key)) {
      delete LiteGraph.registered_node_types[key];
    }
  }

  // 设置 canvas 尺寸
  const rect = canvasElement.getBoundingClientRect();
  canvasElement.width = rect.width;
  canvasElement.height = rect.height;

  const graph = new LGraph();
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

  // 替换滚轮处理：回复节点上滚动内容，其他地方缩放
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

  // ========== 缩略图 ==========
  const minimap = {
    w: 180, h: 120, pad: 8, margin: 12,
    bg: 'rgba(15,17,23,0.85)',
    border: 'rgba(255,255,255,0.08)',
    viewportColor: 'rgba(233,69,96,0.3)',
    nodeColors: {
      'AI/模型配置': '#e94560', 'Chat/输入': '#34d399', 'Chat/回复': '#fbbf24',
      'Agent/思考': '#a78bfa', 'Agent/工具调用': '#60a5fa',
      'Agent/工具结果': '#34d399', 'Agent/文件产物': '#60a5fa'
    }
  };

  function drawMinimap(ctx) {
    const nodes = graph._nodes;
    if (!nodes || nodes.length === 0) return;
    const cw = canvasElement.width;
    const ch = canvasElement.height;
    const mx = cw - minimap.w - minimap.margin;
    const my = ch - minimap.h - minimap.margin;

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

    ctx.fillStyle = minimap.bg;
    ctx.fillRect(mx, my, minimap.w, minimap.h);
    ctx.strokeStyle = minimap.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, minimap.w, minimap.h);

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

    for (const n of nodes) {
      const nx = offsetX + (n.pos[0] - minX + 50) * scale;
      const ny = offsetY + (n.pos[1] - minY + 50) * scale;
      const nw = Math.max((n.size ? n.size[0] : 140) * scale, 3);
      const nh = Math.max((n.size ? n.size[1] : 60) * scale, 2);
      ctx.fillStyle = minimap.nodeColors[n.type] || '#4a4d5a';
      ctx.fillRect(nx, ny, nw, nh);
    }

    const vpX = offsetX + (-canvas.ds.offset[0] - minX + 50) * scale;
    const vpY = offsetY + (-canvas.ds.offset[1] - minY + 50) * scale;
    const vpW = (canvasElement.width / canvas.ds.scale) * scale;
    const vpH = (canvasElement.height / canvas.ds.scale) * scale;
    ctx.strokeStyle = minimap.viewportColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }

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
  configNode.pos = [300, 100];
  graph.add(configNode);

  const promptNode = LiteGraph.createNode('Chat/输入');
  promptNode.pos = [300, 300];
  graph.add(promptNode);

  configNode.connect(0, promptNode, 0);

  graph.start();

  return { graph, canvas, LiteGraph, LGraph, LGraphCanvas };
}
