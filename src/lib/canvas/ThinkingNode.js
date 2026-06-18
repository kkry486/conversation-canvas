import { drawScrollableText } from './widgets.js';

/**
 * Agent/思考 节点
 * 展示 LLM 的推理过程
 */
export function registerThinkingNode(LiteGraph) {
  function ThinkingNode() {
    this.addInput('输入', 'string');
    this.addOutput('思考', 'string');
    this._thinkingText = '';
    this._statusText = '⏳ 思考中';
    this._statusColor = '#a78bfa';
    this._scrollable = true;
    this._scrollY = 0;
    this._maxScroll = 0;
    this.size = [320, 100];

    const self = this;

    this.addCustomWidget({
      name: 'thinkingText',
      type: 'multiline',
      value: '',
      draw: function (ctx, node, widgetWidth, y) {
        const h = Math.max(30, node.size[1] - 30 - 8);
        drawScrollableText(ctx, node, widgetWidth, y, h, self._thinkingText, {
          placeholder: '思考中...',
          showCursor: self._statusText.includes('思考中'),
          textColor: '#c4b5fd'
        });
      },
      computeSize: function (nodeWidth) {
        return [nodeWidth, Math.max(30, self.size[1] - 30 - 8)];
      }
    });

    this.setStatus = function (status) {
      const map = {
        '思考中': { icon: '🧠', color: '#a78bfa' },
        '完成': { icon: '✓', color: '#34d399' }
      };
      const info = map[status] || map['思考中'];
      this._statusText = `${info.icon} ${status}`;
      this._statusColor = info.color;
      this.title = `🧠 思考  ${this._statusText}`;
    };

    this.appendText = function (text) {
      this._thinkingText += text;
      this._scrollY = Infinity;
      this.autoExpand();
    };

    this.setText = function (text) {
      this._thinkingText = text;
      this.autoExpand();
    };

    this.autoExpand = function () {
      const charPerLine = Math.max(1, Math.floor((this.size[0] - 24) / 7));
      const lineCount = Math.ceil(this._thinkingText.length / charPerLine) || 3;
      const needed = Math.max(80, Math.min(lineCount * 16 + 36, 300));
      if (needed > this.size[1]) {
        this.size[1] = needed;
      }
      if (this.graph && this.graph.canvas) {
        this.graph.canvas.dirty_canvas = true;
      }
    };

    this.onExecute = function () {
      this.setOutputData(0, this._thinkingText);
    };
  }

  ThinkingNode.title = '🧠 思考';
  ThinkingNode.desc = 'LLM 的推理过程';
  ThinkingNode.title_text_color = '#a78bfa';

  LiteGraph.registerNodeType('Agent/思考', ThinkingNode);
}
