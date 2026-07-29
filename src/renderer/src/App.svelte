<script>
  let query = 'hardware stores in Mount Lavinia'
  let leads = []
  let isScraping = false
  let errorMessage = ''

  async function handleSearch() {
    if (!query.trim()) return

    isScraping = true
    errorMessage = ''
    leads = []

    try {
      const response = await window.api.startScraping({ query, maxResults: 30 })
      if (response.success) {
        leads = response.leads
      } else {
        errorMessage = response.error || 'Failed to fetch leads.'
      }
    } catch (err) {
      errorMessage = err.message || 'Scraping failed.'
    } finally {
      isScraping = false
    }
  }

  function exportToCSV() {
    if (!leads.length) return

    const header = ['Business Name', 'Phone Number', 'Status']
    const rows = [
      header.join(','),
      ...leads.map((lead) => `"${lead.name}","${lead.phone}","${lead.status}"`)
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
</script>

<main class="container">
  <header class="header">
    <div>
      <p class="eyebrow">Electron + Svelte</p>
      <h1>Dopmin Leads Desktop</h1>
      <p class="subtitle">
        Find local businesses without websites and export the results for outreach.
      </p>
    </div>
  </header>

  <section class="search-card">
    <label for="query-input">Search query</label>
    <div class="search-row">
      <input
        id="query-input"
        bind:value={query}
        placeholder="e.g. salons in Colombo"
        disabled={isScraping}
        on:keydown={(event) => event.key === 'Enter' && handleSearch()}
      />
      <button on:click={handleSearch} disabled={isScraping}>
        {isScraping ? 'Scraping…' : 'Find Prospects'}
      </button>
    </div>
  </section>

  {#if errorMessage}
    <div class="error-banner">{errorMessage}</div>
  {/if}

  {#if isScraping}
    <div class="status">Opening Chromium and scanning Google Maps results…</div>
  {/if}

  {#if leads.length > 0}
    <section class="results-card">
      <div class="results-header">
        <h2>Found {leads.length} qualified prospects</h2>
        <button class="export-btn" on:click={exportToCSV}>Export CSV</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Business Name</th>
            <th>Phone Number</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each leads as lead (lead.id)}
            <tr>
              <td>{lead.name}</td>
              <td>{lead.phone}</td>
              <td><span class="badge">{lead.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0f172a;
    color: #f8fafc;
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

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 32px 24px 48px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .eyebrow {
    margin: 0 0 4px;
    font-size: 0.75rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #7dd3fc;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 6px 0 0;
    color: #cbd5e1;
  }

  .search-card,
  .results-card {
    background: #111827;
    border: 1px solid #334155;
    border-radius: 16px;
    padding: 20px;
  }

  label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .search-row {
    display: flex;
    gap: 12px;
  }

  input {
    flex: 1;
    padding: 12px 14px;
    border: 1px solid #475569;
    border-radius: 10px;
    background: #0f172a;
    color: #f8fafc;
  }

  button {
    border: none;
    border-radius: 10px;
    padding: 12px 16px;
    background: #2563eb;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .export-btn {
    background: #0f766e;
  }

  .error-banner {
    padding: 12px 14px;
    border-radius: 10px;
    background: #7f1d1d;
    color: #fecaca;
  }

  .status {
    color: #bae6fd;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 12px 10px;
    text-align: left;
    border-bottom: 1px solid #334155;
  }

  th {
    color: #94a3b8;
    font-size: 0.84rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 999px;
    background: #1f2937;
    color: #fbbf24;
    font-size: 0.8rem;
  }
</style>
