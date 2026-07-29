<script>
  import { stars } from '../lib/format'
  import { buildLeadsCsv, downloadCsv } from '../lib/csv'

  export let leads // all leads, unfiltered
  export let failedCount
  export let onlyNoWebsite = true

  $: visibleLeads = onlyNoWebsite ? leads.filter((l) => !l.hasWebsite) : leads

  function exportToCSV() {
    if (!visibleLeads.length) return
    downloadCsv(buildLeadsCsv(visibleLeads), `dopmin-leads-${Date.now()}.csv`)
  }
</script>

<section class="results-card">
  <div class="results-header">
    <h2>All results ({visibleLeads.length})</h2>
    <div class="results-actions">
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={onlyNoWebsite} />
        Only businesses without a website
      </label>
      <button class="export-btn" on:click={exportToCSV}>Export CSV</button>
    </div>
  </div>

  <table class="full-table">
    <thead>
      <tr>
        <th>Business Name</th>
        <th>Category</th>
        <th>Phone Number</th>
        <th>Address</th>
        <th>Rating</th>
        <th>Reviews</th>
        <th>Website</th>
        <th>Reputation</th>
      </tr>
    </thead>
    <tbody>
      {#each visibleLeads as lead (lead.id)}
        <tr>
          <td>
            <a class="lead-link" href={lead.mapsUrl} target="_blank" rel="noreferrer">{lead.name}</a
            >
          </td>
          <td class="muted-cell">{lead.category || '—'}</td>
          <td>{lead.phone}</td>
          <td class="muted-cell address-cell">{lead.address || '—'}</td>
          <td class="stars-cell" class:risk={lead.isReputationRisk}>{stars(lead.rating)}</td>
          <td>{lead.reviewCount}</td>
          <td>
            {#if lead.hasWebsite}
              <a class="website-link" href={lead.website} target="_blank" rel="noreferrer"
                >Visit site</a
              >
            {:else}
              <span class="badge badge-warn">No Website Found</span>
            {/if}
          </td>
          <td>
            <span class="rep-pill rep-{lead.reputation}">{lead.reputation}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if visibleLeads.length === 0}
    <p class="empty-note">
      No businesses without a website in this batch. Uncheck the filter above to see all
      {leads.length} results.
    </p>
  {/if}

  {#if failedCount > 0}
    <p class="failed-note">
      {failedCount}
      {failedCount === 1 ? 'listing' : 'listings'} couldn't be read (Google blocked or timed out) and
      {failedCount === 1 ? 'was' : 'were'} skipped.
    </p>
  {/if}
</section>

<style>
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
    flex-wrap: wrap;
    gap: 10px;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .results-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    user-select: none;
  }

  .filter-toggle input {
    padding: 0;
    accent-color: #0f766e;
    cursor: pointer;
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

  .lead-link {
    color: #0f172a;
    text-decoration: none;
    font-weight: 600;
  }

  .lead-link:hover {
    color: #3b82f6;
    text-decoration: underline;
  }

  .website-link {
    color: #0f766e;
    font-weight: 600;
    text-decoration: none;
    font-size: 0.85rem;
  }

  .website-link:hover {
    text-decoration: underline;
  }

  .muted-cell {
    color: #64748b;
  }

  .address-cell {
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stars-cell {
    color: #16a34a;
    letter-spacing: 1px;
  }

  .stars-cell.risk {
    color: #dc2626;
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

  .empty-note {
    color: #94a3b8;
    font-size: 0.85rem;
    margin: 8px 0 4px;
  }

  .failed-note {
    margin: 10px 2px 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }
</style>
