<script>
  import LeadCard from './LeadCard.svelte'
  import { PIPELINE_PAGE_SIZE } from '../../lib/constants'

  export let stage // { status, label, accent }
  export let filters // shared search/website/rating filters (no status)
  export let onDropLead = () => {} // (leadId, fromStatus, toStatus) => void

  let leads = []
  let total = 0
  let limit = PIPELINE_PAGE_SIZE
  let loading = true
  let errorMessage = ''
  let dragOver = false

  async function load(reset = true) {
    loading = true
    errorMessage = ''
    if (reset) limit = PIPELINE_PAGE_SIZE
    const columnFilters = { ...filters, status: stage.status, limit }
    const [leadsRes, countRes] = await Promise.all([
      window.api.dbListLeads(columnFilters),
      window.api.dbCountLeads({ ...filters, status: stage.status })
    ])
    if (leadsRes.success) leads = leadsRes.leads
    else errorMessage = leadsRes.error || 'Could not load this stage.'
    if (countRes.success) total = countRes.count
    loading = false
  }

  function loadMore() {
    limit += PIPELINE_PAGE_SIZE
    load(false)
  }

  // Re-fetch this column whenever the shared filters change (new search
  // text, rating floor, etc.) or a lead is moved into/out of it.
  export function refresh() {
    load(true)
  }

  load(true)

  function handleDragOver(e) {
    e.preventDefault()
    dragOver = true
  }
  function handleDragLeave() {
    dragOver = false
  }
  function handleDrop(e) {
    e.preventDefault()
    dragOver = false
    const leadId = e.dataTransfer.getData('text/plain')
    if (!leadId) return
    const dragged = leads.find((l) => l.id === leadId)
    if (dragged && dragged.status !== stage.status) {
      onDropLead(leadId, dragged.status, stage.status)
    } else if (!dragged) {
      // Card came from a different column instance — still let the parent
      // resolve it (it knows every lead currently rendered anywhere).
      onDropLead(leadId, null, stage.status)
    }
  }
</script>

<div
  class="column"
  class:drag-over={dragOver}
  role="group"
  aria-label="{stage.label} stage"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <div class="column-header">
    <span class="stage-dot" style="background: {stage.accent}"></span>
    <h3>{stage.label}</h3>
    <span class="count">{total}</span>
  </div>

  <div class="column-body">
    {#if errorMessage}
      <p class="note error">{errorMessage}</p>
    {:else if loading}
      <p class="note">Loading…</p>
    {:else if leads.length === 0}
      <p class="note">No leads here.</p>
    {:else}
      {#each leads as lead (lead.id)}
        <LeadCard {lead} />
      {/each}
      {#if leads.length < total}
        <button class="load-more" on:click={loadMore}>
          Load {Math.min(PIPELINE_PAGE_SIZE, total - leads.length)} more
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .column {
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-md);
    min-width: 240px;
    max-width: 240px;
    display: flex;
    flex-direction: column;
    max-height: 560px;
  }

  .column.drag-over {
    border-color: var(--brand);
    background: var(--brand-soft);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--border-soft);
  }

  .stage-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .column-header h3 {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-1);
    flex: 1;
  }

  .count {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 1px 8px;
  }

  .column-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }

  .note {
    font-size: 0.78rem;
    color: var(--text-3);
    text-align: center;
    padding: 12px 4px;
    margin: 0;
  }

  .note.error {
    color: var(--red-dark);
  }

  .load-more {
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: none;
    padding: 7px;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-2);
    cursor: pointer;
  }

  .load-more:hover {
    background: var(--surface);
  }
</style>
