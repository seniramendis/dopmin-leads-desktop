<script>
  import { formatRating } from '../../lib/format'
  import { LEAD_STATUSES, TABLE_PAGE_SIZE } from '../../lib/constants'

  export let filters // { search, hasWebsite, minRating } — status is a table-only extra filter
  export let refreshToken = 0
  export let onStatusChanged = () => {}

  let statusFilter = ''
  let leads = []
  let total = 0
  let limit = TABLE_PAGE_SIZE
  let loading = true
  let errorMessage = ''

  async function load(reset = true) {
    loading = true
    errorMessage = ''
    if (reset) limit = TABLE_PAGE_SIZE
    const combined = { ...filters, status: statusFilter || undefined, limit }
    const [leadsRes, countRes] = await Promise.all([
      window.api.dbListLeads(combined),
      window.api.dbCountLeads({ ...filters, status: statusFilter || undefined })
    ])
    if (leadsRes.success) leads = leadsRes.leads
    else errorMessage = leadsRes.error || 'Could not load the leads database.'
    if (countRes.success) total = countRes.count
    loading = false
  }

  function loadMore() {
    limit += TABLE_PAGE_SIZE
    load(false)
  }

  async function updateStatus(leadId, status) {
    await window.api.dbSetStatus({ leadId, status })
    leads = leads.map((l) => (l.id === leadId ? { ...l, status } : l))
    onStatusChanged()
  }

  // Re-fetch on external filter changes or forced refresh, and whenever
  // the table's own status dropdown changes.
  $: (filters, refreshToken, statusFilter, load(true))
</script>

<div class="table-toolbar">
  <select bind:value={statusFilter}>
    <option value="">All statuses</option>
    {#each LEAD_STATUSES as s (s)}
      <option value={s}>{s}</option>
    {/each}
  </select>
  {#if !loading}
    <span class="count-note">Showing {leads.length} of {total}</span>
  {/if}
</div>

{#if errorMessage}
  <p class="error-note">{errorMessage}</p>
{:else if loading && leads.length === 0}
  <p class="muted">Loading…</p>
{:else if leads.length === 0}
  <p class="muted">
    No leads match these filters yet — run a search to start building the database.
  </p>
{:else}
  <div class="table-scroll">
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
                {#each LEAD_STATUSES as s (s)}
                  <option value={s}>{s}</option>
                {/each}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if leads.length < total}
    <button class="load-more" on:click={loadMore}>
      Load {Math.min(TABLE_PAGE_SIZE, total - leads.length)} more
    </button>
  {/if}
{/if}

<style>
  .table-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .table-toolbar select {
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }

  .count-note {
    font-size: 0.78rem;
    color: var(--text-3);
  }

  .muted {
    color: var(--text-3);
    font-weight: 400;
    font-size: 0.82rem;
  }

  .table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 760px;
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

  .load-more {
    margin-top: 12px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: none;
    padding: 9px;
    width: 100%;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-2);
    cursor: pointer;
  }

  .load-more:hover {
    background: var(--surface-soft);
  }
</style>
