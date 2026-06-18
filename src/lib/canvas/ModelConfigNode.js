import { MODEL_PRESETS, setConfig } from '../stores/config.js';

export function registerModelConfigNode(LiteGraph) {
  function ModelConfigNode() {
    this.addOutput('配置', 'object');
    this._apiKey = '';
    this._baseUrl = MODEL_PRESETS[0].baseUrl;
    this._systemPrompt = '';
    this.size = [260, 160];

    const self = this;

    const modelNames = MODEL_PRESETS.map(p => p.name);
    this._selectedPreset = MODEL_PRESETS[0];
    this.addWidget('combo', '模型', MODEL_PRESETS[0].name, (v) => {
      this._selectedPreset = MODEL_PRESETS.find(p => p.name === v) || MODEL_PRESETS[0];
      this._urlWidget.value = this._selectedPreset.baseUrl;
      this._baseUrl = this._selectedPreset.baseUrl;
      this.syncConfig();
    }, { values: modelNames });

    this.addWidget('string', 'API Key', '', (v) => {
      this._apiKey = v;
      this.syncConfig();
    });

    this._urlWidget = this.addWidget('string', 'Base URL', MODEL_PRESETS[0].baseUrl, (v) => {
      this._baseUrl = v;
      this.syncConfig();
    });

    this.addWidget('string', 'System Prompt', '', (v) => {
      this._systemPrompt = v;
      this.syncConfig();
    });

    this.syncConfig = function () {
      setConfig('model', this._selectedPreset.model);
      setConfig('apiKey', this._apiKey);
      setConfig('baseUrl', this._baseUrl || this._selectedPreset.baseUrl);
      setConfig('systemPrompt', this._systemPrompt);
    };

    this.syncConfig();

    this.onExecute = function () {
      this.setOutputData(0, {
        model: this._selectedPreset.model,
        apiKey: this._apiKey,
        baseUrl: this._baseUrl || this._selectedPreset.baseUrl,
        systemPrompt: this._systemPrompt
      });
    };
  }

  ModelConfigNode.title = '⚙ 模型配置';
  ModelConfigNode.desc = '选择AI模型、配置API密钥和地址';
  ModelConfigNode.title_text_color = '#e94560';

  LiteGraph.registerNodeType('AI/模型配置', ModelConfigNode);
}
