<script>
  import logo from '../assets/logo_transparent_icon.png'
</script>

<aside class="sidebar">
  <div class="sidebar-brand">
    <img class="brand-mark" src={logo} alt="Dopmin" />
    <div class="brand-text">
      <div class="brand-name">Dopmin</div>
      <div class="brand-product">Lead Extraction</div>
    </div>
  </div>

  <nav class="nav">
    <div class="nav-section-label">Workspace</div>
    <ul>
      <li>
        <span class="nav-item active">
          <span class="nav-dot"></span>
          Lead Search
        </span>
      </li>
      <li>
        <span class="nav-item disabled">
          Saved Searches
          <span class="nav-soon">Soon</span>
        </span>
      </li>
      <li>
        <span class="nav-item disabled">
          Reports
          <span class="nav-soon">Soon</span>
        </span>
      </li>
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
    gap: 10px;
    padding: 4px 6px 20px;
    border-bottom: 1px solid var(--border-soft);
    margin-bottom: 16px;
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    object-fit: contain;
    flex-shrink: 0;
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
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text-2);
  }

  .nav-item.active {
    background: var(--surface-soft);
    color: var(--text-1);
  }

  .nav-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand);
    flex-shrink: 0;
  }

  .nav-item.disabled {
    color: var(--text-3);
    cursor: default;
    justify-content: space-between;
  }

  .nav-soon {
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
    background: var(--surface-soft);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 999px;
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
    background: var(--text-1);
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
</style>
