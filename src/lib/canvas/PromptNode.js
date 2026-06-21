export function registerPromptNode(LiteGraph) {
  function PromptNode() {
    this.addInput('配置', 'object');
    this.addInput('上下文', 'string');
    this.addOutput('消息', 'string');
    this.addOutput('配置', 'object');
    this._promptText = '';
    this._sent = false;
    this._isRunning = false;
    this.size = [280, 120];

    const self = this;

    this._inputWidget = this.addWidget('string', '消息', '', (v) => {
      self._promptText = v;
    });

    this.addWidget('button', '▸ 发送', null, () => {
      // Agent 执行中禁止重复发送
      if (this._isRunning) return;
      if (this.sendCallback) this.sendCallback();
    });

    this.sendCallback = null;

    this.onExecute = function () {
      this.setOutputData(0, this._promptText);
      this.setOutputData(1, this.getInputData(0));
    };
  }

  PromptNode.title = '✦ 对话输入';
  PromptNode.desc = '输入消息并发送给AI';
  PromptNode.title_text_color = '#34d399';

  LiteGraph.registerNodeType('Chat/输入', PromptNode);
}
