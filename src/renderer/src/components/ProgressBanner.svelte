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
      >Indexing businesses in the area… found {discoveredCount} so far (target {desiredCount})</span
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
    border-radius: 10px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

  .progress-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .progress-track {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: #dbeafe;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    border-radius: 999px;
    transition: width 0.3s ease;
  }
</style>
