<script>
  // Orchestrator only — data-fetching and rendering for each view mode
  // lives in src/renderer/src/components/database/*. Keeping this file
  // thin is what keeps the database section from turning into a single
  // sprawling component as the dataset (and the views on it) grows:
  //
  //   LeadDatabase (this file)   — shared filters, stats, view toggle
  //   ├─ DbFilterBar             — search / website / rating filter controls
  //   ├─ DbStatsBar              — total/no-website/status summary pills
  //   ├─ PipelineBoard           — Kanban columns, one per lead status
  //   │   └─ PipelineColumn × N  — self-paginating, accepts drag-and-drop
  //   │       └─ LeadCard        — one lead, draggable between columns
  //   └─ DbTableView             — flat sortable/paginated table, alt view
  //
  // Every view reads from the same local SQLite table via IPC; none of
  // them ever pulls the whole table into the renderer at once — each
  // fetches its own filtered, paginated slice, so this stays fast whether
  // there are 50 leads or 50,000.
  import { onMount } from 'svelte'
  import { buildLeadsCsv, downloadCsv } from '../lib/csv'
  import DbFilterBar from './database/DbFilterBar.svelte'
  import DbStatsBar from './database/DbStatsBar.svelte'
  import PipelineBoard from './database/PipelineBoard.svelte'
  import DbTableView from './database/DbTableView.svelte'

  let stats = null
  let viewMode = 'pipeline'

  // Shared across both views. Status is deliberately NOT part of this —
  // the pipeline board owns status by splitting into columns, and the
  // table view has its own status dropdown for when you just want a flat
  // filtered list of one stage.
  let searchText = ''
  let noWebsiteOnly = false
  let minRating = ''

  let appliedFilters = { search: undefined, hasWebsite: undefined, minRating: undefined }
  let refreshToken = 0

  function applyFilters() {
    appliedFilters = {
      search: searchText || undefined,
      hasWebsite: noWebsiteOnly ? false : undefined,
      minRating: minRating ? Number(minRating) : undefined
    }
  }

  async function loadStats() {
    const res = await window.api.dbStats()
    if (res.success) stats = res.stats
  }

  async function exportAll() {
    // Export pulls a large, unpaginated slice on demand — this is the one
    // place it's fine to ask for "everything", since it's a single
    // one-off action rather than something rendered live in the UI.
    const res = await window.api.dbListLeads({ ...appliedFilters, limit: 5000 })
    if (!res.success || !res.leads.length) return
    const mapped = res.leads.map((l) => ({
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

  function refreshAll() {
    loadStats()
    refreshToken += 1
  }

  onMount(loadStats)
</script>

<section class="card">
  <div class="header">
    <h2>
      Leads Database <span class="muted">— every lead ever scraped, across every search</span>
    </h2>
  </div>

  <p class="disclaimer-note">
    "Last seen" reflects the most recent time a search picked this lead up — not a live check, so a
    business shown here could have closed, moved, or changed since then. Stored contact details are
    for your own outreach only; keep them, use them, and eventually delete them in line with the
    data protection rules that apply to you.
  </p>

  <DbStatsBar {stats} />

  <DbFilterBar
    bind:searchText
    bind:noWebsiteOnly
    bind:minRating
    bind:viewMode
    onApply={() => {
      applyFilters()
      refreshAll()
    }}
    onExport={exportAll}
  />

  {#if viewMode === 'pipeline'}
    <PipelineBoard filters={appliedFilters} {refreshToken} onLeadMoved={loadStats} />
  {:else}
    <DbTableView filters={appliedFilters} {refreshToken} onStatusChanged={loadStats} />
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

  .disclaimer-note {
    margin: 0 0 14px;
    max-width: 760px;
  }
</style>
