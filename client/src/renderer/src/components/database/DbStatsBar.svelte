<script>
  export let stats = null
</script>

{#if stats}
  <div class="stats-row">
    <div class="stat"><strong>{stats.total}</strong> total leads</div>
    <div class="stat"><strong>{stats.noWebsite}</strong> without a website</div>
    <div class="stat"><strong>{stats.recentChanges}</strong> changes in last 7 days</div>
    {#each stats.byStatus as s (s.status)}
      <div class="stat pill">{s.status}: {s.n}</div>
    {/each}
  </div>
{/if}

<style>
  .stats-row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .stat {
    font-size: 0.8rem;
    color: var(--text-2);
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: 999px;
    padding: 5px 12px;
  }
</style>
