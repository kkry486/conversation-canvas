/**
 * Agent 模式响应处理
 * createAgentResponse: 调用 Agent 并实时创建节点
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { buildHistoryFromGraph } from './chat.js';

export async function createAgentResponse(graphData, promptNode, config, userMessage, useMcp = false, onFileCreated = null) {
  const { graph, canvas, LiteGraph } = graphData;
  const history = buildHistoryFromGraph(promptNode);

  const responseNode = LiteGraph.createNode('Chat/回复');
  responseNode.pos = [promptNode.pos[0], promptNode.pos[1] + (promptNode.size ? promptNode.size[1] : 120) + 60];
  graph.add(responseNode);
  promptNode.connect(0, responseNode, 0);
  responseNode._userMessage = userMessage;
  responseNode.setStatus('生成中');

  let lastNode = responseNode;
  let lastY = promptNode.pos[1] - 180;
  let fullText = '';
  let currentThinkingNode = null;
  let currentToolCallNode = null;

  function nextPos(baseX, offset) {
    lastY += offset;
    return [responseNode.pos[0] + 280, lastY];
  }

  const unlisten = await listen('agent-event', (event) => {
    const ev = event.payload;

    switch (ev.type) {
      case 'thinking': {
        if (!currentThinkingNode || currentThinkingNode._statusText.includes('完成')) {
          currentThinkingNode = LiteGraph.createNode('Agent/思考');
          currentThinkingNode.pos = nextPos(responseNode.pos[0] - 60, 180);
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
        currentToolCallNode.pos = nextPos(responseNode.pos[0] - 60, 180);
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
        resultNode.pos = nextPos(responseNode.pos[0] - 60, 180);
        graph.add(resultNode);
        lastNode.connect(0, resultNode, 0);
        lastNode = resultNode;
        resultNode.setResult(ev.name, ev.success, ev.content);

        if (ev.name === 'write_file' && ev.success && ev.filePath) {
          const fileNode = LiteGraph.createNode('Agent/文件产物');
          fileNode.pos = nextPos(responseNode.pos[0] - 60, 180);
          graph.add(fileNode);
          lastNode.connect(0, fileNode, 0);
          lastNode = fileNode;
          fileNode.setFile(ev.fileName, ev.filePath);
          onFileCreated?.(ev.filePath);
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
