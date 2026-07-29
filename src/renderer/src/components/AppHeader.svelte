<script>
  import logo from '../assets/dopmin-logo.png'
</script>

<header class="topbar">
  <div class="brand">
    <img class="brand-mark" src={logo} alt="Dopmin logo" />
    <div>
      <div class="brand-name">Dopmin Web Scraper</div>
      <div class="brand-sub">Local lead extraction, without the noise</div>
    </div>
  </div>
  <div class="topbar-right">
    <span class="workspace-pill">Workspace: Alpha</span>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }

  .brand-name {
    font-weight: 800;
    font-size: 1.15rem;
    color: #0f172a;
  }

  .brand-sub {
    font-size: 0.8rem;
    color: #64748b;
  }

  .workspace-pill {
    background: #eef2ff;
    color: #4338ca;
    border: 1px solid #e0e7ff;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
</style>
