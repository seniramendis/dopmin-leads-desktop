<script>
  import logo from '../assets/logo_transparent_icon.png'

  export let view = 'search'
  export let onNavigate = () => {}

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { id: 'search', label: 'Lead Search', icon: 'search' },
    { id: 'database', label: 'Leads Database', icon: 'stack' },
    { id: 'profiler', label: 'AI Profiler', icon: 'spark' }
  ]
</script>

<aside class="sidebar">
  <div class="sidebar-brand">
    <div class="brand-mark">
      <img src={logo} alt="Dopmin" />
    </div>
    <div class="brand-text">
      <div class="brand-name">Dopmin</div>
      <div class="brand-product">Lead Extraction</div>
    </div>
  </div>

  <nav class="nav">
    <div class="nav-section-label">Workspace</div>
    <ul>
      {#each NAV_ITEMS as item (item.id)}
        <li>
          <button
            class="nav-item nav-button"
            class:active={view === item.id}
            on:click={() => onNavigate(item.id)}
          >
            <span class="nav-icon">
              {#if item.icon === 'grid'}
                <svg viewBox="0 0 24 24" fill="none"
                  ><path
                    d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  /></svg
                >
              {:else if item.icon === 'search'}
                <svg viewBox="0 0 24 24" fill="none"
                  ><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" /><path
                    d="m20 20-4-4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  /></svg
                >
              {:else if item.icon === 'stack'}
                <svg viewBox="0 0 24 24" fill="none"
                  ><path
                    d="m12 3 9 5-9 5-9-5 9-5Z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                  /><path
                    d="m3 12 9 5 9-5M3 16.5l9 5 9-5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  /></svg
                >
              {:else}
                <svg viewBox="0 0 24 24" fill="none"
                  ><path
                    d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  /></svg
                >
              {/if}
            </span>
            {item.label}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="sidebar-footer">
    <div class="workspace-card">
      <span class="workspace-avatar">A</span>
      <div>
        <div class="workspace-name">Workspace Alpha</div>
        <div class="workspace-plan">Desktop · Local</div>
      </div>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-w);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px 16px;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 4px 6px 20px;
    border-bottom: 1px solid var(--border-soft);
    margin-bottom: 16px;
  }

  .brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--brand-grad);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .brand-mark img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  .brand-name {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }

  .brand-product {
    font-size: 0.72rem;
    color: var(--text-3);
    margin-top: 1px;
  }

  .nav {
    flex: 1;
  }

  .nav-section-label {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-3);
    padding: 0 10px;
    margin-bottom: 8px;
  }

  .nav ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px 9px 13px;
    border-radius: var(--radius-sm);
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text-2);
  }

  .nav-icon {
    display: flex;
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    color: var(--text-3);
    transition: color 0.15s var(--ease);
  }

  .nav-icon svg {
    width: 100%;
    height: 100%;
  }

  .nav-item.active {
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  .nav-item.active .nav-icon {
    color: var(--brand);
  }

  .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--brand);
  }

  .nav-button {
    width: 100%;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }

  .nav-button:hover:not(.active) {
    background: var(--surface-soft);
    color: var(--text-1);
  }

  .sidebar-footer {
    padding-top: 14px;
    border-top: 1px solid var(--border-soft);
  }

  .workspace-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
  }

  .workspace-avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--brand-grad);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .workspace-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-1);
  }

  .workspace-plan {
    font-size: 0.7rem;
    color: var(--text-3);
    margin-top: 1px;
  }

  /* Below this width there's no room for a fixed 232px rail alongside
     content without clipping the data-dense views (tables, pipeline
     board) — collapse into a horizontal top bar instead so every window
     size stays usable rather than just visually shrinking in place. */
  @media (max-width: 760px) {
    .sidebar {
      position: static;
      width: 100%;
      flex-direction: row;
      align-items: center;
      padding: 10px 14px;
      border-right: none;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      gap: 16px;
    }

    .sidebar-brand {
      padding: 0;
      border-bottom: none;
      margin-bottom: 0;
      flex-shrink: 0;
    }

    .brand-text {
      display: none;
    }

    .nav {
      flex: none;
      display: flex;
    }

    .nav-section-label {
      display: none;
    }

    .nav ul {
      flex-direction: row;
      gap: 4px;
    }

    .nav-item {
      white-space: nowrap;
    }

    .nav-item.active::before {
      left: 20%;
      right: 20%;
      top: auto;
      bottom: 0;
      width: auto;
      height: 3px;
      border-radius: 3px 3px 0 0;
    }

    .sidebar-footer {
      display: none;
    }
  }
</style>
