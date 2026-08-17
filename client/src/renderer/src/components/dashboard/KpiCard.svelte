<script>
  export let label = ''
  export let value = '—'
  export let note = ''
  export let accent = 'brand' // 'brand' | 'green' | 'yellow' | 'red'
  export let icon = 'chart' // key into ICONS below
  export let sparkline = null // optional array of numbers → tiny inline trend

  const SPARK_W = 64
  const SPARK_H = 22
  $: sparkPoints = (() => {
    if (!sparkline || sparkline.length < 2) return ''
    const max = Math.max(1, ...sparkline)
    const stepX = SPARK_W / (sparkline.length - 1)
    return sparkline
      .map((v, i) => `${i * stepX},${SPARK_H - (v / max) * (SPARK_H - 4) - 2}`)
      .join(' ')
  })()
</script>

<div class="kpi-card accent-{accent}">
  <div class="kpi-icon">
    {#if icon === 'users'}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M16 14a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 1a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 8 15Zm0 2c-2.67 0-8 1.34-8 4v2h10.5v-2c0-.98.35-2.53 2.03-3.7A13.36 13.36 0 0 0 8 17Zm8 0c-.29 0-.62.02-.97.05C16.63 18.19 17 19.6 17 21v2h7v-2c0-2.66-5.33-4-8-4Z"
          fill="currentColor"
        /></svg
      >
    {:else if icon === 'globe'}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.93 9h-3.05a15.4 15.4 0 0 0-1.13-5.4A8 8 0 0 1 18.93 11ZM12 4c.83 0 2.19 2 2.85 5h-5.7C9.81 6 11.17 4 12 4ZM4.07 11a8 8 0 0 1 5.18-6.4A15.4 15.4 0 0 0 8.12 11Zm0 2h3.05a15.4 15.4 0 0 0 1.13 5.4A8 8 0 0 1 4.07 13ZM12 20c-.83 0-2.19-2-2.85-5h5.7c-.66 3-2.02 5-2.85 5Zm3.8-1.4A15.4 15.4 0 0 0 16.93 13h3.05a8 8 0 0 1-5.18 5.6Z"
          fill="currentColor"
        /></svg
      >
    {:else if icon === 'star'}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="m12 17.27 5.18 3.13-1.37-5.9L20.5 10.3l-6.02-.52L12 4.2 9.52 9.78l-6.02.52 4.69 4.2-1.37 5.9L12 17.27Z"
          fill="currentColor"
        /></svg
      >
    {:else if icon === 'trophy'}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M18 3H6v2H2v3a4 4 0 0 0 4 4 5 5 0 0 0 3.9 3.86V18H8v2h8v-2h-1.9v-2.14A5 5 0 0 0 18 12a4 4 0 0 0 4-4V5h-4V3ZM4 8V7h2v3.83A2 2 0 0 1 4 8Zm16 0a2 2 0 0 1-2 2.83V7h2v1Z"
          fill="currentColor"
        /></svg
      >
    {:else if icon === 'clock'}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 10.41 4.24 4.24-1.41 1.41L11 13V6h2Z"
          fill="currentColor"
        /></svg
      >
    {:else}
      <svg viewBox="0 0 24 24" fill="none"
        ><path
          d="M4 19h16v2H4v-2ZM6 10h3v7H6v-7Zm5-6h3v13h-3V4Zm5 9h3v4h-3v-4Z"
          fill="currentColor"
        /></svg
      >
    {/if}
  </div>
  <div class="kpi-body">
    <div class="kpi-label">{label}</div>
    <div class="kpi-value-row">
      <div class="kpi-value">{value}</div>
      {#if sparkPoints}
        <svg
          class="sparkline"
          viewBox="0 0 {SPARK_W} {SPARK_H}"
          preserveAspectRatio="none"
        >
          <polyline points={sparkPoints} fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      {/if}
    </div>
    {#if note}<div class="kpi-note">{note}</div>{/if}
  </div>
</div>

<style>
  .kpi-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px 18px;
    box-shadow: var(--shadow-sm);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .kpi-icon {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  .kpi-icon svg {
    width: 20px;
    height: 20px;
  }

  .accent-green .kpi-icon {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .accent-yellow .kpi-icon {
    background: var(--yellow-soft);
    color: var(--yellow-dark);
  }

  .accent-red .kpi-icon {
    background: var(--red-soft);
    color: var(--red-dark);
  }

  .kpi-body {
    min-width: 0;
  }

  .kpi-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-3);
  }

  .kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-1);
    letter-spacing: -0.01em;
    margin-top: 3px;
    line-height: 1.15;
  }

  .kpi-value-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .sparkline {
    width: 52px;
    height: 18px;
    color: var(--brand);
    opacity: 0.7;
    flex-shrink: 0;
    margin-bottom: 2px;
  }

  .accent-green .sparkline {
    color: var(--green);
  }

  .accent-yellow .sparkline {
    color: var(--yellow-dark);
  }

  .kpi-note {
    font-size: 0.76rem;
    color: var(--text-3);
    margin-top: 3px;
  }
</style>
