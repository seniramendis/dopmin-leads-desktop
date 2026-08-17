<script>
  export let progressPhase
  export let progressMessage
  export let discoveredCount
  export let desiredCount
  export let extractDone
  export let extractTotal

  $: extractPercent = extractTotal > 0 ? Math.round((extractDone / extractTotal) * 100) : 0
</script>

<div class="status-banner progress-banner">
  {#if progressPhase === 'searching' || !progressPhase}
    <span>{progressMessage || 'Opening Google Maps…'}</span>
  {:else if progressPhase === 'discovering'}
    <span
      >Indexing businesses in the area — found {discoveredCount} so far (target {desiredCount})</span
    >
  {:else if progressPhase === 'extracting'}
    <span
      >Reading business details — phone numbers, websites, addresses… {extractDone} / {extractTotal}</span
    >
    <div class="progress-track">
      <div class="progress-fill" style="width: {extractPercent}%"></div>
    </div>
  {:else}
    <span>Finishing up…</span>
  {/if}
</div>

<style>
  .status-banner {
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-2);
    border: 1px solid var(--border);
    font-size: 0.86rem;
  }

  .progress-banner {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .progress-track {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--brand);
    border-radius: 999px;
    transition: width 0.3s ease;
  }
</style>
