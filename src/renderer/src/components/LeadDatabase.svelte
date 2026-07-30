<script>
  import { onMount } from 'svelte'
  import { formatRating } from '../lib/format'
  import { buildLeadsCsv, downloadCsv } from '../lib/csv'
  import { LEAD_STATUSES } from '../lib/constants'

  let leads = []
  let stats = null
  let loading = true
  let errorMessage = ''

  let statusFilter = ''
  let noWebsiteOnly = false
  let minRating = ''
  let searchText = ''

  async function load() {
    loading = true
    errorMessage = ''
    const filters = {
      status: statusFilter || undefined,
      hasWebsite: noWebsiteOnly ? false : undefined,
      minRating: minRating ? Number(minRating) : undefined,
      search: searchText || undefined
    }
    const [leadsRes, statsRes] = await Promise.all([
      window.api.dbListLeads(filters),
      window.api.dbStats()
    ])
    if (leadsRes.success) {
      leads = leadsRes.leads
    } else {
      errorMessage = leadsRes.error || 'Could not load the leads database.'
    }
    if (statsRes.success) stats = statsRes.stats
    loading = false
  }

  async function updateStatus(leadId, status) {
    await window.api.dbSetStatus({ leadId, status })
    leads = leads.map((l) => (l.id === leadId ? { ...l, status } : l))
  }

  function exportAll() {
    if (!leads.length) return
    const mapped = leads.map((l) => ({
      name: l.name,
      phone: l.phone,
      category: l.category,
      address: l.address,
      rating: l.rating,
      reviewCount: l.review_count,
      status: l.status,
      website: l.website,
      reputation: l.reputation,
      mapsUrl: l.maps_url
    }))
    downloadCsv(buildLeadsCsv(mapped), `dopmin-leads-database-${Date.now()}.csv`)
  }

  onMount(load)
</script>

<section class="card">
  <div class="header">
    <h2>Leads Database <span class="muted">— every lead ever scraped, across every search</span></h2>
    <button class="secondary-btn" on:click={exportAll}>Export all as CSV</button>
  </div>

  {#if stats}
    <div class="stats-row">
      <div class="stat"><strong>{stats.total}</strong> total leads</div>
      <div class="stat"><strong>{stats.noWebsite}</strong> without a website</div>
      <div class="stat"><strong>{stats.recentChanges}</strong> changes in last 7 days</div>
      {#each stats.byStatus as s}
        <div class="stat pill">{s.status}: {s.n}</div>
      {/each}
    </div>
  {/if}

  <div class="filters">
    <input
      type="text"
      placeholder="Search name, category, address…"
      bind:value={searchText}
      on:keydown={(e) => e.key === 'Enter' && load()}
    />
    <select bind:value={statusFilter}>
      <option value="">All statuses</option>
      {#each LEAD_STATUSES as s}
        <option value={s}>{s}</option>
      {/each}
    </select>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={noWebsiteOnly} />
      No website only
    </label>
    <input type="number" placeholder="Min rating" step="0.1" min="0" max="5" bind:value={minRating} />
    <button class="secondary-btn" on:click={load}>Apply filters</button>
  </div>

  {#if errorMessage}
    <p class="error-note">{errorMessage}</p>
  {:else if loading}
    <p class="muted">Loading…</p>
  {:else if leads.length === 0}
    <p class="muted">No leads match these filters yet — run a search to start building the database.</p>
  {:else}
    <table class="db-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Phone</th>
          <th>Rating</th>
          <th>Website</th>
          <th>First seen</th>
          <th>Last seen</th>
          <th>Seen ×</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#each leads as lead (lead.id)}
          <tr>
            <td class="name-cell">{lead.name}</td>
            <td class="muted-cell">{lead.category || '—'}</td>
            <td class="muted-cell">{lead.phone || '—'}</td>
            <td>{formatRating(lead.rating)}</td>
            <td>
              {#if lead.has_website}
                <span class="badge badge-ok">Has site</span>
              {:else}
                <span class="badge badge-warn">No site</span>
              {/if}
            </td>
            <td class="muted-cell">{new Date(lead.first_seen_at).toLocaleDateString()}</td>
            <td class="muted-cell">{new Date(lead.last_seen_at).toLocaleDateString()}</td>
            <td class="muted-cell">{lead.times_seen}</td>
            <td>
              <select value={lead.status} on:change={(e) => updateStatus(lead.id, e.target.value)}>
                {#each LEAD_STATUSES as s}
                  <option value={s}>{s}</option>
                {/each}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }

  .header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .muted {
    color: var(--text-3);
    font-weight: 400;
    font-size: 0.82rem;
  }

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

  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 14px;
  }

  .filters input[type='text'] {
    flex: 1;
    min-width: 180px;
  }

  .filters input,
  .filters select {
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    color: var(--text-2);
  }

  .secondary-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 14px;
    background: var(--surface);
    color: var(--text-1);
    font-weight: 600;
    font-size: 0.84rem;
    cursor: pointer;
  }

  .secondary-btn:hover {
    background: var(--surface-soft);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 9px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border-soft);
    font-size: 0.84rem;
  }

  th {
    color: var(--text-3);
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .name-cell {
    font-weight: 600;
    color: var(--text-1);
  }

  .muted-cell {
    color: var(--text-2);
  }

  .badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .badge-ok {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .badge-warn {
    background: var(--yellow-soft);
    color: var(--yellow-dark);
  }

  .error-note {
    color: var(--red-dark);
    font-size: 0.84rem;
  }
</style>
