<script>
  import { onDestroy } from 'svelte'
  import SplashScreen from './components/SplashScreen.svelte'
  import AppHeader from './components/AppHeader.svelte'
  import SearchPanel from './components/SearchPanel.svelte'
  import ProgressBanner from './components/ProgressBanner.svelte'
  import Banner from './components/Banner.svelte'
  import StatsOverview from './components/StatsOverview.svelte'
  import LeadsPanel from './components/LeadsPanel.svelte'
  import ResultsTable from './components/ResultsTable.svelte'

  let showSplash = true

  let query = 'hardware stores in Mount Lavinia'
  let desiredCount = 30
  let leads = []
  let isScraping = false
  let errorMessage = ''
  let totalFound = 0
  let requested = 0
  let truncated = false
  let failedCount = 0
  let hasSearched = false
  let wasExpanded = false
  let queriesUsed = []

  // Live progress while a search is in flight.
  let progressPhase = '' // '' | 'searching' | 'discovering' | 'extracting' | 'done'
  let progressMessage = ''
  let discoveredCount = 0
  let extractDone = 0
  let extractTotal = 0
  let unsubscribeProgress = null

  $: hotLeads = leads.filter((l) => l.isHotLead).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  $: riskLeads = leads
    .filter((l) => l.isReputationRisk)
    .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))
  $: noWebsiteCount = leads.filter((l) => !l.hasWebsite).length

  function resetProgress() {
    progressPhase = ''
    progressMessage = ''
    discoveredCount = 0
    extractDone = 0
    extractTotal = 0
  }

  function handleProgress(payload) {
    progressPhase = payload.phase
    if (payload.phase === 'searching') {
      progressMessage = payload.message || 'Opening Google Maps…'
    } else if (payload.phase === 'discovering') {
      discoveredCount = payload.found ?? discoveredCount
    } else if (payload.phase === 'extracting') {
      extractDone = payload.done ?? extractDone
      extractTotal = payload.total ?? extractTotal
    }
  }

  async function handleSearch() {
    if (!query.trim() || isScraping) return

    isScraping = true
    errorMessage = ''
    leads = []
    hasSearched = true
    resetProgress()

    const count = Math.max(1, Math.min(500, Math.floor(Number(desiredCount)) || 30))
    desiredCount = count

    if (!unsubscribeProgress && window.api.onScrapeProgress) {
      unsubscribeProgress = window.api.onScrapeProgress(handleProgress)
    }

    try {
      const response = await window.api.startScraping({ query, maxResults: count })
      if (response.success) {
        leads = response.leads
        totalFound = response.totalFound ?? response.leads.length
        requested = response.requested ?? count
        truncated = Boolean(response.truncated)
        failedCount = response.failedCount ?? 0
        wasExpanded = Boolean(response.expanded)
        queriesUsed = response.queriesUsed ?? []
      } else {
        errorMessage = response.error || 'Failed to fetch leads.'
      }
    } catch (err) {
      errorMessage = err.message || 'Scraping failed.'
    } finally {
      isScraping = false
      resetProgress()
    }
  }

  onDestroy(() => {
    unsubscribeProgress?.()
  })
</script>

<main class="app">
  {#if showSplash}
    <SplashScreen on:done={() => (showSplash = false)} />
  {/if}

  <AppHeader />

  <SearchPanel bind:query bind:desiredCount {isScraping} onSearch={handleSearch} />

  {#if errorMessage}
    <Banner variant="error">{errorMessage}</Banner>
  {/if}

  {#if isScraping}
    <ProgressBanner
      {progressPhase}
      {progressMessage}
      {discoveredCount}
      {desiredCount}
      {extractDone}
      {extractTotal}
    />
  {/if}

  {#if hasSearched && !isScraping && wasExpanded && leads.length > 0}
    <Banner variant="info">
      "{query}" looked like just a place name, so we broadened it across {queriesUsed.length}
      business categories ({queriesUsed.length ? queriesUsed[0] : ''}, …) to find real listings
      there.
    </Banner>
  {/if}

  {#if hasSearched && !isScraping && leads.length > 0}
    <StatsOverview
      {totalFound}
      {requested}
      {truncated}
      hotLeadsCount={hotLeads.length}
      riskLeadsCount={riskLeads.length}
      {noWebsiteCount}
      totalShown={leads.length}
    />

    <section class="split-grid">
      <LeadsPanel
        title="High-Value Leads"
        tag="good reviews"
        variant="green"
        leads={hotLeads}
        emptyMessage="No no-website leads with strong ratings in this batch."
      />
      <LeadsPanel
        title="Reputation Rescue"
        tag="bad reviews"
        variant="red"
        leads={riskLeads}
        emptyMessage="No no-website leads with weak ratings in this batch."
      />
    </section>

    <ResultsTable {leads} {failedCount} />
  {:else if hasSearched && !isScraping && leads.length === 0 && !errorMessage}
    <Banner variant="info">No results found for this search. Try broadening your query.</Banner>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  :global(#app) {
    min-height: 100vh;
  }

  .app {
    max-width: 1160px;
    margin: 0 auto;
    padding: 28px 24px 56px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .split-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 820px) {
    .split-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
