import { drawScrollableText } from './widgets.js';

/**
 * Agent/工具调用 节点
 * 展示 Agent 调用了什么工具、参数是什么
 */
export function registerToolCallNode(LiteGraph) {
  function ToolCallNode() {
    this.addInput('触发', 'string');
    this.addOutput('结果', 'string');
    this._toolName = '';
    this._toolArgs = '';
    this._statusText = '⏳ 执行中';
    this._statusColor = '#60a5fa';
    this._scrollable = true;
    this._scrollY = 0;
    this._maxScroll = 0;
    this.size = [340, 120];

    const self = this;

    this.addCustomWidget({
      name: 'toolInfo',
      type: 'multiline',
      value: '',
      draw: function (ctx, node, widgetWidth, y) {
        const h = Math.max(30, node.size[1] - 30 - 8);
        const display = self._toolName
          ? `🔧 ${self._toolName}\n${self._toolArgs}`
          : '';
        drawScrollableText(ctx, node, widgetWidth, y, h, display, {
          placeholder: '等待工具调用...',
          showCursor: self._statusText.includes('执行中'),
          textColor: '#93c5fd'
        });
      },
      computeSize: function (nodeWidth) {
        return [nodeWidth, Math.max(30, self.size[1] - 30 - 8)];
      }
    });

    this.setToolCall = function (name, args) {
      this._toolName = name;
      this._toolArgs = Object.entries(args)
        .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? (v.length > 80 ? v.slice(0, 80) + '...' : v) : JSON.stringify(v)}`)
        .join('\n');
      this.title = `🔧 ${name}  ⏳ 执行中`;
      this.autoExpand();
    };

    this.setResult = function (success) {
      const icon = success ? '✓' : '✗';
      const status = success ? '完成' : '失败';
      this._statusText = `${icon} ${status}`;
      this._statusColor = success ? '#34d399' : '#e94560';
      this.title = `🔧 ${this._toolName}  ${this._statusText}`;
    };

    this.autoExpand = function () {
      const text = this._toolName ? `${this._toolName}\n${this._toolArgs}` : '';
      const charPerLine = Math.max(1, Math.floor((this.size[0] - 24) / 7));
      const lineCount = Math.ceil(text.length / charPerLine) || 3;
      const needed = Math.max(80, Math.min(lineCount * 16 + 40, 300));
      if (needed > this.size[1]) {
        this.size[1] = needed;
      }
      if (this.graph && this.graph.canvas) {
        this.graph.canvas.dirty_canvas = true;
      }
    };

    this.onExecute = function () {
      this.setOutputData(0, `${this._toolName}: ${this._toolArgs}`);
    };
  }

  ToolCallNode.title = '🔧 工具调用';
  ToolCallNode.desc = 'Agent 调用的工具';
  ToolCallNode.title_text_color = '#60a5fa';

  LiteGraph.registerNodeType('Agent/工具调用', ToolCallNode);
}
