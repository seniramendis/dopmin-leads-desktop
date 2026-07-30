<script>
  import PipelineColumn from './PipelineColumn.svelte'
  import { PIPELINE_STAGES } from '../../lib/constants'

  export let filters // { search, hasWebsite, minRating } — no status, board owns that split
  export let refreshToken = 0 // bump from parent to force every column to reload
  export let onLeadMoved = () => {} // called after a drag-drop actually changes a lead's stage

  let columnRefs = {}

  async function handleDropLead(leadId, fromStatus, toStatus) {
    if (toStatus === fromStatus) return
    const result = await window.api.dbSetStatus({ leadId, status: toStatus })
    if (!result?.success) return

    // Only the two affected columns need to refetch — not the whole board.
    columnRefs[toStatus]?.refresh()
    if (fromStatus && columnRefs[fromStatus]) {
      columnRefs[fromStatus].refresh()
    } else {
      // Card was dropped before we could tell which column it came from
      // (rare, e.g. it moved mid-drag) — safest fallback is a full refresh.
      Object.values(columnRefs).forEach((col) => col?.refresh())
    }
    onLeadMoved()
  }

  $: if (refreshToken >= 0) {
    Object.values(columnRefs).forEach((col) => col?.refresh())
  }
</script>

<div class="board">
  {#each PIPELINE_STAGES as stage (stage.status)}
    <PipelineColumn
      bind:this={columnRefs[stage.status]}
      {stage}
      {filters}
      onDropLead={handleDropLead}
    />
  {/each}
</div>

<p class="hint">Drag a card between columns to update its stage.</p>

<style>
  .board {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .hint {
    margin: 10px 2px 0;
    font-size: 0.74rem;
    color: var(--text-3);
  }
</style>
