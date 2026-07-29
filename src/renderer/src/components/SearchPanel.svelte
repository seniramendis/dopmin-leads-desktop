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

<section class="hero">
  <h1>Extraction Engine</h1>
  <p class="hero-sub">
    Deploy deep-search scraping across Google Maps to harvest high-intent business leads —
    deduplicated, and sorted by review sentiment.
  </p>

  <div class="search-card">
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
        {isScraping ? 'Scraping…' : 'Launch Extraction'}
      </button>
    </div>
    <p class="search-hint">
      We'll try to find exactly {clampedCount} unique businesses. If fewer genuinely exist for this search,
      we'll show everything we found instead of padding the list. Just a city or town name (no business
      type) also works — we'll automatically search it across common local business categories for you.
    </p>
  </div>
</section>

<style>
  .hero {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 28px;
  }

  .hero h1 {
    margin: 0 0 6px;
    font-size: 1.9rem;
    letter-spacing: -0.01em;
  }

  .hero-sub {
    margin: 0 0 20px;
    color: #64748b;
    max-width: 640px;
  }

  .search-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 18px;
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
    font-size: 0.78rem;
    font-weight: 600;
    color: #475569;
  }

  input {
    padding: 12px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.95rem;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .search-hint {
    margin: 10px 2px 0;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .primary-btn {
    border: none;
    border-radius: 10px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
