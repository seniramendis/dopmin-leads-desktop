<script>
  import { formatRating, summarizeLead } from '../lib/format'

  export let title
  export let tag
  export let variant // 'green' | 'red'
  export let leads
  export let emptyMessage

  function copyLead(lead) {
    navigator.clipboard?.writeText(summarizeLead(lead))
  }
</script>

<div class="panel panel-{variant}">
  <div class="panel-header">
    <h2>{title}</h2>
    <span class="panel-tag">{tag}</span>
  </div>
  {#if leads.length === 0}
    <p class="empty-note">{emptyMessage}</p>
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
        {#each leads.slice(0, 8) as lead (lead.id)}
          <tr>
            <td>{lead.name}</td>
            <td class="rating-cell" class:risk={variant === 'red'}>{formatRating(lead.rating)}</td
            >
            <td class="muted-cell">{lead.reviewCount}</td>
            <td class="action-cell">
              <button class="text-btn" on:click={() => copyLead(lead)}>Copy</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .panel {
    background: var(--surface);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    border: 1px solid var(--border);
    border-top: 3px solid var(--border);
  }

  .panel-green {
    border-top-color: var(--green);
  }

  .panel-red {
    border-top-color: var(--red);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .panel-tag {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    padding: 3px 9px;
    border-radius: 999px;
  }

  .empty-note {
    color: var(--text-3);
    font-size: 0.85rem;
    margin: 8px 0 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 6px;
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

  .muted-cell {
    color: var(--text-2);
  }

  .rating-cell {
    font-weight: 700;
    color: var(--green-dark);
  }

  .rating-cell.risk {
    color: var(--red-dark);
  }

  .action-cell {
    text-align: right;
  }

  .text-btn {
    border: none;
    background: none;
    padding: 4px 2px;
    cursor: pointer;
    color: var(--text-3);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .text-btn:hover {
    color: var(--brand);
  }
</style>
