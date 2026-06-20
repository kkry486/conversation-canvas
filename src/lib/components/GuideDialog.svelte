<script>
  let { onComplete } = $props();

  let step = $state(0);

  const steps = [
    {
      icon: '◆',
      title: '欢迎使用对话画布',
      desc: '一个可视化的 AI 对话工具。每个问题和回答都是节点，你可以看到整个对话的结构。',
    },
    {
      icon: '⚙️',
      title: '第一步：配置模型',
      desc: '在左上角的「⚙ 模型配置」节点里，选择模型并填入 API Key。',
    },
    {
      icon: '✦',
      title: '第二步：输入消息',
      desc: '在「✦ 对话输入」节点里打字，点发送。AI 回复会自动生成新节点。',
    },
    {
      icon: '🤖',
      title: 'Agent 模式',
      desc: '点工具栏的「🤖 Agent」切换到 Agent 模式，AI 可以自动创建文件、执行命令。',
    },
    {
      icon: '✅',
      title: '准备好了',
      desc: '右键画布可以添加新节点，拖拽连线可以创建分支。开始你的第一次对话吧！',
    },
  ];
</script>

<div class="overlay">
  <div class="dialog">
    <div class="step-icon">{steps[step].icon}</div>
    <h2>{steps[step].title}</h2>
    <p class="desc">{steps[step].desc}</p>

    <div class="dots">
      {#each steps as _, i}
        <span class="dot" class:active={i === step}></span>
      {/each}
    </div>

    <div class="actions">
      <button class="btn-skip" onclick={() => onComplete()}>跳过</button>
      {#if step < steps.length - 1}
        <button class="btn-next" onclick={() => step++}>下一步</button>
      {:else}
        <button class="btn-next" onclick={() => onComplete()}>开始使用</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    backdrop-filter: blur(8px); display: flex; align-items: center;
    justify-content: center; z-index: 1000;
  }
  .dialog {
    background: #1a1d28; border: 1px solid #2a2d3a; border-radius: 16px;
    width: 400px; padding: 40px 32px; text-align: center;
  }
  .step-icon { font-size: 48px; margin-bottom: 16px; }
  h2 { font-size: 18px; color: #e8eaf0; margin: 0 0 8px; }
  .desc { font-size: 13px; color: #8b90a0; line-height: 1.6; margin: 0 0 24px; }
  .dots { display: flex; justify-content: center; gap: 8px; margin-bottom: 24px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #3a3d5a; transition: all 0.2s; }
  .dot.active { background: #e94560; width: 20px; border-radius: 4px; }
  .actions { display: flex; justify-content: space-between; }
  .btn-skip { background: transparent; color: #6b7080; border: 1px solid #2a2d3a; border-radius: 8px; padding: 10px 20px; font-size: 13px; cursor: pointer; }
  .btn-skip:hover { color: #e8eaf0; border-color: #4a4d5a; }
  .btn-next { background: #e94560; color: white; border: none; border-radius: 8px; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-next:hover { background: #ff6b81; }
</style>
