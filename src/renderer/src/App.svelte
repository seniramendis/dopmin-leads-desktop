<script>
  let query = 'hardware stores in Mount Lavinia'
  let desiredCount = 30
  let leads = []
  let isScraping = false
  let errorMessage = ''
  let totalFound = 0
  let requested = 0
  let truncated = false
  let hasSearched = false

  $: hotLeads = leads.filter((l) => l.isHotLead).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  $: riskLeads = leads
    .filter((l) => l.isReputationRisk)
    .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))
  $: noWebsiteCount = leads.filter((l) => !l.hasWebsite).length

  async function handleSearch() {
    if (!query.trim() || isScraping) return

    isScraping = true
    errorMessage = ''
    leads = []
    hasSearched = true

    const count = Math.max(1, Math.min(500, Math.floor(Number(desiredCount)) || 30))
    desiredCount = count

    try {
      const response = await window.api.startScraping({ query, maxResults: count })
      if (response.success) {
        leads = response.leads
        totalFound = response.totalFound ?? response.leads.length
        requested = response.requested ?? count
        truncated = Boolean(response.truncated)
      } else {
        errorMessage = response.error || 'Failed to fetch leads.'
      }
    } catch (err) {
      errorMessage = err.message || 'Scraping failed.'
    } finally {
      isScraping = false
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard?.writeText(text)
  }

  function copyLead(lead) {
    copyToClipboard(`${lead.name} | ${lead.phone} | ${lead.rating ?? 'N/A'}★ (${lead.reviewCount})`)
  }

  function exportToCSV() {
    if (!leads.length) return

    const header = [
      'Business Name',
      'Phone Number',
      'Rating',
      'Reviews',
      'Website Status',
      'Reputation'
    ]
    const rows = [
      header.join(','),
      ...leads.map((lead) =>
        [
          `"${lead.name}"`,
          `"${lead.phone}"`,
          lead.rating ?? '',
          lead.reviewCount ?? 0,
          `"${lead.status}"`,
          `"${lead.reputation}"`
        ].join(',')
      )
    ]

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dopmin-leads-${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function stars(rating) {
    if (rating === null || rating === undefined) return '—'
    const full = Math.round(rating)
    return '★'.repeat(full) + '☆'.repeat(5 - full)
  }
</script>

<main class="app">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">D</div>
      <div>
        <div class="brand-name">Dopmin Web Scraper</div>
        <div class="brand-sub">Local lead extraction, without the noise</div>
      </div>
    </div>
    <div class="topbar-right">
      <span class="workspace-pill">Workspace: Alpha</span>
    </div>
  </header>

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
            on:keydown={(event) => event.key === 'Enter' && handleSearch()}
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
        <button class="primary-btn" on:click={handleSearch} disabled={isScraping}>
          {isScraping ? 'Scraping…' : 'Launch Extraction'}
        </button>
      </div>
      <p class="search-hint">
        We'll try to find exactly {Math.max(
          1,
          Math.min(500, Math.floor(Number(desiredCount)) || 30)
        )}
        unique businesses. If fewer genuinely exist for this search, we'll show everything we found instead
        of padding the list.
      </p>
    </div>
  </section>

  {#if errorMessage}
    <div class="error-banner">{errorMessage}</div>
  {/if}

  {#if isScraping}
    <div class="status-banner">Opening a headless browser and scanning Google Maps results…</div>
  {/if}

  {#if hasSearched && !isScraping && leads.length > 0}
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
        <div class="stat-value">{hotLeads.length}</div>
        <div class="stat-note">No website + good reviews</div>
      </div>
      <div class="stat-card accent-red">
        <div class="stat-label">Reputation Targets</div>
        <div class="stat-value">{riskLeads.length}</div>
        <div class="stat-note">No website + poor reviews</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">No Website</div>
        <div class="stat-value">{noWebsiteCount}</div>
        <div class="stat-note">out of {leads.length} shown</div>
      </div>
    </section>

    <section class="split-grid">
      <div class="panel panel-green">
        <div class="panel-header">
          <h2>High-Value Leads</h2>
          <span class="panel-tag">good reviews</span>
        </div>
        {#if hotLeads.length === 0}
          <p class="empty-note">No no-website leads with strong ratings in this batch.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each hotLeads.slice(0, 8) as lead (lead.id)}
                <tr>
                  <td>{lead.name}</td>
                  <td class="stars-cell">{stars(lead.rating)}</td>
                  <td>{lead.reviewCount}</td>
                  <td>
                    <button class="icon-btn" on:click={() => copyLead(lead)} title="Copy details"
                      >⧉</button
                    >
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      <div class="panel panel-red">
        <div class="panel-header">
          <h2>Reputation Rescue</h2>
          <span class="panel-tag">bad reviews</span>
        </div>
        {#if riskLeads.length === 0}
          <p class="empty-note">No no-website leads with weak ratings in this batch.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each riskLeads.slice(0, 8) as lead (lead.id)}
                <tr>
                  <td>{lead.name}</td>
                  <td class="stars-cell risk">{stars(lead.rating)}</td>
                  <td>{lead.reviewCount}</td>
                  <td>
                    <button class="icon-btn" on:click={() => copyLead(lead)} title="Copy details"
                      >⧉</button
                    >
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>

    <section class="results-card">
      <div class="results-header">
        <h2>All results ({leads.length})</h2>
        <button class="export-btn" on:click={exportToCSV}>Export CSV</button>
      </div>

      <table class="full-table">
        <thead>
          <tr>
            <th>Business Name</th>
            <th>Phone Number</th>
            <th>Rating</th>
            <th>Reviews</th>
            <th>Website</th>
            <th>Reputation</th>
          </tr>
        </thead>
        <tbody>
          {#each leads as lead (lead.id)}
            <tr>
              <td>{lead.name}</td>
              <td>{lead.phone}</td>
              <td class="stars-cell" class:risk={lead.isReputationRisk}>{stars(lead.rating)}</td>
              <td>{lead.reviewCount}</td>
              <td>
                <span class="badge" class:badge-warn={!lead.hasWebsite}>{lead.status}</span>
              </td>
              <td>
                <span class="rep-pill rep-{lead.reputation}">{lead.reputation}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {:else if hasSearched && !isScraping && leads.length === 0 && !errorMessage}
    <div class="status-banner">No results found for this search. Try broadening your query.</div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  :global(#app) {
    min-height: 100vh;
  }

  .app {
    max-width: 1160px;
    margin: 0 auto;
    padding: 28px 24px 56px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #fff;
    font-weight: 800;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand-name {
    font-weight: 800;
    font-size: 1.15rem;
    color: #0f172a;
  }

  .brand-sub {
    font-size: 0.8rem;
    color: #64748b;
  }

  .workspace-pill {
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #e0e7ff;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

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

  .error-banner {
    padding: 12px 16px;
    border-radius: 10px;
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .status-banner {
    padding: 12px 16px;
    border-radius: 10px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

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

  .split-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 18px;
    border: 1px solid #e2e8f0;
    border-top: 3px solid #cbd5e1;
  }

  .panel-green {
    border-top-color: #22c55e;
  }

  .panel-red {
    border-top-color: #ef4444;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .panel-tag {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
    background: #f1f5f9;
    padding: 3px 8px;
    border-radius: 999px;
  }

  .empty-note {
    color: #94a3b8;
    font-size: 0.85rem;
    margin: 8px 0 4px;
  }

  .results-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 20px;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .export-btn {
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    background: #0f766e;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 8px;
    text-align: left;
    border-bottom: 1px solid #eef2f6;
    font-size: 0.88rem;
  }

  th {
    color: #94a3b8;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .stars-cell {
    color: #16a34a;
    letter-spacing: 1px;
  }

  .stars-cell.risk {
    color: #dc2626;
  }

  .icon-btn {
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
    color: #475569;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 0.78rem;
  }

  .badge-warn {
    background: #fff7ed;
    color: #c2410c;
  }

  .rep-pill {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: capitalize;
  }

  .rep-excellent {
    background: #dcfce7;
    color: #15803d;
  }

  .rep-good {
    background: #ecfccb;
    color: #4d7c0f;
  }

  .rep-average {
    background: #fef9c3;
    color: #a16207;
  }

  .rep-poor {
    background: #fee2e2;
    color: #b91c1c;
  }

  .rep-unrated {
    background: #f1f5f9;
    color: #64748b;
  }

  @media (max-width: 820px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .split-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
