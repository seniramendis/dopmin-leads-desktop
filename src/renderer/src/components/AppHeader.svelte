<script>
  export let onOpenSettings = () => {}
</script>

<header class="topbar">
  <div class="topbar-title">
    <h1>Lead Search</h1>
    <p>Extract and qualify local business leads from Google Maps</p>
  </div>
  <div class="topbar-right">
    <span class="status-pill">
      <span class="status-dot"></span>
      Local session
    </span>
    <button class="settings-btn" on:click={onOpenSettings} title="API keys & settings">
      Settings
    </button>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 4px;
  }

  .topbar-title h1 {
    margin: 0 0 4px;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text-1);
  }

  .topbar-title p {
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-3);
  }

  .topbar-right {
    padding-top: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .settings-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    background: var(--surface);
    color: var(--text-1);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  .settings-btn:hover {
    background: var(--surface-soft);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    color: var(--text-2);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 600;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    flex-shrink: 0;
  }
</style>
