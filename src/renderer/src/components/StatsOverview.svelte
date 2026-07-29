<script>
  export let totalFound
  export let requested
  export let truncated
  export let hotLeadsCount
  export let riskLeadsCount
  export let noWebsiteCount
  export let totalShown
</script>

<section class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Unique leads found</div>
    <div class="stat-value">{totalFound}</div>
    <div class="stat-note">
      {#if truncated}
        Requested {requested}, more available
      {:else}
        Of {requested} requested
      {/if}
    </div>
  </div>
  <div class="stat-card accent-green">
    <div class="stat-label">Hot leads</div>
    <div class="stat-value">{hotLeadsCount}</div>
    <div class="stat-note">No website, strong reviews</div>
  </div>
  <div class="stat-card accent-red">
    <div class="stat-label">Reputation targets</div>
    <div class="stat-value">{riskLeadsCount}</div>
    <div class="stat-note">No website, weak reviews</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">No website</div>
    <div class="stat-value">{noWebsiteCount}</div>
    <div class="stat-note">Out of {totalShown} shown</div>
  </div>
</section>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px 18px;
  }

  .stat-card.accent-green {
    border-left-color: var(--green);
  }

  .stat-card.accent-red {
    border-left-color: var(--red);
  }

  .stat-label {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stat-value {
    font-size: 1.65rem;
    font-weight: 700;
    margin-top: 6px;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }

  .stat-note {
    font-size: 0.78rem;
    color: var(--text-3);
    margin-top: 3px;
  }

  @media (max-width: 820px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
