<script>
  import { searchCategory, searchRegion } from '../lib/stores.js'

  export let query = ''
  export let desiredCount = 30
  export let isScraping = false
  export let isScanning = false
  export let onSearch = null
  export let leads = []

  let scrapeMode = 'it_projects'
  let industry = 'healthcare'

  $: effectiveIsScanning = isScraping || isScanning
  $: clampedCount = Math.max(1, Math.min(500, Math.floor(Number(desiredCount)) || 30))

  async function startEngine() {
    const payload = {
      query,
      desiredCount,
      category: $searchCategory,
      region: $searchRegion,
      mode: scrapeMode,
      industry
    }

    if (typeof onSearch === 'function') {
      await onSearch(payload)
      return
    }

    isScanning = true
    try {
      const results = await window.api.startScrape(
        $searchCategory,
        $searchRegion,
        scrapeMode,
        industry,
        query,
        desiredCount
      )
      leads = Array.isArray(results) ? results : results?.leads || []
    } catch (error) {
      console.error('Scrape failed:', error)
    } finally {
      isScanning = false
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') startEngine()
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
        disabled={effectiveIsScanning}
        on:keydown={handleKeydown}
      />
    </div>

    <div class="field mode-field">
      <label for="scrape-mode-select">Scrape Mode</label>
      <select id="scrape-mode-select" bind:value={scrapeMode} disabled={effectiveIsScanning}>
        <option value="it_projects">B2B IT Projects & RFPs</option>
        <option value="local_maps">Local Google Maps Businesses</option>
      </select>
    </div>

    <div class="field category-field">
      <label for="industry-select">Industry</label>
      <select id="industry-select" bind:value={industry} disabled={effectiveIsScanning}>
        <option value="healthcare">Healthcare & Medical</option>
        <option value="ecommerce">E-commerce & Retail</option>
        <option value="finance">Finance & Fintech</option>
        <option value="real_estate">Real Estate</option>
        <option value="agritech">Agriculture & AgriTech</option>
      </select>
    </div>

    <div class="field category-field">
      <label for="category-select">Service Category</label>
      <select id="category-select" bind:value={$searchCategory} disabled={effectiveIsScanning}>
        <option value="mobile_apps">Mobile Apps</option>
        <option value="mid_size_it">Mid-Size IT Projects</option>
        <option value="ai_agents">AI Agents</option>
      </select>
    </div>

    <div class="field region-field">
      <label for="region-select">Region</label>
      <select id="region-select" bind:value={$searchRegion} disabled={effectiveIsScanning}>
        <option value="local">Sri Lanka</option>
        <option value="australia">Australia</option>
        <option value="new_zealand">New Zealand</option>
        <option value="dubai">Dubai (UAE)</option>
        <option value="usa">USA</option>
        <option value="europe">Europe</option>
      </select>
    </div>

    <div class="field count-field">
      <label for="count-input">Max results</label>
      <input
        id="count-input"
        type="number"
        min="1"
        max="500"
        bind:value={desiredCount}
        disabled={effectiveIsScanning}
      />
    </div>
    <button class="primary-btn" on:click={startEngine} disabled={effectiveIsScanning}>
      {effectiveIsScanning ? 'Scanning…' : 'Initiate Engine'}
    </button>
  </div>

  <p class="search-hint">
    We'll try to find exactly {clampedCount} unique businesses. If fewer genuinely exist, we'll show everything
    we found instead of padding the list. A city or town name alone also works — we'll expand it across
    common local categories automatically while respecting the selected zero-cost targeting profile.
  </p>

  <p class="disclaimer-note">
    Results are pulled from publicly available Google Maps listings at the time of search — ratings,
    contact details, and website status can be incomplete, out of date, or wrong. Verify a lead
    before you rely on it for outreach or decision-making.
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

  .mode-field,
  .category-field,
  .region-field {
    min-width: 170px;
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

  input,
  select {
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

  input:disabled,
  select:disabled {
    background: var(--surface-soft);
    color: var(--text-3);
  }

  input:focus,
  select:focus {
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

  .disclaimer-note {
    margin: 8px 2px 0;
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
