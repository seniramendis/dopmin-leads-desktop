<script>
  import { onDestroy } from 'svelte'
  import { searchCategory, searchRegion } from './lib/stores.js'
  import SplashScreen from './components/SplashScreen.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import AppHeader from './components/AppHeader.svelte'
  import Dashboard from './components/Dashboard.svelte'
  import SearchPanel from './components/SearchPanel.svelte'
  import ProgressBanner from './components/ProgressBanner.svelte'
  import Banner from './components/Banner.svelte'
  import StatsOverview from './components/StatsOverview.svelte'
  import LeadsPanel from './components/LeadsPanel.svelte'
  import ResultsTable from './components/ResultsTable.svelte'
  import LeadDatabase from './components/LeadDatabase.svelte'
  import DeepProfilePanel from './components/DeepProfilePanel.svelte'
  import Footer from './components/Footer.svelte'

  let showSplash = true
  let view = 'dashboard'

  const HEADER_COPY = {
    dashboard: {
      title: 'Dashboard',
      subtitle: 'KPIs and trends across every lead you\u2019ve ever scraped'
    },
    search: {
      title: 'Lead Search',
      subtitle: 'Extract and qualify local business leads from Google Maps'
    },
    database: {
      title: 'Leads Database',
      subtitle: 'Every lead ever scraped, organized into a pipeline'
    },
    profiler: {
      title: 'AI Profiler',
      subtitle: 'Deep-profile any business and generate an outreach angle'
    }
  }
  $: headerCopy = HEADER_COPY[view] || HEADER_COPY.search

  let query = 'hardware stores in Mount Lavinia'
  let desiredCount = 30
  let leads = []
  let isScraping = false
  let errorMessage = ''
  let connectionWarning = ''
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
    if (payload.phase === 'connection-slow') {
      // A slow-connection notice, not a phase change — leave the current
      // phase/progress UI alone and just surface the warning alongside it.
      connectionWarning = payload.message || 'Your internet connection looks slow.'
      return
    }
    if (payload.phase === 'connection-lost') {
      // The scrape is aborting; the final error banner (from the rejected
      // response below) will explain it, so just clear the transient warning.
      connectionWarning = ''
      return
    }

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

  async function handleSearch(payload = {}) {
    const nextQuery = payload.query ?? query
    const nextCategory = payload.category ?? $searchCategory
    const nextRegion = payload.region ?? $searchRegion
    const mode = payload.mode ?? 'it_projects'
    const industry = payload.industry ?? 'healthcare'

    if (!nextQuery.trim() || isScraping) return

    isScraping = true
    errorMessage = ''
    connectionWarning = ''
    leads = []
    hasSearched = true
    resetProgress()

    const count = Math.max(
      1,
      Math.min(500, Math.floor(Number(payload.desiredCount ?? desiredCount)) || 30)
    )
    desiredCount = count

    if (!unsubscribeProgress && window.api.onScrapeProgress) {
      unsubscribeProgress = window.api.onScrapeProgress(handleProgress)
    }

    try {
      const response = await window.api.startScraping({
        query: nextQuery,
        maxResults: count,
        category: nextCategory,
        region: nextRegion,
        mode,
        industry
      })
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
      connectionWarning = ''
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

  <Sidebar {view} onNavigate={(v) => (view = v)} />

  <div class="content">
    <AppHeader title={headerCopy.title} subtitle={headerCopy.subtitle} />

    {#if view === 'dashboard'}
      <Dashboard />
    {:else if view === 'database'}
      <LeadDatabase />
    {:else if view === 'profiler'}
      <section class="card profiler-card">
        <h2>AI Business Profiler</h2>
        <p class="profiler-hint">
          Deep-profile any business's website — pricing/services pages, contact + social links, tech
          stack, and an optional competitor comparison — then run the AI Analyst for a digital
          maturity score, SWOT, and a ready-to-use outreach angle.
        </p>
        <DeepProfilePanel showUrlInput={true} />
      </section>
    {:else}
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
        {#if connectionWarning}
          <Banner variant="warning">{connectionWarning}</Banner>
        {/if}
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
    {/if}

    <Footer />
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
  }

  :global(#app) {
    min-height: 100vh;
  }

  .app {
    display: flex;
    min-height: 100vh;
  }

  .content {
    flex: 1;
    margin-left: var(--sidebar-w);
    max-width: 1160px;
    padding: 28px 32px 56px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-width: 0; /* let child tables/boards scroll instead of forcing the column to overflow */
  }

  .split-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .profiler-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 22px;
  }

  .profiler-card h2 {
    margin: 0 0 6px;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-1);
  }

  .profiler-hint {
    margin: 0 0 16px;
    font-size: 0.84rem;
    color: var(--text-3);
    max-width: 640px;
  }

  @media (max-width: 1000px) {
    .content {
      padding: 22px 20px 44px;
    }
  }

  @media (max-width: 820px) {
    .split-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Matches the Sidebar's own breakpoint where it becomes a horizontal
     top bar instead of a fixed left rail — the content column needs to
     stop reserving space for it at the same width. */
  @media (max-width: 760px) {
    .app {
      flex-direction: column;
    }

    .content {
      margin-left: 0;
      max-width: 100%;
      padding: 18px 16px 36px;
    }
  }
</style>
