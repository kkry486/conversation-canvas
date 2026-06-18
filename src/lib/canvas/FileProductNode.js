/**
 * Agent/文件产物 节点
 * 显示 Agent 创建的文件路径，支持打开文件和打开文件夹
 * 按钮完全自定义绘制，解决 LiteGraph 内置按钮文字不居中的问题
 */
export function registerFileProductNode(LiteGraph) {
  function FileProductNode() {
    this.addInput('触发', 'string');
    this.addOutput('文件', 'string');
    this._fileName = '';
    this._filePath = '';
    this.size = [340, 110];

    const self = this;
    const BTN_H = 26;
    const BTN_GAP = 6;

    // 自定义绘制整个节点内容（文件信息 + 两个按钮）
    this.onDrawForeground = function (ctx) {
      if (this._alpha !== undefined) ctx.globalAlpha = this._alpha;
      const w = this.size[0];
      const pad = 10;
      const titleH = 30;

      // --- 文件信息区域 ---
      if (self._fileName) {
        ctx.font = 'bold 13px "SF Pro Display", "Segoe UI", sans-serif';
        ctx.fillStyle = '#60a5fa';
        ctx.textBaseline = 'top';
        ctx.fillText(`📄 ${self._fileName}`, pad, titleH + 4);

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#6b7080';
        const displayPath = self._filePath.length > 50
          ? '...' + self._filePath.slice(-47)
          : self._filePath;
        ctx.fillText(displayPath, pad, titleH + 24);
      } else {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#4a4d5a';
        ctx.textBaseline = 'middle';
        ctx.fillText('等待文件创建...', pad, titleH + 20);
      }

      // --- 按钮区域 ---
      const btnY = titleH + 48;
      const btnW = (w - pad * 2 - BTN_GAP) / 2;

      // 按钮 1：打开文件
      self._drawButton(ctx, pad, btnY, btnW, BTN_H, '▶ 打开文件', '#34d399', '#065f46');

      // 按钮 2：打开文件夹
      self._drawButton(ctx, pad + btnW + BTN_GAP, btnY, btnW, BTN_H, '📂 打开文件夹', '#60a5fa', '#1e3a5f');
    };

    this._drawButton = function (ctx, x, y, w, h, label, color, hoverColor) {
      const isHover = self._hoverBtn === label;

      // 背景
      ctx.fillStyle = isHover ? hoverColor : 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();

      // 边框
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 文字 —— 关键：用 textBaseline = 'middle' 精确居中
      ctx.font = '12px "SF Pro Display", "Segoe UI", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
    };

    // 鼠标悬停检测
    this.onMouseMove = function (e) {
      const localX = e.canvasX - this.pos[0];
      const localY = e.canvasY - this.pos[1];
      const pad = 10;
      const titleH = 30;
      const btnY = titleH + 48;
      const btnW = (this.size[0] - pad * 2 - BTN_GAP) / 2;

      if (localY >= btnY && localY <= btnY + BTN_H) {
        if (localX >= pad && localX <= pad + btnW) {
          self._hoverBtn = '▶ 打开文件';
          this.canvas.dirty_canvas = true;
          return;
        }
        if (localX >= pad + btnW + BTN_GAP && localX <= pad + btnW * 2 + BTN_GAP) {
          self._hoverBtn = '📂 打开文件夹';
          this.canvas.dirty_canvas = true;
          return;
        }
      }
      if (self._hoverBtn) {
        self._hoverBtn = null;
        this.canvas.dirty_canvas = true;
      }
    };

    // 鼠标点击
    this.onMouseDown = function (e) {
      if (e.button !== 0) return;
      const localX = e.canvasX - this.pos[0];
      const localY = e.canvasY - this.pos[1];
      const pad = 10;
      const titleH = 30;
      const btnY = titleH + 48;
      const btnW = (this.size[0] - pad * 2 - BTN_GAP) / 2;

      if (!self._filePath) return false;

      if (localY >= btnY && localY <= btnY + BTN_H) {
        if (localX >= pad && localX <= pad + btnW) {
          // 打开文件
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('open_file', { path: self._filePath, mode: 'file' });
          });
          return true;
        }
        if (localX >= pad + btnW + BTN_GAP && localX <= pad + btnW * 2 + BTN_GAP) {
          // 打开文件夹
          // 打开文件夹
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('open_file', { path: self._filePath, mode: 'folder' });
          });
          return true;
        }
      }
      return false;
    };

    this.setFile = function (fileName, filePath) {
      this._fileName = fileName;
      this._filePath = filePath;
      this.title = `📄 ${fileName}`;
      if (this.graph && this.graph.canvas) {
        this.graph.canvas.dirty_canvas = true;
      }
    };

    this.onExecute = function () {
      this.setOutputData(0, this._filePath);
    };
  }

  FileProductNode.title = '📄 文件产物';
  FileProductNode.desc = 'Agent 创建的文件';
  FileProductNode.title_text_color = '#60a5fa';

  LiteGraph.registerNodeType('Agent/文件产物', FileProductNode);
}
