<script>
  let query = ''
  let leads = []
  let loading = false
  let activeNav = 'Dashboard'

  // Seed data so the dashboard reads naturally before a real scrape has run.
  const seedHighValue = [
    { name: 'Kingsley Electricals', rating: 4.5, reviews: 42 },
    { name: 'Elite Power Solutions', rating: 4.0, reviews: 28 },
    { name: 'Kandy Spark Tech', rating: 5.0, reviews: 104 }
  ]
  const seedReputation = [
    { name: 'Generic Wiring Co.', rating: 2.0, reviews: 5 },
    { name: 'Quick Fix Lanka', rating: 1.0, reviews: 2 },
    { name: 'Standard Fuse Experts', rating: 3.0, reviews: 12 }
  ]

  // Svelte's reactive declarations automatically sort the data instantly
  $: noWebsiteLeads = leads.filter((lead) => !lead.hasWebsite)
  $: greatReviews = noWebsiteLeads.filter((lead) => lead.rating >= 4.5)
  $: badReviews = noWebsiteLeads.filter((lead) => lead.rating > 0 && lead.rating <= 3.5)

  $: highValueRows = greatReviews.length
    ? greatReviews.map((l) => ({ name: l.name, rating: l.rating, reviews: l.reviewCount || 0 }))
    : seedHighValue
  $: reputationRows = badReviews.length
    ? badReviews.map((l) => ({ name: l.name, rating: l.rating, reviews: l.reviewCount || 0 }))
    : seedReputation

  $: totalScraped = leads.length || 1284
  $: hotLeadsCount = greatReviews.length || 142
  $: reputationCount = badReviews.length || 89

  const barHeights = [52, 30, 64, 44, 74, 88, 46, 70, 58, 78]

  async function handleScrape() {
    if (!query) return
    loading = true

    try {
      leads = await window.api.scrapeLeads(query)
    } catch (error) {
      console.error('Scraping failed:', error)
    } finally {
      loading = false
    }
  }

  function starString(rating) {
    const full = Math.round(rating)
    return '★★★★★'.slice(0, full).padEnd(5, '☆')
  }
</script>

<div class="shell">
  <!-- Top bar -->
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">D</span>
      <span class="brand-name">Dopmin Scraper</span>
    </div>

    <nav class="topnav">
      {#each ['Dashboard', 'Extractions', 'Lead List'] as item}
        <button
          class="topnav-item"
          class:active={activeNav === item}
          on:click={() => (activeNav = item)}
        >
          {item}
        </button>
      {/each}
    </nav>

    <div class="topbar-actions">
      <span class="workspace-pill">Workspace: Alpha</span>
      <button class="icon-btn" aria-label="Notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>
      <button class="icon-btn" aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
          />
        </svg>
      </button>
      <div class="avatar">A</div>
    </div>
  </header>

  <div class="body">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="command-card">
        <div class="rocket">🚀</div>
        <div>
          <div class="command-title">Command Center</div>
          <div class="command-sub">v2.4.0 Active</div>
        </div>
      </div>

      <nav class="side-nav">
        <button class="side-item" class:active={activeNav === 'Dashboard'} on:click={() => (activeNav = 'Dashboard')}>
          <span class="side-ico">▦</span> Dashboard
        </button>
        <button class="side-item" class:active={activeNav === 'Extractions'} on:click={() => (activeNav = 'Extractions')}>
          <span class="side-ico">⚡</span> Extractions
        </button>
        <button class="side-item" class:active={activeNav === 'Lead List'} on:click={() => (activeNav = 'Lead List')}>
          <span class="side-ico">☰</span> Lead List
        </button>
        <button class="side-item" class:active={activeNav === 'Settings'} on:click={() => (activeNav = 'Settings')}>
          <span class="side-ico">⚙</span> Settings
        </button>
        <button class="side-item" class:active={activeNav === 'Help'} on:click={() => (activeNav = 'Help')}>
          <span class="side-ico">?</span> Help
        </button>
      </nav>

      <div class="sidebar-bottom">
        <button class="new-scrape-btn" on:click={() => document.getElementById('query-input')?.focus()}>
          New Scrape
        </button>
        <button class="logout-btn">⇥ Log Out</button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="content">
      <section class="hero">
        <h1>Extraction Engine</h1>
        <p>
          Deploy deep-search scrapers across Google Maps, LinkedIn, and Yelp to harvest
          high-intent business leads in seconds.
        </p>

        <div class="search-row">
          <div class="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              id="query-input"
              type="text"
              bind:value={query}
              placeholder="e.g., Electricians in Kandy, Sri Lanka"
              on:keydown={(e) => e.key === 'Enter' && handleScrape()}
            />
          </div>
          <button class="launch-btn" on:click={handleScrape} disabled={loading}>
            {loading ? 'Extracting…' : 'Launch Extraction'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <section class="stats-row">
        <div class="stat-card">
          <div class="stat-text">
            <span class="stat-label">Total Scraped</span>
            <span class="stat-value">{totalScraped.toLocaleString()}</span>
            <span class="stat-trend up">↗ +12% this week</span>
          </div>
          <div class="stat-icon neutral">🗂</div>
        </div>
        <div class="stat-card">
          <div class="stat-text">
            <span class="stat-label green-text">Hot Leads</span>
            <span class="stat-value">{hotLeadsCount}</span>
            <span class="stat-sub">No Website + High Rating</span>
          </div>
          <div class="stat-icon green">🔥</div>
        </div>
        <div class="stat-card">
          <div class="stat-text">
            <span class="stat-label brand-text">Reputation Targets</span>
            <span class="stat-value">{reputationCount}</span>
            <span class="stat-sub">No Website + Low Rating</span>
          </div>
          <div class="stat-icon brand">⚠</div>
        </div>
      </section>

      <section class="panels-row">
        <div class="panel panel-green">
          <div class="panel-head">
            <h2>✓ 🔥 High-Value Leads</h2>
            <button class="view-all">View All</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Star Rating</th>
                <th>Reviews</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each highValueRows as lead}
                <tr>
                  <td class="biz-name">{lead.name}</td>
                  <td class="stars green-text">{starString(lead.rating)}</td>
                  <td>{lead.reviews}</td>
                  <td>
                    <button class="row-action" aria-label="Copy">⧉</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="panel panel-brand">
          <div class="panel-head">
            <h2>⚠ Reputation Rescue</h2>
            <button class="view-all">View All</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Business Name</th>
                <th>Star Rating</th>
                <th>Reviews</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each reputationRows as lead}
                <tr>
                  <td class="biz-name">{lead.name}</td>
                  <td class="stars yellow-text">{starString(lead.rating)}</td>
                  <td>{lead.reviews}</td>
                  <td>
                    <button class="row-action brand-action" aria-label="Send">➤</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="bottom-row">
        <div class="chart-card">
          <div class="chart-head">
            <div>
              <h2>Scrape Intensity</h2>
              <p>Live feed monitoring system performance</p>
            </div>
            <span class="live-pill"><span class="dot"></span> Real-time</span>
          </div>
          <div class="bars">
            {#each barHeights as h, i}
              <div
                class="bar"
                class:accent={i === 5}
                style="height: {h}%"
              ></div>
            {/each}
          </div>
        </div>

        <div class="task-card">
          <div class="task-label">Active Task</div>
          <div class="task-title">
            <span class="task-flag"></span>
            Kandy_Electricians_Full.csv
          </div>
          <div class="task-status">Status: Indexing Layers…</div>

          <div class="progress-head">
            <span>Progress</span>
            <span class="progress-pct">74%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: 74%"></div>
          </div>

          <div class="task-note">
            "Found 12 candidates with no web presence and rating &lt; 3.0 in the last 4 minutes."
          </div>
        </div>
      </section>
    </main>
  </div>
</div>

<style>
  :global(#app) {
    display: block;
  }

  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  /* ---------- Top bar ---------- */
  .topbar {
    height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.01em;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: var(--brand);
    color: #fff;
    font-size: 14px;
    font-weight: 800;
  }

  .topnav {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .topnav-item {
    border: none;
    background: transparent;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-2);
    cursor: pointer;
  }

  .topnav-item:hover {
    color: var(--text-1);
  }

  .topnav-item.active {
    color: var(--brand-dark);
    background: var(--brand-soft);
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .workspace-pill {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--surface-soft);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 999px;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-soft);
    color: var(--text-2);
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .avatar {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--text-1);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 700;
  }

  /* ---------- Layout ---------- */
  .body {
    flex: 1;
    display: flex;
    align-items: stretch;
    min-height: 0;
  }

  .sidebar {
    width: 232px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .command-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--green-soft);
    border: 1px solid #cfe9da;
  }

  .rocket {
    font-size: 18px;
  }

  .command-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--green-dark);
  }

  .command-sub {
    font-size: 11px;
    color: var(--text-2);
  }

  .side-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .side-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .side-ico {
    width: 18px;
    display: inline-block;
    text-align: center;
    color: var(--text-3);
  }

  .side-item:hover {
    background: var(--surface-soft);
    color: var(--text-1);
  }

  .side-item.active {
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  .side-item.active .side-ico {
    color: var(--brand-dark);
  }

  .sidebar-bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .new-scrape-btn {
    border: none;
    background: var(--brand);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    padding: 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .new-scrape-btn:hover {
    background: var(--brand-dark);
  }

  .logout-btn {
    border: none;
    background: transparent;
    color: var(--text-3);
    font-size: 13px;
    font-weight: 600;
    padding: 6px;
    cursor: pointer;
    text-align: left;
  }

  .logout-btn:hover {
    color: var(--brand-dark);
  }

  /* ---------- Content ---------- */
  .content {
    flex: 1;
    padding: 28px 32px 40px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .hero {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 32px;
    box-shadow: var(--shadow-sm);
  }

  .hero h1 {
    font-size: 32px;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }

  .hero p {
    color: var(--text-2);
    max-width: 640px;
    margin-bottom: 22px;
    font-size: 15px;
  }

  .search-row {
    display: flex;
    gap: 12px;
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 16px;
    color: var(--text-3);
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    padding: 14px 0;
    font-size: 14px;
    color: var(--text-1);
    outline: none;
  }

  .launch-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: var(--brand);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    padding: 0 22px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .launch-btn:hover {
    background: var(--brand-dark);
  }

  .launch-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* ---------- Stats ---------- */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    box-shadow: var(--shadow-sm);
  }

  .stat-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stat-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
  }

  .stat-value {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .stat-trend.up {
    color: var(--green);
    font-size: 12px;
    font-weight: 600;
  }

  .stat-sub {
    color: var(--text-3);
    font-size: 12px;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 17px;
    background: var(--surface-soft);
  }

  .stat-icon.green {
    background: var(--green-soft);
  }

  .stat-icon.brand {
    background: var(--brand-soft);
  }

  .green-text {
    color: var(--green-dark);
  }

  .brand-text {
    color: var(--brand-dark);
  }

  .yellow-text {
    color: var(--yellow-dark);
  }

  /* ---------- Panels ---------- */
  .panels-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top: 3px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .panel-green {
    border-top-color: var(--green);
  }

  .panel-brand {
    border-top-color: var(--brand);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-soft);
  }

  .panel-head h2 {
    font-size: 15px;
    font-weight: 700;
  }

  .view-all {
    border: none;
    background: transparent;
    color: var(--text-3);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .view-all:hover {
    color: var(--brand-dark);
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
    padding: 10px 20px;
    background: var(--surface-soft);
  }

  tbody td {
    padding: 14px 20px;
    font-size: 13px;
    border-top: 1px solid var(--border-soft);
    color: var(--text-2);
  }

  .biz-name {
    font-weight: 700;
    color: var(--text-1);
  }

  .stars {
    letter-spacing: 2px;
    font-weight: 700;
  }

  .row-action {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-soft);
    color: var(--text-2);
    cursor: pointer;
  }

  .row-action:hover {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .brand-action:hover {
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  /* ---------- Bottom row ---------- */
  .bottom-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 18px;
  }

  .chart-card,
  .task-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px;
    box-shadow: var(--shadow-sm);
  }

  .chart-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .chart-head h2 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .chart-head p {
    font-size: 12px;
    color: var(--text-3);
  }

  .live-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--green-dark);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--green);
  }

  .bars {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    height: 150px;
  }

  .bar {
    flex: 1;
    background: var(--yellow-soft);
    border-radius: 6px 6px 0 0;
    min-height: 6px;
  }

  .bar.accent {
    background: var(--yellow);
  }

  .task-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
    margin-bottom: 12px;
  }

  .task-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 14px;
    margin-bottom: 6px;
  }

  .task-flag {
    width: 4px;
    height: 16px;
    border-radius: 2px;
    background: var(--brand);
  }

  .task-status {
    font-size: 12px;
    color: var(--text-3);
    font-family: ui-monospace, Menlo, monospace;
    margin-bottom: 18px;
  }

  .progress-head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-2);
    margin-bottom: 6px;
  }

  .progress-pct {
    font-weight: 700;
    color: var(--text-1);
  }

  .progress-track {
    height: 8px;
    border-radius: 999px;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    overflow: hidden;
    margin-bottom: 18px;
  }

  .progress-fill {
    height: 100%;
    background: var(--yellow);
    border-radius: 999px;
  }

  .task-note {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 12px;
    font-style: italic;
    color: var(--text-2);
  }

  @media (max-width: 1080px) {
    .panels-row,
    .bottom-row,
    .stats-row {
      grid-template-columns: 1fr;
    }
  }
</style>
