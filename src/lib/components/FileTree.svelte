<script>
  import { invoke } from '@tauri-apps/api/core';
  import TreeNode from './treeNode.svelte';

  let { workDir, onFileSelect } = $props();

  let rootEntries = $state([]);
  let collapsed = $state(false);
  let highlightedFile = $state('');

  async function loadDir(path) {
    if (!path || path === '未设置') { rootEntries = []; return; }
    try {
      const flat = await invoke('read_dir_recursive', { path, maxDepth: 3 });
      rootEntries = buildTree(flat);
    } catch (e) {
      console.error(e);
      rootEntries = [];
    }
  }

  // 暴露刷新方法给父组件
  export async function refresh() {
    await loadDir(workDir);
  }

  // 暴露高亮方法
  export function highlight(filePath) {
    highlightedFile = filePath;
    // 3秒后取消高亮
    setTimeout(() => { highlightedFile = ''; }, 3000);
  }

  function buildTree(flat) {
    const map = {};
    const roots = [];
    for (const item of flat) {
      map[item.path] = { ...item, children: [], expanded: false };
    }
    for (const item of flat) {
      const node = map[item.path];
      if (!item.depth || item.depth === 0) {
        roots.push(node);
      } else {
        // 用字符串方法找父目录
        const sep = item.path.includes('/') ? '/' : '\\';
        const lastSep = item.path.lastIndexOf(sep);
        const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : null;
        if (parentPath && map[parentPath]) {
          map[parentPath].children.push(node);
        } else {
          // 找不到父目录，当作根节点
          roots.push(node);
        }
      }
    }
    return roots;
  }

  $effect(() => {
    const dir = workDir;
    if (dir && dir !== '未设置') loadDir(dir);
    else rootEntries = [];
  });
</script>

<div class="file-tree" class:collapsed>
  <div class="tree-header">
    {#if !collapsed}
      <span class="tree-title">📁 文件</span>
      <button class="refresh-btn" onclick={() => refresh()} title="刷新">↻</button>
    {/if}
    <button class="toggle-btn" onclick={() => collapsed = !collapsed}>
      {collapsed ? '▶' : '◀'}
    </button>
  </div>

  {#if !collapsed}
    {#if !workDir || workDir === '未设置'}
      <div class="empty-hint">请先设置工作目录</div>
    {:else if rootEntries.length === 0}
      <div class="empty-hint">目录为空</div>
    {:else}
      <div class="tree-content">
        <TreeNode nodes={rootEntries} {onFileSelect} {highlightedFile} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .file-tree { height: 100%; display: flex; flex-direction: column; background: #12141d; border-right: 1px solid #2a2d3a; }
  .file-tree.collapsed { width: 36px !important; }
  .tree-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px; border-bottom: 1px solid #2a2d3a; }
  .tree-title { font-size: 12px; font-weight: 600; color: #8b90a0; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .toggle-btn { background: transparent; border: none; color: #6b7080; font-size: 10px; cursor: pointer; padding: 4px; border-radius: 4px; flex-shrink: 0; }
  .toggle-btn:hover { background: rgba(255,255,255,0.08); color: #e8eaf0; }
  .refresh-btn { background: transparent; border: none; color: #6b7080; font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
  .refresh-btn:hover { background: rgba(255,255,255,0.08); color: #34d399; }
  .empty-hint { padding: 20px 12px; font-size: 12px; color: #6b7080; text-align: center; }
  .tree-content { flex: 1; overflow-y: auto; padding: 4px 0; }
</style>
