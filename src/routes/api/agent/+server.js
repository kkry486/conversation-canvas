import { TOOL_DEFINITIONS, runAgentLoop } from '$lib/tools/index.js';

/**
 * Agent API 路由
 * 支持 tool-use 循环，通过 SSE 流式推送每一步到前端
 *
 * SSE 事件类型：
 *   thinking    - LLM 思考过程
 *   text_delta  - 文本增量（流式）
 *   tool_call   - 工具调用
 *   tool_result - 工具执行结果
 *   done        - Agent 完成
 *   error       - 错误
 */
export async function POST({ request }) {
  const { model, apiKey, baseUrl, systemPrompt, message, history = [] } = await request.json();

  if (!apiKey) {
    return new Response(JSON.stringify({ error: '缺少 API Key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!message) {
    return new Response(JSON.stringify({ error: '缺少消息内容' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 构建消息列表
  const messages = [];

  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: 'user', content: message });

  // SSE 流
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(type, data) {
        const payload = JSON.stringify({ type, ...data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        await runAgentLoop({
          messages,
          tools: TOOL_DEFINITIONS,
          sendEvent,

          // 调用 LLM（OpenAI 兼容格式）
          callLLM: async (allMessages, tools) => {
            const response = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model,
                messages: allMessages,
                tools,
                tool_choice: 'auto',
                stream: false
              })
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`LLM API 错误 (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];

            if (!choice) {
              throw new Error('LLM 返回空响应');
            }

            const msg = choice.message;

            return {
              text: msg.content || '',
              tool_calls: msg.tool_calls || null,
              finish_reason: choice.finish_reason
            };
          }
        });
      } catch (err) {
        sendEvent('error', { content: err.message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
