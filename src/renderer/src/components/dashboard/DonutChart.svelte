<script>
  // slices: [{ label, value, color }]
  export let slices = []
  export let centerLabel = ''
  export let centerValue = ''

  const SIZE = 140
  const STROKE = 20
  const R = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * R

  $: total = slices.reduce((sum, s) => sum + s.value, 0) || 1
  $: segments = (() => {
    let offset = 0
    return slices.map((s) => {
      const frac = s.value / total
      const seg = { ...s, frac, dash: frac * C, offset }
      offset += frac * C
      return seg
    })
  })()
</script>

<div class="donut-wrap">
  <svg viewBox="0 0 {SIZE} {SIZE}" class="donut">
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={R}
      fill="none"
      stroke="var(--border-soft)"
      stroke-width={STROKE}
    />
    {#each segments as seg (seg.label)}
      {#if seg.frac > 0}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={seg.color}
          stroke-width={STROKE}
          stroke-dasharray="{seg.dash} {C - seg.dash}"
          stroke-dashoffset={-seg.offset}
          transform="rotate(-90 {SIZE / 2} {SIZE / 2})"
          stroke-linecap="butt"
        >
          <title>{seg.label}: {seg.value} ({Math.round(seg.frac * 100)}%)</title>
        </circle>
      {/if}
    {/each}
    <text x={SIZE / 2} y={SIZE / 2 - 4} text-anchor="middle" class="center-value"
      >{centerValue}</text
    >
    <text x={SIZE / 2} y={SIZE / 2 + 14} text-anchor="middle" class="center-label"
      >{centerLabel}</text
    >
  </svg>

  <ul class="legend">
    {#each slices as s (s.label)}
      <li>
        <span class="swatch" style="background:{s.color}"></span>
        {s.label} <strong>{s.value}</strong>
      </li>
    {/each}
  </ul>
</div>

<style>
  .donut-wrap {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }

  .donut {
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }

  .donut circle {
    transition: stroke-dasharray 0.4s ease;
  }

  .center-value {
    font-size: 1.3rem;
    font-weight: 700;
    fill: var(--text-1);
  }

  .center-label {
    font-size: 0.55rem;
    fill: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.82rem;
    color: var(--text-2);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .legend strong {
    color: var(--text-1);
    margin-left: 2px;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }
</style>
