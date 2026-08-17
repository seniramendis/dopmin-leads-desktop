<script>
  import { formatRating } from '../lib/format'
  import { buildLeadsCsv, downloadCsv } from '../lib/csv'
  import LeadActions from './LeadActions.svelte'

  export let leads // all leads, unfiltered
  export let failedCount
  export let onlyNoWebsite = true

  $: visibleLeads = onlyNoWebsite ? leads.filter((l) => !l.hasWebsite) : leads

  function exportToCSV() {
    if (!visibleLeads.length) return
    downloadCsv(buildLeadsCsv(visibleLeads), `dopmin-leads-${Date.now()}.csv`)
  }
</script>

<section class="card">
  <div class="results-header">
    <h2>All results <span class="results-count">({visibleLeads.length})</span></h2>
    <div class="results-actions">
      <label class="filter-toggle">
        <input type="checkbox" bind:checked={onlyNoWebsite} />
        Only businesses without a website
      </label>
      <button class="secondary-btn" on:click={exportToCSV}>Export CSV</button>
    </div>
  </div>

  <p class="disclaimer-note">
    "Audit site" scores are automated, heuristic checks — not a professional technical or security
    audit. WhatsApp is a direct message to a real person: sending it is on you, so make sure you
    have a legitimate basis to reach out and that it complies with local marketing/anti-spam rules
    and WhatsApp's own terms of use.
  </p>

  <div class="table-scroll">
    <table class="full-table">
      <thead>
        <tr>
          <th>Business name</th>
          <th>Category</th>
          <th>Phone number</th>
          <th>Address</th>
          <th>Rating</th>
          <th>Reviews</th>
          <th>Website</th>
          <th>Reputation</th>
          <th>Outreach</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleLeads as lead (lead.id)}
          <tr>
            <td>
              <a class="lead-link" href={lead.mapsUrl} target="_blank" rel="noreferrer"
                >{lead.name}</a
              >
              {#if lead.isNew}
                <span class="badge badge-new" title="First time this lead has been scraped"
                  >New</span
                >
              {:else if lead.changes?.length}
                <span
                  class="badge badge-changed"
                  title={lead.changes
                    .map((c) => `${c.field}: ${c.oldVal} → ${c.newVal}`)
                    .join(' • ')}
                >
                  Changed
                </span>
              {/if}
            </td>
            <td class="muted-cell">{lead.category || '—'}</td>
            <td class="muted-cell">{lead.phone}</td>
            <td class="muted-cell address-cell">{lead.address || '—'}</td>
            <td class="rating-cell" class:risk={lead.isReputationRisk}
              >{formatRating(lead.rating)}</td
            >
            <td class="muted-cell">{lead.reviewCount}</td>
            <td>
              {#if lead.hasWebsite}
                <a class="website-link" href={lead.website} target="_blank" rel="noreferrer"
                  >Visit site</a
                >
              {:else}
                <span class="badge badge-warn">No website found</span>
              {/if}
            </td>
            <td>
              <span class="rep-pill rep-{lead.reputation}">{lead.reputation}</span>
            </td>
            <td>
              <LeadActions {lead} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

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
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .results-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .results-count {
    font-weight: 500;
    color: var(--text-3);
  }

  .results-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-2);
    cursor: pointer;
    user-select: none;
  }

  .filter-toggle input {
    padding: 0;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .secondary-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 16px;
    background: var(--surface);
    color: var(--text-1);
    font-weight: 600;
    font-size: 0.86rem;
    cursor: pointer;
  }

  .secondary-btn:hover {
    background: var(--surface-soft);
    border-color: var(--text-3);
  }

  .disclaimer-note {
    margin: 0 0 14px;
    max-width: 760px;
  }

  .table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 880px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border-soft);
    font-size: 0.86rem;
    color: var(--text-1);
  }

  th {
    color: var(--text-3);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .lead-link {
    color: var(--text-1);
    text-decoration: none;
    font-weight: 600;
  }

  .lead-link:hover {
    color: var(--brand);
    text-decoration: underline;
  }

  .website-link {
    color: var(--green-dark);
    font-weight: 600;
    text-decoration: none;
    font-size: 0.84rem;
  }

  .website-link:hover {
    text-decoration: underline;
  }

  .muted-cell {
    color: var(--text-2);
  }

  .address-cell {
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rating-cell {
    font-weight: 700;
    color: var(--green-dark);
  }

  .rating-cell.risk {
    color: var(--red-dark);
  }

  .badge {
    display: inline-block;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    color: var(--text-2);
    font-size: 0.76rem;
    font-weight: 600;
  }

  .badge-warn {
    background: var(--yellow-soft);
    border-color: var(--yellow-soft);
    color: var(--yellow-dark);
  }

  .badge-new {
    background: var(--green-soft);
    border: none;
    color: var(--green-dark);
    margin-left: 6px;
  }

  .badge-changed {
    background: var(--red-soft);
    border: none;
    color: var(--red-dark);
    margin-left: 6px;
    cursor: help;
  }

  .rep-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: capitalize;
    border: 1px solid transparent;
  }

  .rep-excellent {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .rep-good {
    background: var(--green-soft);
    color: var(--green-dark);
    opacity: 0.85;
  }

  .rep-average {
    background: var(--yellow-soft);
    color: var(--yellow-dark);
  }

  .rep-poor {
    background: var(--red-soft);
    color: var(--red-dark);
  }

  .rep-unrated {
    background: var(--surface-soft);
    color: var(--text-3);
    border-color: var(--border-soft);
  }

  .empty-note {
    color: var(--text-3);
    font-size: 0.85rem;
    margin: 8px 0 4px;
  }

  .failed-note {
    margin: 10px 2px 0;
    font-size: 0.8rem;
    color: var(--text-3);
  }
</style>
