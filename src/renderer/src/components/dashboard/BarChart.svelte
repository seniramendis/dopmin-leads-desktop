<script>
  // bars: [{ label, value, color }]
  export let bars = []
  export let emptyMessage = 'No data yet.'

  $: max = Math.max(1, ...bars.map((b) => b.value))
  $: hasData = bars.some((b) => b.value > 0)
</script>

<div class="bar-chart">
  {#if !hasData}
    <p class="empty">{emptyMessage}</p>
  {:else}
    {#each bars as b (b.label)}
      <div class="row">
        <div class="row-label" title={b.label}>{b.label}</div>
        <div class="track">
          <div
            class="fill"
            style="width:{(b.value / max) * 100}%; background:{b.color || 'var(--brand)'}"
          ></div>
        </div>
        <div class="row-value">{b.value}</div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: 96px 1fr 32px;
    align-items: center;
    gap: 10px;
  }

  .row-label {
    font-size: 0.78rem;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: capitalize;
  }

  .track {
    background: var(--surface-soft);
    border-radius: 999px;
    height: 10px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.4s ease;
  }

  .row-value {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-1);
    text-align: right;
  }

  .empty {
    font-size: 0.82rem;
    color: var(--text-3);
    padding: 8px 0;
  }
</style>
