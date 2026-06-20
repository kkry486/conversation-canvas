/**
 * 普通对话逻辑
 * createResponseAndSend: 发送消息并获取回复
 * buildHistoryFromGraph: 从节点图回溯构建对话历史
 * createNextPromptNode: 创建下一个输入节点
 */

import { invoke } from '@tauri-apps/api/core';

export async function createResponseAndSend(graphData, promptNode, config, userMessage) {
  const { graph, LiteGraph } = graphData;
  const history = buildHistoryFromGraph(promptNode);

  const responseNode = LiteGraph.createNode('Chat/回复');
  responseNode.pos = [promptNode.pos[0], promptNode.pos[1] + (promptNode.size ? promptNode.size[1] : 120) + 60];
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

function getAncestorPath(node) {
  const path = [];
  const visited = new Set();
  let current = node;
  while (current) {
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

export function createNextPromptNode(graphData, responseNode) {
  const { graph, canvas, LiteGraph } = graphData;
  const newPromptNode = LiteGraph.createNode('Chat/输入');
  newPromptNode.pos = [responseNode.pos[0], responseNode.pos[1] + 180];
  graph.add(newPromptNode);
  responseNode.connect(0, newPromptNode, 1);
  const configNode = graph._nodes.find(n => n.type === 'AI/模型配置');
  if (configNode) {
    configNode.connect(0, newPromptNode, 0);
  }
  canvas.dirty_canvas = true;
  canvas.dirty_bgcanvas = true;
  return newPromptNode;
}
