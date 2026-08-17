<script>
  export let searchText = ''
  export let noWebsiteOnly = false
  export let minRating = ''
  export let viewMode = 'pipeline'
  export let onApply = () => {}
  export let onExport = () => {}
</script>

<div class="filter-bar">
  <div class="filters">
    <input
      type="text"
      placeholder="Search name, category, address…"
      bind:value={searchText}
      on:keydown={(e) => e.key === 'Enter' && onApply()}
    />
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={noWebsiteOnly} on:change={onApply} />
      No website only
    </label>
    <input
      type="number"
      placeholder="Min rating"
      step="0.1"
      min="0"
      max="5"
      bind:value={minRating}
      on:keydown={(e) => e.key === 'Enter' && onApply()}
    />
    <button class="secondary-btn" on:click={onApply}>Apply filters</button>
  </div>

  <div class="view-controls">
    <div class="view-toggle">
      <button class:active={viewMode === 'pipeline'} on:click={() => (viewMode = 'pipeline')}>
        Pipeline
      </button>
      <button class:active={viewMode === 'table'} on:click={() => (viewMode = 'table')}>
        Table
      </button>
    </div>
    <button class="secondary-btn" on:click={onExport}>Export all as CSV</button>
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 14px;
  }

  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .filters input {
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }

  .filters input[type='text'] {
    min-width: 200px;
  }

  .filters input[type='number'] {
    width: 100px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    color: var(--text-2);
  }

  .view-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .view-toggle button {
    border: none;
    background: var(--surface);
    color: var(--text-2);
    padding: 7px 14px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .view-toggle button.active {
    background: var(--brand);
    color: #fff;
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
    white-space: nowrap;
  }

  .secondary-btn:hover {
    background: var(--surface-soft);
  }
</style>
