<script>
  import { invoke } from '@tauri-apps/api/core';

  let { onClose, onConnect } = $props();

  let servers = $state([]);
  let newName = $state('');
  let newCommand = $state('');
  let newArgs = $state('');
  let connecting = $state(null);

  // 预设 MCP 服务器（Windows 需要 .cmd 后缀）
  const isWindows = navigator.platform.includes('Win');
  const cmdSuffix = isWindows ? '.cmd' : '';
  const presets = [
    { name: 'filesystem', command: `mcp-server-filesystem${cmdSuffix}`, npm: '@modelcontextprotocol/server-filesystem', args: '.', desc: '读写本地文件' },
    { name: 'github', command: `mcp-server-github${cmdSuffix}`, npm: '@modelcontextprotocol/server-github', args: '', desc: 'GitHub API 操作' },
  ];

  let installing = $state(null);

  async function installPreset(preset) {
    installing = preset.name;
    try {
      await invoke('install_npm_package', { packageName: preset.npm, command: preset.command.replace(/\.cmd$/, '') });
      // 安装成功后自动填入配置
      newName = preset.name;
      newCommand = preset.command;
      newArgs = preset.args;
    } catch (e) {
      alert(`安装失败: ${e}\n\n请手动运行: npm install -g ${preset.npm}`);
    } finally {
      installing = null;
    }
  }

  // 加载已保存的配置
  $effect(() => {
    loadConfig();
  });

  async function loadConfig() {
    try {
      const saved = await invoke('load_mcp_config');
      servers = saved || [];
    } catch {
      servers = [];
    }
  }

  async function saveConfig() {
    await invoke('save_mcp_config', { config: servers });
  }

  async function addServer() {
    if (!newName.trim() || !newCommand.trim()) return;
    servers = [...servers, {
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs.trim(),
      connected: false
    }];
    newName = '';
    newCommand = '';
    newArgs = '';
    await saveConfig();
  }

  function removeServer(index) {
    servers = servers.filter((_, i) => i !== index);
    saveConfig();
  }

  async function connectServer(index) {
    const server = servers[index];
    connecting = index;
    try {
      await invoke('mcp_connect', {
        command: server.command,
        args: server.args ? server.args.split(/\s+/) : []
      });
      servers[index] = { ...server, connected: true };
      servers = [...servers];
      onConnect?.();
    } catch (e) {
      alert(`连接失败: ${e}`);
    } finally {
      connecting = null;
    }
  }

  async function disconnectServer() {
    try {
      await invoke('mcp_disconnect');
      servers = servers.map(s => ({ ...s, connected: false }));
      onConnect?.();
    } catch (e) {
      console.error(e);
    }
  }
</script>

<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="dialog">
    <div class="header">
      <h2>🔗 MCP 服务器管理</h2>
      <button class="close-btn" onclick={onClose}>✕</button>
    </div>

    <!-- 已配置的服务器 -->
    <div class="section">
      <div class="section-title">已配置的服务器</div>
      {#if servers.length === 0}
        <div class="empty">暂无 MCP 服务器</div>
      {:else}
        {#each servers as server, i}
          <div class="server-row">
            <div class="server-info">
              <span class="server-name">{server.name}</span>
              <span class="server-cmd">{server.command}</span>
              {#if server.connected}
                <span class="status connected">已连接</span>
              {/if}
            </div>
            <div class="server-actions">
              {#if server.connected}
                <button class="btn-disconnect" onclick={disconnectServer}>断开</button>
              {:else}
                <button
                  class="btn-connect"
                  onclick={() => connectServer(i)}
                  disabled={connecting === i}
                >
                  {connecting === i ? '连接中...' : '连接'}
                </button>
              {/if}
              <button class="btn-remove" onclick={() => removeServer(i)}>✕</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- 添加新服务器 -->
    <div class="section">
      <div class="section-title">添加新服务器</div>
      <div class="add-form">
        <input placeholder="名称" bind:value={newName} />
        <input placeholder="命令 (如 mcp-server-filesystem)" bind:value={newCommand} />
        <input placeholder="参数 (如 E:\myproject)" bind:value={newArgs} />
        <button class="btn-add" onclick={addServer} disabled={!newName.trim() || !newCommand.trim()}>添加</button>
      </div>
    </div>

    <!-- 预设服务器 -->
    <div class="section">
      <div class="section-title">预设服务器（一键安装）</div>
      <div class="presets">
        {#each presets as preset}
          <button
            class="preset-btn"
            onclick={() => installPreset(preset)}
            disabled={installing !== null}
          >
            <span class="preset-name">
              {installing === preset.name ? '⏳ 安装中...' : preset.name}
            </span>
            <span class="preset-desc">{preset.desc}</span>
          </button>
        {/each}
      </div>
      <div class="preset-hint">点击一键安装并填入配置，然后点"添加"</div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    backdrop-filter: blur(6px); display: flex; align-items: center;
    justify-content: center; z-index: 1000;
  }
  .dialog {
    background: #1a1d28; border: 1px solid #2a2d3a; border-radius: 12px;
    width: 520px; max-height: 80vh; overflow-y: auto; padding: 24px;
  }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  h2 { font-size: 16px; color: #e8eaf0; margin: 0; }
  .close-btn { background: transparent; border: none; color: #6b7080; font-size: 16px; cursor: pointer; padding: 4px; }
  .close-btn:hover { color: #e8eaf0; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 12px; font-weight: 600; color: #8b90a0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .empty { font-size: 12px; color: #6b7080; padding: 12px; text-align: center; background: rgba(255,255,255,0.02); border-radius: 6px; }
  .server-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(255,255,255,0.02); border-radius: 6px; margin-bottom: 6px; }
  .server-info { display: flex; align-items: center; gap: 10px; }
  .server-name { font-size: 13px; color: #e8eaf0; font-weight: 600; }
  .server-cmd { font-size: 11px; color: #6b7080; font-family: monospace; }
  .status { font-size: 10px; padding: 2px 6px; border-radius: 4px; }
  .status.connected { background: rgba(52,211,153,0.15); color: #34d399; }
  .server-actions { display: flex; gap: 6px; }
  .btn-connect { background: rgba(233,69,96,0.12); color: #e94560; border: 1px solid rgba(233,69,96,0.3); border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
  .btn-connect:hover { background: rgba(233,69,96,0.2); }
  .btn-connect:disabled { opacity: 0.5; cursor: wait; }
  .btn-disconnect { background: rgba(255,255,255,0.04); color: #8b90a0; border: 1px solid #2a2d3a; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
  .btn-remove { background: transparent; border: none; color: #6b7080; font-size: 14px; cursor: pointer; padding: 2px 6px; }
  .btn-remove:hover { color: #e94560; }
  .add-form { display: flex; gap: 6px; flex-wrap: wrap; }
  .add-form input { flex: 1; min-width: 100px; padding: 8px 10px; background: #12141d; color: #e8eaf0; border: 1px solid #2a2d3a; border-radius: 6px; font-size: 12px; font-family: inherit; outline: none; }
  .add-form input:focus { border-color: #e94560; }
  .btn-add { background: #e94560; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn-add:disabled { background: #3a3d4a; color: #6b7080; cursor: not-allowed; }
  .presets { display: flex; gap: 6px; flex-wrap: wrap; }
  .preset-btn { background: rgba(255,255,255,0.04); border: 1px solid #2a2d3a; border-radius: 6px; padding: 8px 12px; cursor: pointer; text-align: left; transition: all 0.15s; }
  .preset-btn:hover { background: rgba(255,255,255,0.08); border-color: #4a4d5a; }
  .preset-name { display: block; font-size: 12px; color: #e8eaf0; font-weight: 600; }
  .preset-desc { display: block; font-size: 10px; color: #6b7080; margin-top: 2px; }
  .preset-hint { font-size: 10px; color: #6b7080; margin-top: 6px; }
</style>
