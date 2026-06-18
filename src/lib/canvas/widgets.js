/**
 * 创建可滚动、自动扩展的文本输入 widget
 */
export function createScrollableInput(label, value, onChange, opts = {}) {
  const minH = opts.minH || 40;
  const maxH = opts.maxH || 160;
  const placeholder = opts.placeholder || label;
  const borderColor = opts.borderColor || '#2a2d3a';

  const widget = {
    name: label,
    type: 'scrollable_input',
    value: value,
    _text: value,
    _minH: minH,
    _maxH: maxH,
    _currentH: minH,

    draw: function (ctx, node, widgetWidth, y, widgetHeight) {
      // 确保节点有滚动状态
      if (node._scrollY === undefined) node._scrollY = 0;
      if (node._maxScroll === undefined) node._maxScroll = 0;

      const w = widgetWidth;
      const h = widgetHeight || this._currentH;
      const pad = 8;
      const lh = 16;
      const maxVis = Math.max(1, Math.floor((h - pad * 2) / lh));

      // 标签
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#6b7080';
      ctx.textBaseline = 'top';
      ctx.fillText(label.toUpperCase(), pad + 2, y - 12);

      // 背景
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(pad, y, w - pad * 2, h);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, y, w - pad * 2, h);

      // 裁剪
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad + 1, y + 1, w - pad * 2 - 2, h - 2);
      ctx.clip();

      const text = this._text;
      if (text) {
        ctx.font = '12px "JetBrains Mono", "Fira Code", monospace, "Microsoft YaHei"';
        ctx.fillStyle = '#e8eaf0';
        ctx.textBaseline = 'top';

        const lines = wrapText(ctx, text, w - pad * 3);
        const maxScroll = Math.max(0, lines.length - maxVis);
        node._maxScroll = Math.max(node._maxScroll || 0, maxScroll);
        node._scrollY = Math.max(0, Math.min(node._scrollY, maxScroll));

        const start = node._scrollY;
        const end = Math.min(start + maxVis, lines.length);
        let ly = y + pad;
        for (let i = start; i < end; i++) {
          ctx.fillText(lines[i], pad + 4, ly);
          ly += lh;
        }

        // 滚动条
        if (lines.length > maxVis) {
          const barH = Math.max(15, (maxVis / lines.length) * h);
          const barY = y + (node._scrollY / lines.length) * h;
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(w - pad - 4, barY, 3, barH);
        }
      } else {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#4a4d5a';
        ctx.textBaseline = 'middle';
        ctx.fillText(placeholder, pad + 8, y + h / 2);
      }

      ctx.restore();
    },

    computeSize: function (nodeWidth) {
      return [nodeWidth, this._currentH];
    },

    mouse: function (event, pos, node) {
      if (event.type === 'pointerdown') {
        const v = node.graph ? node.graph.prompt('输入 ' + label, this._text || '') : prompt(label, this._text || '');
        if (v !== null) {
          this._text = v;
          this.value = v;
          this.autoExpand(node);
          if (onChange) onChange(v);
        }
        return true;
      }
    },

    autoExpand: function (node) {
      if (!node) return;
      const text = this._text || '';
      const charPerLine = Math.max(1, Math.floor((node.size[0] - 24) / 7));
      const lineCount = Math.ceil(text.length / charPerLine) || 2;
      const needed = lineCount * 16 + 16;
      const newH = Math.max(this._minH, Math.min(needed, this._maxH));
      if (newH > this._currentH) {
        this._currentH = newH;
      }
      if (node.graph && node.graph.canvas) {
        node.graph.canvas.dirty_canvas = true;
      }
    }
  };

  return widget;
}

/**
 * 绘制可滚动的纯展示文本区域
 */
export function drawScrollableText(ctx, node, w, y, h, text, opts = {}) {
  const pad = 8;
  const lh = 16;
  const bgColor = opts.bgColor || '#0d1117';
  const borderColor = opts.borderColor || '#2a2d3a';
  const textColor = opts.textColor || '#e8eaf0';
  const placeholder = opts.placeholder || '';
  const showCursor = opts.showCursor || false;

  if (node._scrollY === undefined) node._scrollY = 0;
  if (node._maxScroll === undefined) node._maxScroll = 0;

  const maxVis = Math.max(1, Math.floor((h - pad * 2) / lh));

  ctx.fillStyle = bgColor;
  ctx.fillRect(pad, y, w - pad * 2, h);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, y, w - pad * 2, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad + 1, y + 1, w - pad * 2 - 2, h - 2);
  ctx.clip();

  if (text) {
    ctx.font = '12px "JetBrains Mono", "Fira Code", monospace, "Microsoft YaHei"';
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';

    const lines = wrapText(ctx, text, w - pad * 3);
    const maxScroll = Math.max(0, lines.length - maxVis);
    node._maxScroll = maxScroll;
    node._scrollY = Math.max(0, Math.min(node._scrollY, maxScroll));

    const start = node._scrollY;
    const end = Math.min(start + maxVis, lines.length);
    let ly = y + pad;
    for (let i = start; i < end; i++) {
      ctx.fillText(lines[i], pad + 4, ly);
      ly += lh;
    }

    if (showCursor && end > start) {
      const last = lines[end - 1] || '';
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(pad + 4 + ctx.measureText(last).width + 2, y + pad + (end - start - 1) * lh, 2, 12);
    }

    if (lines.length > maxVis) {
      const barH = Math.max(20, (maxVis / lines.length) * h);
      const barY = y + (node._scrollY / lines.length) * h;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(w - pad - 4, barY, 3, barH);
    }
  } else {
    if (placeholder) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#4a4d5a';
      ctx.textBaseline = 'middle';
      ctx.fillText(placeholder, pad + 8, y + h / 2);
    }
  }

  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [''];
  const lines = [];
  for (const para of text.split('\n')) {
    if (!para) { lines.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}
