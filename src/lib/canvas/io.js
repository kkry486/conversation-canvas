/**
 * 对话图导入导出
 * exportGraph: 导出为 JSON 文件
 * importGraph: 从 JSON 文件导入
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
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function importGraph(graphData, jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    graphData.graph.configure(data);
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
