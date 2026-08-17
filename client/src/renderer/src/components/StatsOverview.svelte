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
    <div class="stat-icon">
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M16 14a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 15Zm0 2c-2.67 0-8 1.34-8 4v2h10.5v-2c0-.98.35-2.53 2.03-3.7A13.36 13.36 0 0 0 8 17Zm8 0c-.29 0-.62.02-.97.05C16.63 18.19 17 19.6 17 21v2h7v-2c0-2.66-5.33-4-8-4Z"
          fill="currentColor"
        /></svg
      >
    </div>
    <div>
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
  </div>

  <div class="stat-card accent-green">
    <div class="stat-icon">
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="m12 17.27 5.18 3.13-1.37-5.9L20.5 10.3l-6.02-.52L12 4.2 9.52 9.78l-6.02.52 4.69 4.2-1.37 5.9L12 17.27Z"
          fill="currentColor"
        /></svg
      >
    </div>
    <div>
      <div class="stat-label">Hot leads</div>
      <div class="stat-value">{hotLeadsCount}</div>
      <div class="stat-note">No website, strong reviews</div>
    </div>
  </div>

  <div class="stat-card accent-red">
    <div class="stat-icon">
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M12 2 1 21h22L12 2Zm0 5.5 6.9 12H5.1L12 7.5ZM11 10v4h2v-4h-2Zm0 6v2h2v-2h-2Z"
          fill="currentColor"
        /></svg
      >
    </div>
    <div>
      <div class="stat-label">Reputation targets</div>
      <div class="stat-value">{riskLeadsCount}</div>
      <div class="stat-note">No website, weak reviews</div>
    </div>
  </div>

  <div class="stat-card">
    <div class="stat-icon">
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.93 9h-3.05a15.4 15.4 0 0 0-1.13-5.4A8 8 0 0 1 18.93 11ZM12 4c.83 0 2.19 2 2.85 5h-5.7C9.81 6 11.17 4 12 4ZM4.07 11a8 8 0 0 1 5.18-6.4A15.4 15.4 0 0 0 8.12 11Zm0 2h3.05a15.4 15.4 0 0 0 1.13 5.4A8 8 0 0 1 4.07 13ZM12 20c-.83 0-2.19-2-2.85-5h5.7c-.66 3-2.02 5-2.85 5Zm3.8-1.4A15.4 15.4 0 0 0 16.93 13h3.05a8 8 0 0 1-5.18 5.6Z"
          fill="currentColor"
        /></svg
      >
    </div>
    <div>
      <div class="stat-label">No website</div>
      <div class="stat-value">{noWebsiteCount}</div>
      <div class="stat-note">Out of {totalShown} shown</div>
    </div>
  </div>
</section>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .stat-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px 18px;
    box-shadow: var(--shadow-sm);
    transition:
      transform 0.15s var(--ease),
      box-shadow 0.15s var(--ease);
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .stat-icon {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  .stat-icon svg {
    width: 18px;
    height: 18px;
  }

  .accent-green .stat-icon {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .accent-red .stat-icon {
    background: var(--red-soft);
    color: var(--red-dark);
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
