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
    <div class="stat-label">Unique Leads Found</div>
    <div class="stat-value">{totalFound}</div>
    <div class="stat-note">
      {#if truncated}
        requested {requested}, more available
      {:else}
        of {requested} requested
      {/if}
    </div>
  </div>
  <div class="stat-card accent-green">
    <div class="stat-label">Hot Leads</div>
    <div class="stat-value">{hotLeadsCount}</div>
    <div class="stat-note">No website + good reviews</div>
  </div>
  <div class="stat-card accent-red">
    <div class="stat-label">Reputation Targets</div>
    <div class="stat-value">{riskLeadsCount}</div>
    <div class="stat-note">No website + poor reviews</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">No Website</div>
    <div class="stat-value">{noWebsiteCount}</div>
    <div class="stat-note">out of {totalShown} shown</div>
  </div>
</section>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .stat-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 16px 18px;
  }

  .stat-card.accent-green {
    border-color: #bbf7d0;
    background: #f0fdf4;
  }

  .stat-card.accent-red {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .stat-label {
    font-size: 0.76rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.7rem;
    font-weight: 800;
    margin-top: 4px;
    color: #0f172a;
  }

  .stat-note {
    font-size: 0.78rem;
    color: #94a3b8;
    margin-top: 2px;
  }

  @media (max-width: 820px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
