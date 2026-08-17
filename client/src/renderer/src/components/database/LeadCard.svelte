<script>
  import { formatRating } from '../../lib/format'

  export let lead
  export let dragging = false

  // Native HTML5 drag-and-drop — no extra dependency, works the same way
  // across every column. The parent PipelineBoard owns the actual move.
  function onDragStart(e) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id)
    dragging = true
  }
  function onDragEnd() {
    dragging = false
  }
</script>

<div
  class="lead-card"
  class:dragging
  draggable="true"
  role="listitem"
  aria-roledescription="Draggable lead card"
  on:dragstart={onDragStart}
  on:dragend={onDragEnd}
>
  <div class="card-top">
    <span class="lead-name">{lead.name}</span>
    {#if lead.has_website}
      <span class="badge badge-ok" title="Has a website">●</span>
    {:else}
      <span class="badge badge-warn" title="No website">●</span>
    {/if}
  </div>
  <div class="lead-meta">
    <span>{lead.category || 'Uncategorized'}</span>
    <span class="dot">·</span>
    <span>{formatRating(lead.rating)}★</span>
  </div>
  {#if lead.phone}
    <div class="lead-phone">{lead.phone}</div>
  {/if}
  <div class="lead-footer">
    <span title="Times seen across searches">Seen ×{lead.times_seen}</span>
    <span>{new Date(lead.last_seen_at).toLocaleDateString()}</span>
  </div>
</div>

<style>
  .lead-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 11px;
    cursor: grab;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .lead-card:hover {
    border-color: var(--text-3);
  }

  .lead-card.dragging {
    opacity: 0.4;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
  }

  .lead-name {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-1);
    line-height: 1.3;
  }

  .badge {
    flex-shrink: 0;
    font-size: 0.6rem;
    line-height: 1;
    margin-top: 3px;
  }

  .badge-ok {
    color: var(--green);
  }

  .badge-warn {
    color: var(--yellow);
  }

  .lead-meta {
    font-size: 0.72rem;
    color: var(--text-3);
    display: flex;
    gap: 5px;
  }

  .dot {
    color: var(--border);
  }

  .lead-phone {
    font-size: 0.74rem;
    color: var(--text-2);
  }

  .lead-footer {
    display: flex;
    justify-content: space-between;
    font-size: 0.66rem;
    color: var(--text-3);
    margin-top: 2px;
  }
</style>
