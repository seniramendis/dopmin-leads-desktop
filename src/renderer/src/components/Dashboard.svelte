<script>
  import { onMount } from 'svelte'
  import KpiCard from './dashboard/KpiCard.svelte'
  import DonutChart from './dashboard/DonutChart.svelte'
  import BarChart from './dashboard/BarChart.svelte'
  import TrendChart from './dashboard/TrendChart.svelte'

  let stats = null
  let loading = true
  let errorMessage = ''

  const STATUS_COLORS = {
    new: 'var(--text-3)',
    contacted: 'var(--yellow)',
    replied: 'var(--brand)',
    won: 'var(--green)',
    dead: 'var(--red)'
  }

  async function load() {
    loading = true
    errorMessage = ''
    try {
      const res = await window.api.dbDashboard()
      if (res.success) {
        stats = res.stats
      } else {
        errorMessage = res.error || 'Could not load dashboard data.'
      }
    } catch (err) {
      errorMessage = err.message || 'Could not load dashboard data.'
    } finally {
      loading = false
    }
  }

  onMount(load)

  $: total = stats?.total ?? 0
  $: noWebsite = stats?.noWebsite ?? 0
  $: noWebsitePct = total ? Math.round((noWebsite / total) * 100) : 0
  $: avgRating = stats?.avgRating != null ? stats.avgRating.toFixed(1) : '—'
  $: wonCount = stats?.byStatus?.find((s) => s.status === 'won')?.n ?? 0
  $: winRate = total ? Math.round((wonCount / total) * 100) : 0
  $: activePipeline =
    (stats?.byStatus?.find((s) => s.status === 'contacted')?.n ?? 0) +
    (stats?.byStatus?.find((s) => s.status === 'replied')?.n ?? 0)

  $: pipelineBars = (stats?.byStatus ?? []).map((s) => ({
    label: s.status,
    value: s.n,
    color: STATUS_COLORS[s.status] || 'var(--brand)'
  }))

  $: categoryBars = (stats?.byCategory ?? []).map((c) => ({
    label: c.category,
    value: c.n,
    color: 'var(--brand)'
  }))

  $: ratingBars = (stats?.byRating ?? []).map((r) => ({
    label: r.bucket,
    value: r.n,
    color: 'var(--green)'
  }))

  $: websiteSlices = [
    { label: 'Has website', value: total - noWebsite, color: 'var(--green)' },
    { label: 'No website', value: noWebsite, color: 'var(--brand)' }
  ]

  $: last7Sparkline = (stats?.trend ?? []).slice(-7).map((p) => p.n)
</script>

<section class="dashboard">
  {#if loading}
    <div class="card loading-card">Loading dashboard…</div>
  {:else if errorMessage}
    <div class="card error-card">{errorMessage}</div>
  {:else if total === 0}
    <div class="card empty-card">
      <h2>No leads yet</h2>
      <p>Run a search to start building your dashboard — KPIs and charts fill in automatically.</p>
    </div>
  {:else}
    <div class="kpi-grid">
      <KpiCard
        icon="users"
        accent="brand"
        label="Total leads"
        value={total}
        note="Across every search"
      />
      <KpiCard
        icon="globe"
        accent="brand"
        label="No website"
        value="{noWebsitePct}%"
        note="{noWebsite} of {total} leads — the core opportunity"
      />
      <KpiCard
        icon="star"
        accent="yellow"
        label="Avg. rating"
        value={avgRating}
        note="Across all rated leads"
      />
      <KpiCard
        icon="trophy"
        accent="green"
        label="Win rate"
        value="{winRate}%"
        note="{wonCount} won of {total} leads"
      />
      <KpiCard
        icon="clock"
        accent="brand"
        label="Active pipeline"
        value={activePipeline}
        note="Contacted + replied"
      />
      <KpiCard
        icon="chart"
        accent="green"
        label="New this week"
        value={stats.newLast7Days}
        note="{stats.recentChanges} status changes in 7 days"
        sparkline={last7Sparkline}
      />
    </div>

    <div class="charts-grid">
      <div class="card chart-card">
        <h3>Pipeline by stage</h3>
        <BarChart bars={pipelineBars} />
      </div>

      <div class="card chart-card">
        <h3>Website coverage</h3>
        <DonutChart
          slices={websiteSlices}
          centerValue="{noWebsitePct}%"
          centerLabel="no website"
        />
      </div>

      <div class="card chart-card">
        <h3>Top categories</h3>
        <BarChart bars={categoryBars} emptyMessage="No categorized leads yet." />
      </div>

      <div class="card chart-card">
        <h3>Rating distribution</h3>
        <BarChart bars={ratingBars} />
      </div>

      <div class="card chart-card wide">
        <h3>Leads added — last 14 days</h3>
        <TrendChart points={stats.trend} />
      </div>
    </div>
  {/if}
</section>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 18px 20px;
    box-shadow: var(--shadow-sm);
  }

  .loading-card,
  .error-card {
    color: var(--text-3);
    font-size: 0.88rem;
  }

  .error-card {
    color: var(--red-dark);
    background: var(--red-soft);
    border-color: var(--red);
  }

  .empty-card h2 {
    margin: 0 0 6px;
    font-size: 1.05rem;
    color: var(--text-1);
  }

  .empty-card p {
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-3);
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .chart-card.wide {
    grid-column: 1 / -1;
  }

  .chart-card h3 {
    margin: 0 0 14px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-1);
  }

  @media (max-width: 1000px) {
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 820px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 600px) {
    .kpi-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
