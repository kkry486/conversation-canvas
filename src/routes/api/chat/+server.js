export async function POST({ request }) {
  const { model, apiKey, baseUrl, systemPrompt, message, history = [] } = await request.json();

  if (!apiKey) {
    return new Response('缺少 API Key', { status: 400 });
  }
  if (!message) {
    return new Response('缺少消息内容', { status: 400 });
  }

  // 构建消息列表
  const messages = [];

  // System Prompt 作为第一条消息
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  // 追加历史对话
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  // 追加当前用户消息
  messages.push({ role: 'user', content: message });

  const url = `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(errText, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
