<script>
  import { onMount } from 'svelte'

  export let url = ''
  export let leadName = ''
  export let showUrlInput = true
  export let autoRun = false

  let phase = 'idle' // idle | working | done | error
  let progressMessage = ''
  let reportMarkdown = ''
  let errorMsg = ''
  let copied = false

  $: busy = phase === 'working'
  $: reportBlocks = parseMarkdown(reportMarkdown)

  function parseMarkdown(md) {
    if (!md) return []

    const blocks = []
    let currentList = null

    for (const rawLine of String(md).split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) {
        if (currentList) {
          currentList = null
        }
        continue
      }

      const headerMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headerMatch) {
        if (currentList) currentList = null
        blocks.push({
          type: 'heading',
          level: Math.min(headerMatch[1].length, 3),
          text: headerMatch[2]
        })
        continue
      }

      const bulletMatch = line.match(/^[*-]\s+(.*)$/)
      if (bulletMatch) {
        if (!currentList) {
          currentList = { type: 'list', items: [] }
          blocks.push(currentList)
        }
        currentList.items.push(bulletMatch[1])
        continue
      }

      if (currentList) currentList = null
      blocks.push({ type: 'paragraph', text: line })
    }

    return blocks
  }

  async function runProfile() {
    const target = String(url).trim()
    if (!target || busy) return

    phase = 'working'
    progressMessage = 'Generating report…'
    reportMarkdown = ''
    errorMsg = ''

    try {
      const result = await window.api.runDeepProfile(target)
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

      if (!text.trim()) {
        throw new Error('The analyst returned an empty report.')
      }

      reportMarkdown = text
      phase = 'done'
      progressMessage = ''
    } catch (error) {
      errorMsg = error?.message || 'Could not profile this business.'
      phase = 'error'
      progressMessage = ''
    }
  }

  async function copyText(text) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      setTimeout(() => {
        copied = false
      }, 1600)
    } catch {
      copied = false
    }
  }

  onMount(() => {
    if (autoRun && String(url).trim()) {
      runProfile()
    }
  })
</script>

<div class="panel">
  {#if showUrlInput}
    <div class="input-row">
      <input
        type="text"
        placeholder="https://example.com"
        bind:value={url}
        on:keydown={(event) => event.key === 'Enter' && runProfile()}
      />
      <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || busy}>
        {busy ? 'Profiling…' : reportMarkdown ? 'Re-run' : 'Run Deep Profile'}
      </button>
    </div>
  {:else}
    <div class="modal-header">
      <div class="modal-title">{leadName || url}</div>
      <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || busy}>
        {busy ? 'Profiling…' : reportMarkdown ? 'Re-run' : 'Run Deep Profile'}
      </button>
    </div>
  {/if}

  {#if busy}
    <div class="status-card">
      <span class="status-dot"></span>
      <span>{progressMessage}</span>
    </div>
  {/if}

  {#if errorMsg && phase === 'error'}
    <div class="error-card">{errorMsg}</div>
  {/if}

  {#if reportBlocks.length && phase === 'done'}
    <div class="report-card">
      <div class="report-card-header">
        <h3>Deep Profile Report</h3>
        <button class="ghost-btn" on:click={() => copyText(reportMarkdown)}>
          {copied ? 'Copied ✓' : 'Copy report'}
        </button>
      </div>
      <div class="report-body">
        {#each reportBlocks as block, index (index)}
          {#if block.type === 'heading'}
            {#if block.level === 1}
              <h1>{block.text}</h1>
            {:else if block.level === 2}
              <h2>{block.text}</h2>
            {:else}
              <h3>{block.text}</h3>
            {/if}
          {:else if block.type === 'list'}
            <ul class="report-list">
              {#each block.items as item, itemIndex (itemIndex)}
                <li>{item}</li>
              {/each}
            </ul>
          {:else}
            <p>{block.text}</p>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .input-row,
  .modal-header {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .input-row input {
    flex: 1;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-1);
  }

  .modal-title {
    font-weight: 700;
    color: var(--text-1);
    flex: 1;
  }

  .primary-btn,
  .ghost-btn {
    border-radius: 10px;
    border: 1px solid transparent;
    padding: 10px 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-btn {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
  }

  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ghost-btn {
    background: var(--surface);
    color: var(--text-2);
    border-color: var(--border);
  }

  .status-card,
  .error-card,
  .report-card {
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 16px;
    background: var(--surface-soft);
  }

  .status-card {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-2);
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brand);
  }

  .error-card {
    color: var(--red-dark);
    background: rgba(255, 0, 0, 0.04);
  }

  .report-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .report-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .report-body h1,
  .report-body h2,
  .report-body h3,
  .report-body p {
    margin: 0;
  }

  .report-body h1,
  .report-body h2,
  .report-body h3 {
    font-size: 1rem;
    margin-bottom: 8px;
  }

  .report-list {
    padding-left: 20px;
    margin: 10px 0;
  }
</style>
