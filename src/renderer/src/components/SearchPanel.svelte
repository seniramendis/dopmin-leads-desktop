<script>
  export let query
  export let desiredCount
  export let isScraping
  export let onSearch

  $: clampedCount = Math.max(1, Math.min(500, Math.floor(Number(desiredCount)) || 30))

  function handleKeydown(event) {
    if (event.key === 'Enter') onSearch()
  }
</script>

<section class="card">
  <div class="card-header">
    <h2>New search</h2>
    <span class="card-header-note">Results are deduplicated and scored by review sentiment</span>
  </div>

  <div class="search-row">
    <div class="field grow">
      <label for="query-input">Search query</label>
      <input
        id="query-input"
        bind:value={query}
        placeholder="e.g., Electricians in Kandy, Sri Lanka"
        disabled={isScraping}
        on:keydown={handleKeydown}
      />
    </div>
    <div class="field count-field">
      <label for="count-input">Max results</label>
      <input
        id="count-input"
        type="number"
        min="1"
        max="500"
        bind:value={desiredCount}
        disabled={isScraping}
      />
    </div>
    <button class="primary-btn" on:click={onSearch} disabled={isScraping}>
      {isScraping ? 'Searching…' : 'Run search'}
    </button>
  </div>

  <p class="search-hint">
    We'll try to find exactly {clampedCount} unique businesses. If fewer genuinely exist, we'll show
    everything we found instead of padding the list. A city or town name alone also works — we'll
    expand it across common local business categories automatically.
  </p>
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
  }

  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .card-header h2 {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .card-header-note {
    font-size: 0.78rem;
    color: var(--text-3);
  }

  .search-row {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field.grow {
    flex: 1;
    min-width: 240px;
  }

  .count-field {
    width: 130px;
  }

  label {
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-3);
  }

  input {
    padding: 11px 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-1);
    font-size: 0.92rem;
  }

  input::placeholder {
    color: var(--text-3);
  }

  input:disabled {
    background: var(--surface-soft);
    color: var(--text-3);
  }

  input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft);
  }

  .search-hint {
    margin: 14px 2px 0;
    font-size: 0.78rem;
    color: var(--text-3);
    max-width: 720px;
  }

  .primary-btn {
    border: 1px solid var(--brand);
    border-radius: var(--radius-sm);
    padding: 11px 20px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-btn:hover:not(:disabled) {
    background: var(--brand-dark);
    border-color: var(--brand-dark);
  }

  .primary-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
