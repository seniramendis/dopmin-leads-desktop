<script>
  import { onDestroy } from 'svelte'

  // In modal mode (from a lead row) url/leadName arrive prefilled and the
  // URL field is hidden; in standalone mode (sidebar tab) showUrlInput is
  // true and the person types a URL in.
  export let url = ''
  export let leadName = ''
  export let showUrlInput = true
  export let autoRun = false
  export let onOpenSettings = () => {}

  let competitor1 = ''
  let competitor2 = ''

  let profile = null
  let profileLoading = false
  let profileError = ''
  let profileMessage = ''
  let unsubProfileProgress = null

  let analysis = null
  let analysisSource = ''
  let analysisFromCache = false
  let analysisLoading = false
  let analysisError = ''
  let analysisMessage = ''
  let unsubAnalyzeProgress = null

  let copied = false

  function scoreClass(score) {
    if (score >= 80) return 'score-good'
    if (score >= 50) return 'score-mid'
    return 'score-bad'
  }

  function resetResults() {
    profile = null
    profileError = ''
    analysis = null
    analysisSource = ''
    analysisFromCache = false
    analysisError = ''
  }

  async function runProfile() {
    const target = url.trim()
    if (!target || profileLoading) return

    profileLoading = true
    resetResults()
    profileMessage = ''

    if (!unsubProfileProgress && window.api.onProfileProgress) {
      unsubProfileProgress = window.api.onProfileProgress((payload) => {
        if (payload.message) profileMessage = payload.message
      })
    }

    const competitorUrls = [competitor1, competitor2].map((c) => c.trim()).filter(Boolean)

    try {
      const result = await window.api.profileBusiness({ url: target, competitorUrls })
      if (result.success) {
        profile = result
      } else {
        profileError = result.error || 'Could not profile this business.'
      }
    } catch (err) {
      profileError = err.message || 'Could not profile this business.'
    } finally {
      profileLoading = false
      profileMessage = ''
    }
  }

  async function runAnalysis(forceRefresh = false) {
    if (!profile || analysisLoading) return

    analysisLoading = true
    analysisError = ''
    analysisMessage = ''

    if (!unsubAnalyzeProgress && window.api.onAnalyzeProgress) {
      unsubAnalyzeProgress = window.api.onAnalyzeProgress((payload) => {
        if (payload.message) analysisMessage = payload.message
      })
    }

    try {
      const result = await window.api.analyzeBusiness({ scrapedData: profile, forceRefresh })
      if (result.success) {
        analysis = result.analysis
        analysisSource = result.source || ''
        analysisFromCache = Boolean(result.fromCache)
      } else {
        analysisError = result.error || 'Analysis failed.'
      }
    } catch (err) {
      analysisError = err.message || 'Analysis failed.'
    } finally {
      analysisLoading = false
      analysisMessage = ''
    }
  }

  function copyOutreach() {
    if (!analysis?.outreachAngle) return
    navigator.clipboard?.writeText(analysis.outreachAngle)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  $: needsApiKey = /no gemini or openrouter api key/i.test(analysisError || '')

  if (autoRun && url.trim()) {
    // Fires once on mount for the modal (lead) flow — standalone mode
    // leaves this to the "Run Profile" button instead.
    runProfile()
  }

  onDestroy(() => {
    unsubProfileProgress?.()
    unsubAnalyzeProgress?.()
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
      <button class="primary-btn" on:click={() => runProfile()} disabled={!url.trim() || profileLoading}>
        {profileLoading ? 'Profiling…' : 'Run Deep Profile'}
      </button>
    </div>
    <details class="competitors-toggle">
      <summary>Compare against 1-2 competitors (optional)</summary>
      <div class="competitor-inputs">
        <input type="text" placeholder="Competitor 1 URL" bind:value={competitor1} />
        <input type="text" placeholder="Competitor 2 URL" bind:value={competitor2} />
      </div>
    </details>
  {:else}
    <div class="modal-lead-name">{leadName || url}</div>
  {/if}

  {#if profileLoading}
    <p class="progress-line">{profileMessage || 'Working…'}</p>
  {/if}

  {#if profileError}
    <p class="inline-error">{profileError}</p>
  {/if}

  {#if profile}
    <div class="results">
      <section class="overview-row">
        <span class="score-badge {scoreClass(profile.score ?? 0)}">{profile.score ?? 0}/100</span>
        <span class="hostname">{profile.hostname}</span>
        {#if profile.techStack?.platform}
          <span class="pill">{profile.techStack.platform}</span>
        {/if}
      </section>

      {#if profile.issues?.length}
        <ul class="issue-list">
          {#each profile.issues as issue}
            <li>{issue}</li>
          {/each}
        </ul>
      {/if}

      {#if profile.techStack?.signals?.length}
        <div class="chip-row">
          {#each profile.techStack.signals as sig}
            <span class="pill pill-muted">{sig}</span>
          {/each}
        </div>
      {/if}

      {#if profile.contact}
        <div class="grid-2">
          <div>
            <h4>Contact</h4>
            {#if profile.contact.emails?.length}
              <p class="small-list">{profile.contact.emails.join(', ')}</p>
            {/if}
            {#if profile.contact.phones?.length}
              <p class="small-list">{profile.contact.phones.join(', ')}</p>
            {/if}
            {#if !profile.contact.emails?.length && !profile.contact.phones?.length}
              <p class="muted-text">No email or phone found on the page.</p>
            {/if}
          </div>
          <div>
            <h4>Social</h4>
            {#if profile.contact.social && Object.keys(profile.contact.social).length}
              <div class="chip-row">
                {#each Object.entries(profile.contact.social) as [platform, href]}
                  <a class="pill pill-link" {href} target="_blank" rel="noreferrer">{platform}</a>
                {/each}
              </div>
            {:else}
              <p class="muted-text">No social links found.</p>
            {/if}
          </div>
        </div>

        <div class="grid-2">
          <div>
            <h4>Pricing page</h4>
            {#if profile.hasPricingPage}
              <a class="pill pill-link" href={profile.pricingUrl} target="_blank" rel="noreferrer"
                >Found →</a
              >
            {:else}
              <p class="muted-text">No visible pricing page.</p>
            {/if}
          </div>
          <div>
            <h4>Services page</h4>
            {#if profile.hasServicesPage}
              <a class="pill pill-link" href={profile.servicesUrl} target="_blank" rel="noreferrer"
                >Found →</a
              >
            {:else}
              <p class="muted-text">No visible services page.</p>
            {/if}
          </div>
        </div>
      {/if}

      {#if profile.abandonedAgency?.found}
        <p class="agency-note" class:agency-dead={profile.abandonedAgency.agencyDomainDead}>
          Built by "{profile.abandonedAgency.agencyName}"{profile.abandonedAgency.agencyDomainDead
            ? ' — whose own domain is no longer active.'
            : '.'}
        </p>
      {/if}

      {#if profile.competitors?.length}
        <h4>Competitors</h4>
        <div class="chip-row">
          {#each profile.competitors as c}
            {#if c.success}
              <span class="pill">{c.url} · {c.score}/100 · {c.techStack?.platform || 'Unknown'}</span>
            {:else}
              <span class="pill pill-muted">{c.url} · couldn't load</span>
            {/if}
          {/each}
        </div>
      {/if}

      <div class="analysis-block">
        {#if !analysis}
          <button class="secondary-btn" on:click={() => runAnalysis(false)} disabled={analysisLoading}>
            {analysisLoading ? 'Analyzing…' : 'Run AI Analysis'}
          </button>
        {/if}

        {#if analysisLoading}
          <p class="progress-line">{analysisMessage || 'Thinking…'}</p>
        {/if}

        {#if analysisError}
          <p class="inline-error">
            {analysisError}
            {#if needsApiKey}
              <button class="link-btn" on:click={onOpenSettings}>Add an API key</button>
            {/if}
          </p>
        {/if}

        {#if analysis}
          <div class="analysis-header">
            <span class="score-badge {scoreClass(analysis.digitalMaturityScore)}"
              >{analysis.digitalMaturityScore}/100</span
            >
            <span class="muted-text">Digital maturity</span>
            {#if analysisFromCache}
              <span class="pill pill-muted">Cached</span>
            {:else if analysisSource}
              <span class="pill pill-muted">{analysisSource}</span>
            {/if}
            <button class="link-btn" on:click={() => runAnalysis(true)} disabled={analysisLoading}
              >Re-analyze</button
            >
          </div>

          {#if analysis.kpis?.length}
            <div class="kpi-grid">
              {#each analysis.kpis as kpi}
                <div class="kpi-card">
                  <div class="kpi-label">{kpi.label}</div>
                  <div class="kpi-value">{kpi.value}</div>
                  {#if kpi.insight}<div class="kpi-insight">{kpi.insight}</div>{/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if analysis.swot}
            <div class="swot-grid">
              <div class="swot-cell swot-strengths">
                <h5>Strengths</h5>
                <ul>{#each analysis.swot.strengths || [] as s}<li>{s}</li>{/each}</ul>
              </div>
              <div class="swot-cell swot-weaknesses">
                <h5>Weaknesses</h5>
                <ul>{#each analysis.swot.weaknesses || [] as s}<li>{s}</li>{/each}</ul>
              </div>
              <div class="swot-cell swot-opportunities">
                <h5>Opportunities</h5>
                <ul>{#each analysis.swot.opportunities || [] as s}<li>{s}</li>{/each}</ul>
              </div>
              <div class="swot-cell swot-threats">
                <h5>Threats</h5>
                <ul>{#each analysis.swot.threats || [] as s}<li>{s}</li>{/each}</ul>
              </div>
            </div>
          {/if}

          {#if analysis.vulnerabilities?.length}
            <h4>Vulnerabilities → Dopmin services</h4>
            <ul class="vuln-list">
              {#each analysis.vulnerabilities as v}
                <li>
                  <div class="vuln-issue">{v.issue}</div>
                  {#if v.impact}<div class="vuln-impact">{v.impact}</div>{/if}
                  <span class="pill pill-service">{v.dopminService}</span>
                </li>
              {/each}
            </ul>
          {/if}

          {#if analysis.outreachAngle}
            <div class="outreach-box">
              <h4>Outreach angle</h4>
              <p>{analysis.outreachAngle}</p>
              <button class="secondary-btn" on:click={copyOutreach}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          {/if}
        {/if}
      </div>
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

  .competitors-toggle {
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .competitors-toggle summary {
    cursor: pointer;
    font-weight: 600;
  }

  .competitor-inputs {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .competitor-inputs input {
    flex: 1;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.82rem;
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

  .secondary-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 14px;
    background: var(--surface);
    color: var(--text-1);
    font-weight: 600;
    font-size: 0.84rem;
    cursor: pointer;
    align-self: flex-start;
  }

  .secondary-btn:hover:not(:disabled) {
    background: var(--surface-soft);
  }

  .secondary-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .link-btn {
    border: none;
    background: none;
    padding: 0;
    color: var(--brand);
    font-size: inherit;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }

  .progress-line {
    font-size: 0.82rem;
    color: var(--text-3);
    margin: 0;
  }

  .inline-error {
    font-size: 0.82rem;
    color: var(--red-dark);
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 4px;
    border-top: 1px solid var(--border-soft);
  }

  .overview-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .hostname {
    font-weight: 700;
    color: var(--text-1);
  }

  .score-badge {
    font-size: 0.8rem;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
  }

  .score-good {
    background: var(--green-soft);
    color: var(--green-dark);
  }

  .score-mid {
    background: var(--yellow-soft);
    color: var(--yellow-dark);
  }

  .score-bad {
    background: var(--red-soft);
    color: var(--red-dark);
  }

  .pill {
    display: inline-block;
    font-size: 0.74rem;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    color: var(--text-2);
  }

  .pill-muted {
    color: var(--text-3);
  }

  .pill-link {
    color: var(--brand);
    text-decoration: none;
  }

  .pill-link:hover {
    text-decoration: underline;
  }

  .pill-service {
    background: var(--brand-soft);
    border-color: var(--brand-soft);
    color: var(--brand-dark);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .issue-list {
    margin: 0;
    padding-left: 18px;
    font-size: 0.82rem;
    color: var(--text-2);
  }

  .issue-list li {
    margin-bottom: 2px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  h4 {
    margin: 0 0 6px;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
  }

  .small-list {
    margin: 0 0 4px;
    font-size: 0.82rem;
    color: var(--text-1);
    word-break: break-all;
  }

  .muted-text {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-3);
  }

  .agency-note {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-2);
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }

  .agency-note.agency-dead {
    background: var(--red-soft);
    border-color: var(--red-soft);
    color: var(--red-dark);
    font-weight: 600;
  }

  .analysis-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--border-soft);
  }

  .analysis-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }

  .kpi-card {
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }

  .kpi-label {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-3);
    margin-bottom: 3px;
  }

  .kpi-value {
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .kpi-insight {
    font-size: 0.74rem;
    color: var(--text-2);
    margin-top: 2px;
  }

  .swot-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .swot-cell {
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    border: 1px solid var(--border-soft);
  }

  .swot-cell h5 {
    margin: 0 0 6px;
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .swot-cell ul {
    margin: 0;
    padding-left: 16px;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .swot-strengths {
    background: var(--green-soft);
  }

  .swot-strengths h5 {
    color: var(--green-dark);
  }

  .swot-weaknesses {
    background: var(--red-soft);
  }

  .swot-weaknesses h5 {
    color: var(--red-dark);
  }

  .swot-opportunities {
    background: var(--surface-soft);
  }

  .swot-opportunities h5 {
    color: var(--text-2);
  }

  .swot-threats {
    background: var(--yellow-soft);
  }

  .swot-threats h5 {
    color: var(--yellow-dark);
  }

  .vuln-list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vuln-list li {
    list-style: none;
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }

  .vuln-issue {
    font-weight: 700;
    font-size: 0.86rem;
    color: var(--text-1);
  }

  .vuln-impact {
    font-size: 0.8rem;
    color: var(--text-2);
    margin: 3px 0 6px;
  }

  .outreach-box {
    background: var(--surface-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .outreach-box p {
    margin: 0;
    font-size: 0.86rem;
    color: var(--text-1);
    line-height: 1.5;
  }

  @media (max-width: 560px) {
    .grid-2,
    .swot-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
