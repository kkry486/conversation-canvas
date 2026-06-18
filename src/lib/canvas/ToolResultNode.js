import { drawScrollableText } from './widgets.js';

/**
 * Agent/工具结果 节点
 * 展示工具执行的返回结果
 */
export function registerToolResultNode(LiteGraph) {
  function ToolResultNode() {
    this.addInput('触发', 'string');
    this.addOutput('结果', 'string');
    this._resultText = '';
    this._success = true;
    this._toolName = '';
    this._scrollable = true;
    this._scrollY = 0;
    this._maxScroll = 0;
    this.size = [340, 120];

    const self = this;

    this.addCustomWidget({
      name: 'resultText',
      type: 'multiline',
      value: '',
      draw: function (ctx, node, widgetWidth, y) {
        const h = Math.max(30, node.size[1] - 30 - 8);
        const prefix = self._success ? '✅' : '❌';
        const display = self._toolName
          ? `${prefix} ${self._toolName}\n${self._resultText}`
          : '';
        drawScrollableText(ctx, node, widgetWidth, y, h, display, {
          placeholder: '等待结果...',
          textColor: self._success ? '#86efac' : '#fca5a5'
        });
      },
      computeSize: function (nodeWidth) {
        return [nodeWidth, Math.max(30, self.size[1] - 30 - 8)];
      }
    });

    this.setResult = function (toolName, success, content) {
      this._toolName = toolName;
      this._success = success;
      this._resultText = content.length > 500 ? content.slice(0, 500) + '\n...(截断)' : content;
      this.title = `${success ? '✅' : '❌'} ${toolName} 结果`;
      this.autoExpand();
    };

    this.autoExpand = function () {
      const text = `${this._toolName}\n${this._resultText}`;
      const charPerLine = Math.max(1, Math.floor((this.size[0] - 24) / 7));
      const lineCount = Math.ceil(text.length / charPerLine) || 3;
      const needed = Math.max(80, Math.min(lineCount * 16 + 40, 350));
      if (needed > this.size[1]) {
        this.size[1] = needed;
      }
      if (this.graph && this.graph.canvas) {
        this.graph.canvas.dirty_canvas = true;
      }
    };

    this.onExecute = function () {
      this.setOutputData(0, this._resultText);
    };
  }

  ToolResultNode.title = '📋 工具结果';
  ToolResultNode.desc = '工具执行的返回结果';
  ToolResultNode.title_text_color = '#34d399';

  LiteGraph.registerNodeType('Agent/工具结果', ToolResultNode);
}
