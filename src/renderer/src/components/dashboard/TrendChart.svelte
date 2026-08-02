<script>
  // points: [{ day: 'YYYY-MM-DD', n: number }]
  export let points = []

  const W = 560
  const H = 140
  const PAD = 8

  $: max = Math.max(1, ...points.map((p) => p.n))
  $: stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0
  $: coords = points.map((p, i) => {
    const x = PAD + i * stepX
    const y = H - PAD - (p.n / max) * (H - PAD * 2)
    return { x, y, ...p }
  })
  $: linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  $: areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x} ${H - PAD} L ${coords[0].x} ${H - PAD} Z`
    : ''

  function dayLabel(day) {
    const d = new Date(`${day}T00:00:00`)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  $: hasData = points.some((p) => p.n > 0)
</script>

<div class="trend-chart">
  {#if !hasData}
    <p class="empty">No leads scraped in the last 14 days yet.</p>
  {:else}
    <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="trend-svg">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" stroke="none" />
      <path d={linePath} fill="none" stroke="var(--brand)" stroke-width="2.5" />
      {#each coords as c (c.day)}
        <circle cx={c.x} cy={c.y} r="3" fill="var(--surface)" stroke="var(--brand)" stroke-width="2">
          <title>{dayLabel(c.day)}: {c.n} lead{c.n === 1 ? '' : 's'}</title>
        </circle>
      {/each}
    </svg>
    <div class="axis">
      <span>{dayLabel(points[0].day)}</span>
      <span>{dayLabel(points[points.length - 1].day)}</span>
    </div>
  {/if}
</div>

<style>
  .trend-chart {
    width: 100%;
  }

  .trend-svg {
    width: 100%;
    height: 140px;
    display: block;
  }

  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--text-3);
    margin-top: 4px;
  }

  .empty {
    font-size: 0.82rem;
    color: var(--text-3);
    padding: 8px 0;
  }
</style>
