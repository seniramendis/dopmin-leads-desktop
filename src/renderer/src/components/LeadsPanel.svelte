<script>
  import { stars, summarizeLead } from '../lib/format'

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
            <td class="stars-cell" class:risk={variant === 'red'}>{stars(lead.rating)}</td>
            <td>{lead.reviewCount}</td>
            <td>
              <button class="icon-btn" on:click={() => copyLead(lead)} title="Copy details"
                >⧉</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 18px;
    border: 1px solid #e2e8f0;
    border-top: 3px solid #cbd5e1;
  }

  .panel-green {
    border-top-color: #22c55e;
  }

  .panel-red {
    border-top-color: #ef4444;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .panel-tag {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748b;
    background: #f1f5f9;
    padding: 3px 8px;
    border-radius: 999px;
  }

  .empty-note {
    color: #94a3b8;
    font-size: 0.85rem;
    margin: 8px 0 4px;
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

  .stars-cell {
    color: #16a34a;
    letter-spacing: 1px;
  }

  .stars-cell.risk {
    color: #dc2626;
  }

  .icon-btn {
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
    color: #475569;
  }
</style>
