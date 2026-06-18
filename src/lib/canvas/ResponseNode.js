import { drawScrollableText } from './widgets.js';

export function registerResponseNode(LiteGraph) {
  function ResponseNode() {
    this.addInput('回复', 'string');
    this.addOutput('内容', 'string');
    this._responseText = '';
    this._statusText = '⏳ 等待中';
    this._statusColor = '#8b90a0';
    this._scrollable = true;
    this._scrollY = 0;
    this._maxScroll = 0;
    this.size = [340, 200];

    const self = this;
    const BUTTON_H = 28; // 按钮区域高度

    this.addCustomWidget({
      name: 'responseText',
      type: 'multiline',
      value: '',

      draw: function (ctx, node, widgetWidth, y) {
        // widgetHeight 由 computeSize 控制，这里用传入的高度
        const h = Math.max(40, node.size[1] - 30 - BUTTON_H - 10);
        drawScrollableText(ctx, node, widgetWidth, y, h, self._responseText, {
          placeholder: '等待回复...',
          showCursor: self._statusText.includes('生成中')
        });
      },

      computeSize: function (nodeWidth) {
        // 返回节点总高度减去标题栏和按钮
        const h = Math.max(40, self.size[1] - 30 - BUTTON_H - 10);
        return [nodeWidth, h];
      }
    });

    // 选择复制 — 弹出文本框让用户自由选择
    this.addWidget('button', '选择复制', null, () => {
      if (!self._responseText) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#1a1d28;border:1px solid #2a2d3a;border-radius:8px;padding:16px;max-width:700px;width:90%;';
      const ta = document.createElement('textarea');
      ta.value = self._responseText;
      ta.style.cssText = 'width:100%;height:300px;background:#0d1117;color:#e8eaf0;border:1px solid #2a2d3a;border-radius:4px;padding:8px;font-size:13px;font-family:"JetBrains Mono","Fira Code",monospace,"Microsoft YaHei";resize:vertical;outline:none;';
      const btn = document.createElement('button');
      btn.textContent = '关闭';
      btn.style.cssText = 'margin-top:8px;padding:6px 20px;background:#e94560;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
      btn.onclick = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      box.appendChild(ta);
      box.appendChild(btn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      ta.focus();
      ta.select();
    });

    this.setStatus = function (status) {
      const map = {
        '等待中': { icon: '⏳', color: '#8b90a0' },
        '生成中': { icon: '⚡', color: '#fbbf24' },
        '完成': { icon: '✓', color: '#34d399' },
        '错误': { icon: '✗', color: '#e94560' }
      };
      const info = map[status] || map['等待中'];
      this._statusText = `${info.icon} ${status}`;
      this._statusColor = info.color;
      this.title = `◉ AI回复  ${this._statusText}`;
    };

    this.appendText = function (text) {
      this._responseText += text;
      this._scrollY = Infinity;
      this.autoExpand();
    };

    this.setText = function (text) {
      this._responseText = text;
      this.autoExpand();
    };

    this.autoExpand = function () {
      const charPerLine = Math.max(1, Math.floor((this.size[0] - 24) / 7));
      const lineCount = Math.ceil(this._responseText.length / charPerLine) || 3;
      const needed = Math.max(120, Math.min(lineCount * 16 + 46 + BUTTON_H, 440));
      if (needed > this.size[1]) {
        this.size[1] = needed;
      }
      if (this.graph && this.graph.canvas) {
        this.graph.canvas.dirty_canvas = true;
      }
    };

    this.onExecute = function () {
      this.setOutputData(0, this._responseText);
    };
  }

  ResponseNode.title = '◉ AI回复';
  ResponseNode.desc = '显示AI的回复内容';
  ResponseNode.title_text_color = '#fbbf24';

  LiteGraph.registerNodeType('Chat/回复', ResponseNode);
}
