<script>
  import { onMount, onDestroy } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'
  import KpiCard from './dashboard/KpiCard.svelte'
  import BarChart from './dashboard/BarChart.svelte'
  import DonutChart from './dashboard/DonutChart.svelte'

  export let url = ''
  export let leadName = ''
  export let showUrlInput = true
  export let autoRun = false

  const CIRC = 2 * Math.PI * 52

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'swot', label: 'SWOT' },
    { id: 'vulnerabilities', label: 'Opportunities' },
    { id: 'outreach', label: 'Outreach' }
  ]

  // idle | profiling | analyzing | done | error
  let phase = 'idle'
  let progressMessage = ''
  let scrapedData = null
  let analysis = null
  let analysisSource = ''
  let fromCache = false
  let reportMarkdown = '' // raw text — kept for the copy button and as last-resort display
  let parsedExtraSections = [] // sections from the AI report we couldn't map onto the dashboard
  let errorMsg = ''
  let usedFallback = false
  let activeTab = 'overview'
  let copied = false
  let unsubProfile
  let unsubAnalyze

  $: tabsToShow =
    usedFallback && parsedExtraSections.length
      ? [...TABS, { id: 'details', label: 'Full Report' }]
      : TABS
  $: busy = phase === 'profiling' || phase === 'analyzing'
  $: hasResult = Boolean(analysis || reportMarkdown)
  $: score = analysis ? clamp(analysis.digitalMaturityScore, 0, 100) : 0
  $: scoreColor = analysis ? getScoreColor(score) : 'var(--text-3)'
  $: scoreLabel = analysis ? getScoreLabel(score) : ''
  $: animScore.set(score)
  $: gaugeOffset = CIRC - (CIRC * $animScore) / 100
  $: facts = buildFacts(scrapedData)
  $: contactEmails = scrapedData?.contact?.emails || []
  $: contactPhones = scrapedData?.contact?.phones || []
  $: socialLinks = scrapedData?.contact?.social ? Object.entries(scrapedData.contact.social) : []
  $: competitors = scrapedData?.competitors || []
  $: vulnCount = analysis?.vulnerabilities?.length || 0
  $: swotCount = analysis
    ? (analysis.swot?.strengths?.length || 0) +
      (analysis.swot?.weaknesses?.length || 0) +
      (analysis.swot?.opportunities?.length || 0) +
      (analysis.swot?.threats?.length || 0)
    : 0
  $: hostChip = scrapedData?.hostname || getHostname(url)
  $: reportHtml = reportMarkdown ? renderMarkdown(reportMarkdown) : ''
  $: detailsHtml = parsedExtraSections.length
    ? renderMarkdown(
        parsedExtraSections.map((s) => `### ${s.title}\n${s.lines.join('\n')}`).join('\n\n')
      )
    : ''

  // --- visual derivations for the new dashboard-style overview ---
  const animScore = tweened(0, { duration: 900, easing: cubicOut })

  $: checksPassed = facts.filter((f) => f.ok).length
  $: checksTotal = facts.length
  $: checksDonutSlices =
    checksTotal > 0
      ? [
          { label: 'Passing', value: checksPassed, color: 'var(--green)' },
          { label: 'Needs work', value: checksTotal - checksPassed, color: 'var(--red)' }
        ]
      : []

  $: swotDonutSlices = analysis
    ? [
        { label: 'Strengths', value: analysis.swot?.strengths?.length || 0, color: 'var(--green)' },
        { label: 'Weaknesses', value: analysis.swot?.weaknesses?.length || 0, color: 'var(--red)' },
        {
          label: 'Opportunities',
          value: analysis.swot?.opportunities?.length || 0,
          color: 'var(--brand)'
        },
        { label: 'Threats', value: analysis.swot?.threats?.length || 0, color: 'var(--yellow)' }
      ]
    : []

  $: competitorBars = scrapedData
    ? [
        {
          label: hostChip || 'This business',
          value: clamp(scrapedData.score, 0, 100) || 1,
          color: 'var(--brand)'
        },
        ...competitors
          .filter((c) => c.success)
          .map((c) => ({
            label: getHostname(c.url) || c.url,
            value: clamp(c.score, 0, 100) || 1,
            color: 'var(--text-3)'
          }))
      ]
    : []

  $: serviceBars = (() => {
    const list = analysis?.vulnerabilities || []
    if (!list.length) return []
    const counts = new Map()
    for (const v of list) {
      const key = v.dopminService || 'Other'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, color: 'var(--brand)' }))
      .sort((a, b) => b.value - a.value)
  })()

  function kpiVisual(label) {
    const key = (label || '').toLowerCase()
    if (key.includes('speed') || key.includes('load') || key.includes('time'))
      return { icon: 'clock', accent: 'yellow' }
    if (key.includes('seo') || key.includes('rank') || key.includes('search'))
      return { icon: 'globe', accent: 'brand' }
    if (key.includes('review') || key.includes('rating') || key.includes('reputation'))
      return { icon: 'star', accent: 'green' }
    if (key.includes('lead') || key.includes('conversion') || key.includes('customer'))
      return { icon: 'users', accent: 'brand' }
    if (key.includes('competitor') || key.includes('rank') || key.includes('position'))
      return { icon: 'trophy', accent: 'brand' }
    return { icon: 'chart', accent: 'brand' }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, Number(n) || 0))
  }

  function getScoreColor(s) {
    if (s >= 70) return 'var(--green)'
    if (s >= 40) return 'var(--yellow)'
    return 'var(--red)'
  }

  function getScoreLabel(s) {
    if (s >= 70) return 'Strong digital presence'
    if (s >= 40) return 'Needs improvement'
    return 'Critical gaps'
  }

  function getHostname(raw) {
    if (!raw) return ''
    try {
      return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname
    } catch {
      return raw
    }
  }

  function buildFacts(data) {
    if (!data || !data.hasWebsite) return []
    const checks = data.checks || {}
    const list = []

    list.push({
      label: 'SSL',
      ok: Boolean(checks.https),
      value: checks.https ? 'Secured' : 'Not secured'
    })
    list.push({
      label: 'Mobile',
      ok: Boolean(checks.mobileResponsive),
      value: checks.mobileResponsive ? 'Responsive' : 'Not responsive'
    })
    if (checks.loadTimeMs) {
      list.push({
        label: 'Load time',
        ok: checks.loadTimeMs < 3000,
        value: `${(checks.loadTimeMs / 1000).toFixed(1)}s`
      })
    }
    list.push({
      label: 'Analytics',
      ok: (checks.analytics || []).length > 0,
      value: (checks.analytics || []).length ? checks.analytics.join(', ') : 'None detected'
    })
    list.push({
      label: 'Platform',
      ok: true,
      value: data.techStack?.platform || 'Unknown'
    })
    list.push({
      label: 'Pricing page',
      ok: Boolean(data.hasPricingPage),
      value: data.hasPricingPage ? 'Found' : 'Missing'
    })
    list.push({
      label: 'Services page',
      ok: Boolean(data.hasServicesPage),
      value: data.hasServicesPage ? 'Found' : 'Missing'
    })
    if (data.abandonedAgency?.found) {
      list.push({
        label: 'Built by',
        ok: !data.abandonedAgency.agencyDomainDead,
        value: data.abandonedAgency.agencyDomainDead
          ? `${data.abandonedAgency.agencyName} (agency site is dead)`
          : data.abandonedAgency.agencyName
      })
    }
    return list
  }

  // --- tiny, safe markdown-lite renderer for the proxy's free-text report ---
  function escapeHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    )
  }

  function inlineFormat(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  }

  function renderMarkdown(md) {
    if (!md) return ''
    const lines = md.split(/\r?\n/)
    let html = ''
    let inList = false
    const closeList = () => {
      if (inList) {
        html += '</ul>'
        inList = false
      }
    }
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        closeList()
        continue
      }
      if (/^-{3,}$/.test(line)) {
        closeList()
        html += '<hr />'
        continue
      }
      const headerMatch = line.match(/^#{1,6}\s+(.*)$/)
      if (headerMatch) {
        closeList()
        html += `<h4 class="md-heading">${inlineFormat(headerMatch[1])}</h4>`
        continue
      }
      const bulletMatch = line.match(/^[*-]\s+(.*)$/)
      if (bulletMatch) {
        if (!inList) {
          html += '<ul class="md-list">'
          inList = true
        }
        html += `<li>${inlineFormat(bulletMatch[1])}</li>`
        continue
      }
      closeList()
      html += `<p class="md-para">${inlineFormat(line)}</p>`
    }
    closeList()
    return html
  }
  // --- end markdown-lite renderer ---

  // --- turn the hosted proxy's free-text report into the same shape as the
  // structured local analysis, so the fallback path gets the exact same
  // interactive dashboard (gauge, KPI cards, donuts, tabs) instead of a
  // plain text card. Anything we can't confidently map lands in
  // parsedExtraSections and shows up as a "Full Report" tab instead. ---
  function stripMd(s) {
    return String(s)
      .replace(/\*\*/g, '')
      .replace(/^>\s*/, '')
      .trim()
      .replace(/^["“]|["”]$/g, '')
      .trim()
  }

  function parseReportMarkdown(md) {
    if (!md) return null
    const lines = md.split(/\r?\n/)
    const topHeaderRe = /^\*\*\d+\.\s*(.+?)\*\*:?\s*$/ // e.g. **1. Digital Maturity Score: 4.5/10**
    const mdHeaderRe = /^#{1,6}\s+(.+)$/

    const blocks = []
    let current = { title: '', lines: [] }
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || /^-{3,}$/.test(line)) continue
      const m = line.match(topHeaderRe) || line.match(mdHeaderRe)
      if (m) {
        current = { title: stripMd(m[1]), lines: [] }
        blocks.push(current)
        continue
      }
      if (!blocks.length) blocks.push(current)
      current.lines.push(line)
    }

    let score = null
    let maturityLabel = null
    const swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] }
    const vulnerabilities = []
    let outreachAngle = ''
    const extraSections = []
    const bulletRe = /^[*-]\s+(.*)$/

    for (const block of blocks) {
      const t = block.title.toLowerCase()
      const scoreOnTitle = block.title.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/)

      if (score === null && (t.includes('maturity score') || t.includes('digital maturity'))) {
        if (scoreOnTitle) {
          score = clamp(
            Math.round((parseFloat(scoreOnTitle[1]) / parseFloat(scoreOnTitle[2])) * 100),
            0,
            100
          )
        }
        const labelMatch = block.title.match(/\(([^)]+)\)/)
        if (labelMatch) maturityLabel = labelMatch[1].trim()
        continue
      }

      if (t.includes('swot')) {
        let bucket = null
        for (const l of block.lines) {
          const sub = l.match(/^\*\*(strengths?|weaknesses?|opportunit(?:y|ies)|threats?):?\*\*:?/i)
          if (sub) {
            const key = sub[1].toLowerCase()
            bucket = key.startsWith('strength')
              ? 'strengths'
              : key.startsWith('weak')
                ? 'weaknesses'
                : key.startsWith('opportun')
                  ? 'opportunities'
                  : 'threats'
            continue
          }
          const b = l.match(bulletRe)
          if (b && bucket) swot[bucket].push(stripMd(b[1]))
        }
        continue
      }

      if (t.includes('outreach')) {
        outreachAngle = block.lines
          .filter((l) => !bulletRe.test(l))
          .map(stripMd)
          .filter(Boolean)
          .join(' ')
        continue
      }

      if (
        t.includes('vulnerab') ||
        t.includes('key gaps') ||
        t.includes('critical gaps') ||
        t.includes('quick win') ||
        t.includes('opportunit') // "Opportunities for Dopmin" style sections, distinct from SWOT's own
      ) {
        for (const l of block.lines) {
          const b = l.match(bulletRe)
          if (b) vulnerabilities.push({ issue: stripMd(b[1]), impact: '', dopminService: '' })
        }
        continue
      }

      if (block.title) extraSections.push(block)
    }

    const hasSwot = Object.values(swot).some((arr) => arr.length)
    if (score === null && !hasSwot && !outreachAngle) return null

    return { score, maturityLabel, swot, vulnerabilities, outreachAngle, extraSections }
  }

  function buildAnalysisFromParsed(parsed, data) {
    const kpis = []
    if (parsed.maturityLabel) kpis.push({ label: 'Maturity Stage', value: parsed.maturityLabel })
    if (data?.techStack?.platform) kpis.push({ label: 'Platform', value: data.techStack.platform })
    if (data?.checks?.loadTimeMs) {
      kpis.push({ label: 'Load Time', value: `${(data.checks.loadTimeMs / 1000).toFixed(1)}s` })
    }
    const localFacts = buildFacts(data)
    if (!kpis.length) {
      for (const f of localFacts.slice(0, 3)) kpis.push({ label: f.label, value: f.value })
    }
    const derivedScore = localFacts.length
      ? Math.round((localFacts.filter((f) => f.ok).length / localFacts.length) * 100)
      : 0

    return {
      digitalMaturityScore: parsed.score !== null ? parsed.score : derivedScore,
      kpis,
      swot: parsed.swot,
      vulnerabilities: parsed.vulnerabilities,
      outreachAngle: parsed.outreachAngle
    }
  }
  // --- end AI-report parsing ---

  function resetResults() {
    scrapedData = null
    analysis = null
    analysisSource = ''
    fromCache = false
    reportMarkdown = ''
    parsedExtraSections = []
    errorMsg = ''
    usedFallback = false
    activeTab = 'overview'
  }

  /** Hosted Cloudflare proxy — has its own Gemini key baked in server-side,
   * so it always works with zero local setup. Used as the fallback path
   * whenever the local structured pipeline can't run (no local API key
   * configured, or a scrape/analysis error). */
  async function runProxyFallback(target) {
    usedFallback = true
    phase = 'analyzing'
    progressMessage = 'Generating report…'
    try {
      const result = await window.api.runDeepProfile(target)
      if (!result || result.error) {
        errorMsg = result?.error || 'Could not profile this business.'
        phase = 'error'
        return
      }
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text.trim()) {
        errorMsg = 'The analyst returned an empty report.'
        phase = 'error'
        return
      }
      reportMarkdown = text
      const parsed = parseReportMarkdown(text)
      if (parsed) {
        analysis = buildAnalysisFromParsed(parsed, scrapedData)
        analysisSource = 'AI Report'
        parsedExtraSections = parsed.extraSections
      } else {
        analysis = null
        parsedExtraSections = []
      }
      errorMsg = ''
      phase = 'done'
    } catch (err) {
      errorMsg = err?.message || 'Could not profile this business.'
      phase = 'error'
    }
  }

  async function runProfile() {
    const target = url.trim()
    if (!target || busy) return

    resetResults()
    phase = 'profiling'
    progressMessage = `Opening ${target}…`

    let localScrape = null
    try {
      localScrape = await window.api.profileBusiness({ url: target })
    } catch (err) {
      localScrape = { success: false, error: err?.message }
    }

    if (localScrape?.success && localScrape.hasWebsite) {
      scrapedData = localScrape
      phase = 'analyzing'
      progressMessage = 'Asking the AI Analyst for a maturity score…'

      let localAnalysis = null
      try {
        localAnalysis = await window.api.analyzeBusiness({ scrapedData })
      } catch (err) {
        localAnalysis = { success: false, error: err?.message }
      }

      if (localAnalysis?.success) {
        analysis = localAnalysis.analysis
        analysisSource = localAnalysis.source || ''
        fromCache = Boolean(localAnalysis.fromCache)
        errorMsg = ''
        phase = 'done'
        return
      }
      // Local analyst unavailable (usually: no API key configured yet) —
      // fall through to the hosted proxy below. We keep scrapedData so the
      // quick-facts strip still shows even in fallback mode.
    }

    await runProxyFallback(target)
  }

  async function runAnalysisOnly(forceRefresh) {
    if (!scrapedData?.hasWebsite || phase === 'analyzing') return
    phase = 'analyzing'
    errorMsg = ''
    progressMessage = 'Re-running the AI Analyst…'
    try {
      const analyzeResult = await window.api.analyzeBusiness({ scrapedData, forceRefresh })
      if (!analyzeResult || !analyzeResult.success) {
        await runProxyFallback(url.trim())
        return
      }
      analysis = analyzeResult.analysis
      analysisSource = analyzeResult.source || ''
      fromCache = Boolean(analyzeResult.fromCache)
      usedFallback = false
      reportMarkdown = ''
      phase = 'done'
    } catch {
      await runProxyFallback(url.trim())
    }
  }

  function refresh() {
    if (busy) return
    if (analysis && scrapedData?.hasWebsite) {
      runAnalysisOnly(true)
    } else {
      runProfile()
    }
  }

  async function copyText(text) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      setTimeout(() => (copied = false), 1600)
    } catch {
      // clipboard may be unavailable — fail silently
    }
  }

  onMount(() => {
    unsubProfile = window.api?.onProfileProgress?.((p) => {
      if (phase === 'profiling' && p?.message) progressMessage = p.message
    })
    unsubAnalyze = window.api?.onAnalyzeProgress?.((p) => {
      if (phase === 'analyzing' && p?.message) progressMessage = p.message
    })
    if (autoRun && url.trim()) runProfile()
  })

  onDestroy(() => {
    unsubProfile?.()
    unsubAnalyze?.()
  })
</script>

<div class="panel">
  {#if showUrlInput}
    <div class="input-row">
      <input
        type="text"
        placeholder="https://example.com"
        bind:value={url}
        on:keydown={(e) => e.key === 'Enter' && runProfile()}
      />
      <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || busy}>
        {busy ? 'Profiling…' : 'Run Deep Profile'}
      </button>
    </div>
  {:else}
    <div class="modal-lead-header">
      <div class="modal-lead-name">{leadName || url}</div>
      <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || busy}>
        {busy ? 'Profiling…' : hasResult ? 'Re-run' : 'Run Deep Profile'}
      </button>
    </div>
  {/if}

  {#if busy}
    <div class="stepper">
      <div class="step" class:active={phase === 'profiling'} class:done={phase !== 'profiling'}>
        <span class="step-dot">1</span>
        <span>Scanning website</span>
      </div>
      <div class="step-line" class:done={phase !== 'profiling'}></div>
      <div class="step" class:active={phase === 'analyzing'}>
        <span class="step-dot">2</span>
        <span>AI Analyst</span>
      </div>
    </div>
    <div class="progress-line">
      <span class="spinner"></span>
      <span>{progressMessage || 'Working…'}</span>
    </div>
  {/if}

  {#if errorMsg && phase === 'error'}
    <p class="inline-error">{errorMsg}</p>
  {/if}

  {#if hasResult}
    <div class="results">
      <div class="results-header">
        <div class="results-header-left">
          <span class="host-chip">{hostChip}</span>
          {#if analysis}
            <span
              class="badge"
              style="color:{scoreColor}; border-color:{scoreColor}; background:color-mix(in srgb, {scoreColor} 12%, white)"
            >
              {scoreLabel}
            </span>
          {/if}
          {#if fromCache}
            <span class="badge muted">Cached</span>
          {/if}
          {#if analysisSource}
            <span class="badge muted">{analysisSource}</span>
          {/if}
        </div>
        <button class="ghost-btn" on:click={refresh} disabled={busy} title="Re-run analysis">
          ⟳ Refresh
        </button>
      </div>

      {#if usedFallback && !analysis}
        <div class="inline-note">
          <span
            >Showing the quick summary report — the full AI dashboard (maturity score, KPIs, SWOT,
            outreach angle) is temporarily unavailable. Try refreshing in a moment.</span
          >
        </div>
      {:else if usedFallback}
        <div class="inline-note">
          <span>Built from the AI analyst's written report.</span>
        </div>
      {/if}

      {#if analysis}
        <nav class="tabs">
          {#each tabsToShow as tab}
            <button
              class="tab"
              class:active={activeTab === tab.id}
              on:click={() => (activeTab = tab.id)}
            >
              {tab.label}
              {#if tab.id === 'vulnerabilities' && vulnCount}
                <span class="tab-count">{vulnCount}</span>
              {/if}
              {#if tab.id === 'swot' && swotCount}
                <span class="tab-count">{swotCount}</span>
              {/if}
            </button>
          {/each}
        </nav>

        {#if activeTab === 'overview'}
          <div class="overview-grid" in:fade={{ duration: 200 }}>
            <div class="gauge-card">
              <svg viewBox="0 0 120 120" class="gauge">
                <circle class="gauge-track" cx="60" cy="60" r="52" />
                <circle
                  class="gauge-fill"
                  cx="60"
                  cy="60"
                  r="52"
                  stroke={scoreColor}
                  stroke-dasharray={CIRC}
                  stroke-dashoffset={gaugeOffset}
                />
              </svg>
              <div class="gauge-center">
                <div class="gauge-score" style="color:{scoreColor}">{Math.round($animScore)}</div>
                <div class="gauge-max">/ 100</div>
              </div>
              <div class="gauge-caption">Digital Maturity Score</div>
            </div>

            <div class="kpi-grid">
              {#each analysis.kpis as kpi}
                {@const v = kpiVisual(kpi.label)}
                <KpiCard
                  label={kpi.label}
                  value={kpi.value}
                  note={kpi.insight}
                  icon={v.icon}
                  accent={v.accent}
                />
              {/each}
            </div>
          </div>

          {#if facts.length}
            <div class="viz-row">
              <div class="viz-card checks-card">
                <h4>Site Health Checks</h4>
                <DonutChart
                  slices={checksDonutSlices}
                  centerValue="{checksPassed}/{checksTotal}"
                  centerLabel="passing"
                />
              </div>
              <div class="viz-card">
                <h4>Detail</h4>
                <div class="facts-row">
                  {#each facts as fact}
                    <div class="fact-chip" class:fact-ok={fact.ok} class:fact-bad={!fact.ok}>
                      <span class="fact-dot"></span>
                      <span class="fact-label">{fact.label}:</span>
                      <span class="fact-value">{fact.value}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          {#if competitors.length}
            <div class="section-block">
              <h4>Competitor Snapshot</h4>
              <BarChart bars={competitorBars} />
              <table class="compare-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Score</th>
                    <th>Platform</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="self-row">
                    <td>{scrapedData.hostname} (this business)</td>
                    <td>{scrapedData.score ?? '—'}</td>
                    <td>{scrapedData.techStack?.platform || 'Unknown'}</td>
                  </tr>
                  {#each competitors as c}
                    <tr>
                      <td>{c.url}</td>
                      <td>{c.success ? (c.score ?? '—') : 'N/A'}</td>
                      <td>{c.techStack?.platform || 'Unknown'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}

        {#if activeTab === 'swot'}
          <div class="viz-card swot-summary" in:fade={{ duration: 200 }}>
            <h4>SWOT Balance</h4>
            <DonutChart slices={swotDonutSlices} centerValue={swotCount} centerLabel="factors" />
          </div>
          <div class="swot-grid" in:fly={{ y: 8, duration: 220 }}>
            <div class="swot-quad swot-strengths">
              <div class="swot-head">Strengths</div>
              <ul>
                {#each analysis.swot.strengths as item}
                  <li>{item}</li>
                {:else}
                  <li class="swot-empty">None identified</li>
                {/each}
              </ul>
            </div>
            <div class="swot-quad swot-weaknesses">
              <div class="swot-head">Weaknesses</div>
              <ul>
                {#each analysis.swot.weaknesses as item}
                  <li>{item}</li>
                {:else}
                  <li class="swot-empty">None identified</li>
                {/each}
              </ul>
            </div>
            <div class="swot-quad swot-opportunities">
              <div class="swot-head">Opportunities</div>
              <ul>
                {#each analysis.swot.opportunities as item}
                  <li>{item}</li>
                {:else}
                  <li class="swot-empty">None identified</li>
                {/each}
              </ul>
            </div>
            <div class="swot-quad swot-threats">
              <div class="swot-head">Threats</div>
              <ul>
                {#each analysis.swot.threats as item}
                  <li>{item}</li>
                {:else}
                  <li class="swot-empty">None identified</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}

        {#if activeTab === 'vulnerabilities'}
          {#if serviceBars.length > 1}
            <div class="viz-card" in:fade={{ duration: 200 }}>
              <h4>Opportunities by Service</h4>
              <BarChart bars={serviceBars} />
            </div>
          {/if}
          <div class="vuln-list" in:fly={{ y: 8, duration: 220 }}>
            {#each analysis.vulnerabilities as v, i}
              <div class="vuln-card">
                <div class="vuln-index">{String(i + 1).padStart(2, '0')}</div>
                <div class="vuln-body">
                  <div class="vuln-issue">{v.issue}</div>
                  {#if v.impact}
                    <div class="vuln-impact">{v.impact}</div>
                  {/if}
                  {#if v.dopminService}
                    <div class="vuln-service">{v.dopminService}</div>
                  {/if}
                </div>
              </div>
            {:else}
              <p class="empty-note">No specific vulnerabilities flagged.</p>
            {/each}
          </div>
        {/if}

        {#if activeTab === 'outreach'}
          <div class="outreach-card" in:fly={{ y: 8, duration: 220 }}>
            <div class="outreach-quote">“</div>
            <p class="outreach-text">{analysis.outreachAngle}</p>
            <button class="ghost-btn" on:click={() => copyText(analysis.outreachAngle)}>
              {copied ? 'Copied ✓' : 'Copy message'}
            </button>
          </div>

          {#if contactEmails.length || contactPhones.length || socialLinks.length}
            <div class="section-block">
              <h4>Contact & Socials</h4>
              <div class="contact-grid">
                {#each contactEmails as e}
                  <span class="contact-chip">✉ {e}</span>
                {/each}
                {#each contactPhones as p}
                  <span class="contact-chip">☎ {p}</span>
                {/each}
                {#each socialLinks as [platform, href]}
                  <a class="contact-chip contact-link" {href} target="_blank" rel="noreferrer">
                    {platform}
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        {#if activeTab === 'details'}
          <div class="report-card" in:fade={{ duration: 200 }}>
            <div class="report-card-head">
              <h4>Full AI Report</h4>
              <button class="ghost-btn" on:click={() => copyText(reportMarkdown)}>
                {copied ? 'Copied ✓' : 'Copy report'}
              </button>
            </div>
            <div class="report-body">
              {@html detailsHtml}
            </div>
          </div>
        {/if}
      {:else if reportMarkdown}
        {#if facts.length}
          <div class="facts-row">
            {#each facts as fact}
              <div class="fact-chip" class:fact-ok={fact.ok} class:fact-bad={!fact.ok}>
                <span class="fact-dot"></span>
                <span class="fact-label">{fact.label}:</span>
                <span class="fact-value">{fact.value}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="report-card">
          <div class="report-card-head">
            <h4>Analysis Report</h4>
            <button class="ghost-btn" on:click={() => copyText(reportMarkdown)}>
              {copied ? 'Copied ✓' : 'Copy report'}
            </button>
          </div>
          <div class="report-body">
            {@html reportHtml}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .input-row input {
    flex: 1;
    padding: 9px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.86rem;
  }

  .modal-lead-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .modal-lead-name {
    font-weight: 700;
    font-size: 1rem;
    color: var(--text-1);
  }

  .primary-btn {
    border: 1px solid var(--brand);
    background: var(--brand);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: 9px 16px;
    font-weight: 600;
    font-size: 0.86rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .ghost-btn {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
    border-radius: var(--radius-sm);
    padding: 7px 12px;
    font-weight: 600;
    font-size: 0.78rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .ghost-btn:hover:not(:disabled) {
    border-color: var(--brand);
    color: var(--brand-dark);
  }

  .ghost-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Stepper */
  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.78rem;
    color: var(--text-3);
    font-weight: 600;
  }

  .step.active,
  .step.done {
    color: var(--text-1);
  }

  .step-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    font-size: 0.68rem;
    color: var(--text-3);
  }

  .step.active .step-dot {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
  }

  .step.done .step-dot {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
  }

  .step-line {
    flex: 0 0 28px;
    height: 2px;
    background: var(--border);
  }

  .step-line.done {
    background: var(--green);
  }

  .progress-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    color: var(--text-3);
    margin: 0;
  }

  .spinner {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid var(--border);
    border-top-color: var(--brand);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .inline-error {
    font-size: 0.82rem;
    color: var(--red-dark);
    margin: 0;
  }

  .inline-note {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--text-2);
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
  }

  .empty-note {
    font-size: 0.82rem;
    color: var(--text-3);
    margin: 0;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 4px;
    border-top: 1px solid var(--border-soft);
  }

  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .results-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .host-chip {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-1);
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .badge.muted {
    color: var(--text-3);
    background: var(--surface-soft);
    border-color: var(--border);
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border-soft);
    overflow-x: auto;
  }

  .tab {
    border: none;
    background: none;
    padding: 8px 4px;
    margin-right: 18px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-3);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .tab.active {
    color: var(--brand-dark);
    border-bottom-color: var(--brand);
  }

  .tab-count {
    background: var(--surface-soft);
    color: var(--text-2);
    border-radius: 999px;
    font-size: 0.68rem;
    padding: 1px 6px;
    font-weight: 700;
  }

  .tab.active .tab-count {
    background: var(--brand-soft);
    color: var(--brand-dark);
  }

  /* Overview */
  .overview-grid {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 20px;
    align-items: center;
  }

  .gauge-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .gauge {
    width: 130px;
    height: 130px;
    transform: rotate(-90deg);
  }

  .gauge-track {
    fill: none;
    stroke: var(--border-soft);
    stroke-width: 10;
  }

  .gauge-fill {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.7s ease;
  }

  .gauge-center {
    position: absolute;
    top: 42px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .gauge-score {
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1;
  }

  .gauge-max {
    font-size: 0.7rem;
    color: var(--text-3);
    font-weight: 600;
  }

  .gauge-caption {
    font-size: 0.76rem;
    color: var(--text-2);
    font-weight: 600;
    text-align: center;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  /* Visual section cards (donut/bar chart wrappers) */
  .viz-row {
    display: grid;
    grid-template-columns: 1.1fr 1.4fr;
    gap: 12px;
  }

  .viz-card {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }

  .viz-card h4 {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 10px;
  }

  .swot-summary {
    margin-bottom: 12px;
  }

  .swot-summary :global(.donut-wrap) {
    justify-content: flex-start;
  }

  @media (max-width: 620px) {
    .viz-row {
      grid-template-columns: 1fr;
    }
  }

  /* Facts */
  .facts-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .fact-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.76rem;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
  }

  .fact-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-3);
  }

  .fact-chip.fact-ok .fact-dot {
    background: var(--green);
  }

  .fact-chip.fact-bad .fact-dot {
    background: var(--red);
  }

  .fact-label {
    color: var(--text-3);
  }

  .fact-value {
    font-weight: 600;
    color: var(--text-1);
  }

  /* Section blocks */
  .section-block h4 {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 8px;
  }

  .compare-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .compare-table th {
    text-align: left;
    color: var(--text-3);
    font-weight: 600;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .compare-table td {
    padding: 7px 8px;
    border-bottom: 1px solid var(--border-soft);
    color: var(--text-2);
  }

  .compare-table .self-row td {
    font-weight: 700;
    color: var(--text-1);
    background: var(--surface-soft);
  }

  /* SWOT */
  .swot-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .swot-quad {
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
  }

  .swot-quad ul {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 8px;
  }

  .swot-quad li {
    font-size: 0.8rem;
    color: var(--text-2);
    line-height: 1.4;
    padding-left: 12px;
    position: relative;
  }

  .swot-quad li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 7px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.5;
  }

  .swot-empty {
    color: var(--text-3);
    font-style: italic;
  }

  .swot-head {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .swot-strengths {
    background: var(--green-soft);
    border-left-color: var(--green);
  }
  .swot-strengths .swot-head {
    color: var(--green-dark);
  }

  .swot-weaknesses {
    background: var(--red-soft);
    border-left-color: var(--red);
  }
  .swot-weaknesses .swot-head {
    color: var(--red-dark);
  }

  .swot-opportunities {
    background: var(--brand-soft);
    border-left-color: var(--brand);
  }
  .swot-opportunities .swot-head {
    color: var(--brand-dark);
  }

  .swot-threats {
    background: var(--yellow-soft);
    border-left-color: var(--yellow);
  }
  .swot-threats .swot-head {
    color: var(--yellow-dark);
  }

  /* Vulnerabilities */
  .vuln-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vuln-card {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease;
  }

  .vuln-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
    border-color: var(--brand);
  }

  .vuln-index {
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--brand);
    flex-shrink: 0;
  }

  .vuln-issue {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .vuln-impact {
    font-size: 0.78rem;
    color: var(--text-2);
    margin-top: 3px;
    line-height: 1.4;
  }

  .vuln-service {
    display: inline-block;
    margin-top: 7px;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--brand-dark);
    background: var(--brand-soft);
    border-radius: 999px;
    padding: 3px 10px;
  }

  /* Outreach */
  .outreach-card {
    position: relative;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 20px 16px;
  }

  .outreach-quote {
    position: absolute;
    top: 2px;
    left: 14px;
    font-size: 2.4rem;
    color: var(--brand-soft);
    font-weight: 800;
    line-height: 1;
  }

  .outreach-text {
    position: relative;
    font-size: 0.92rem;
    color: var(--text-1);
    line-height: 1.55;
    margin-bottom: 12px;
    padding-left: 4px;
  }

  .contact-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .contact-chip {
    font-size: 0.78rem;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
  }

  .contact-link {
    color: var(--brand-dark);
    text-decoration: none;
    text-transform: capitalize;
  }

  .contact-link:hover {
    text-decoration: underline;
  }

  /* Fallback markdown report */
  .report-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: 16px 18px;
  }

  .report-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .report-card-head h4 {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .report-body :global(.md-heading) {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-1);
    margin: 14px 0 6px;
  }

  .report-body :global(.md-heading:first-child) {
    margin-top: 0;
  }

  .report-body :global(.md-para) {
    font-size: 0.84rem;
    color: var(--text-2);
    line-height: 1.6;
    margin: 6px 0;
  }

  .report-body :global(.md-list) {
    margin: 6px 0 10px;
    padding-left: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .report-body :global(.md-list li) {
    font-size: 0.84rem;
    color: var(--text-2);
    line-height: 1.5;
    padding-left: 14px;
    position: relative;
    list-style: none;
  }

  .report-body :global(.md-list li::before) {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--brand);
    opacity: 0.6;
  }

  .report-body :global(hr) {
    border: none;
    border-top: 1px solid var(--border-soft);
    margin: 14px 0;
  }

  .report-body :global(strong) {
    color: var(--text-1);
    font-weight: 700;
  }

  @media (max-width: 620px) {
    .overview-grid {
      grid-template-columns: 1fr;
    }
    .kpi-grid {
      grid-template-columns: 1fr 1fr;
    }
    .swot-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
