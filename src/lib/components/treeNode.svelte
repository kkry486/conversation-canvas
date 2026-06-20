<script>
  let { nodes, depth = 0, onFileSelect, highlightedFile = '' } = $props();

  function toggleNode(node) {
    node.expanded = !node.expanded;
    nodes = [...nodes];
  }
</script>

{#each nodes as node (node.path)}
  <button
    class="tree-item"
    class:highlighted={highlightedFile && node.path === highlightedFile}
    onclick={() => node.is_dir ? toggleNode(node) : onFileSelect?.(node.path)}
    style="padding-left: {depth * 16 + 8}px"
  >
    <span class="icon">
      {#if node.is_dir}
        {node.expanded ? '📂' : '📁'}
      {:else if node.name.endsWith('.js') || node.name.endsWith('.ts')}📜
      {:else if node.name.endsWith('.svelte')}🟠
      {:else if node.name.endsWith('.html')}🌐
      {:else if node.name.endsWith('.css')}🎨
      {:else if node.name.endsWith('.json')}📋
      {:else if node.name.endsWith('.md')}📝
      {:else if node.name.endsWith('.py')}🐍
      {:else if node.name.endsWith('.rs')}🦀
      {:else}📄
      {/if}
    </span>
    <span class="name">{node.name}</span>
  </button>

  {#if node.is_dir && node.expanded}
    {#if node.children.length}
      <svelte:self nodes={node.children} depth={depth + 1} {onFileSelect} />
    {/if}
  {/if}
{/each}

<style>
  .tree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: #c8cad0;
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .tree-item:hover { background: rgba(255,255,255,0.04); }
  .tree-item.highlighted { background: rgba(52,211,153,0.15); color: #34d399; }
  .icon { font-size: 13px; flex-shrink: 0; width: 18px; text-align: center; }
  .name { overflow: hidden; text-overflow: ellipsis; }
</style>
