<!-- src/renderer/src/components/SearchPanel.svelte -->
<script>
  import { searchCategory, searchRegion } from '../lib/stores.js'

  let activeTab = 'maps'

  // Tab 1: Local Google Maps State
  let searchQuery = 'hardware stores in Mount'
  let maxResults = 30

  // Tab 2: IT Projects State
  let projectSource = 'rfp_boards'
  let industry = 'healthcare'
  let isScanning = false

  async function handleMapsSearch() {
    isScanning = true
    try {
      await window.api.startMapsScrape({
        query: searchQuery,
        maxResults,
        region: $searchRegion
      })
    } catch (err) {
      console.error('Maps search error:', err)
    } finally {
      isScanning = false
    }
  }

  async function handleProjectSearch() {
    isScanning = true
    try {
      await window.api.startProjectScrape({
        category: $searchCategory,
        region: $searchRegion,
        source: projectSource,
        industry
      })
    } catch (err) {
      console.error('Project search error:', err)
    } finally {
      isScanning = false
    }
  }
</script>

<div class="panel-container">
  <!-- Segmented Tab Toggle -->
  <div class="tabs-wrapper">
    <button
      class="tab-btn {activeTab === 'maps' ? 'active' : ''}"
      on:click={() => (activeTab = 'maps')}
    >
      Local Business Search (Google Maps)
    </button>
    <button
      class="tab-btn {activeTab === 'projects' ? 'active' : ''}"
      on:click={() => (activeTab = 'projects')}
    >
      IT Projects & RFPs Finder
    </button>
  </div>

  <div class="dopmin-card">
    <!-- ================================================================= -->
    <!-- TAB 1: ORIGINAL GOOGLE MAPS SEARCH                                -->
    <!-- ================================================================= -->
    {#if activeTab === 'maps'}
      <div class="card-header">
        <h3>New search</h3>
        <p>Extract and qualify local business leads from Google Maps</p>
      </div>

      <div class="form-grid">
        <div class="input-group">
          <label>Search Query / Location</label>
          <input type="text" bind:value={searchQuery} placeholder="e.g. Mount Lavinia" />
        </div>

        <div class="input-group">
          <label>Region</label>
          <select bind:value={$searchRegion}>
            <option value="local">Sri Lanka</option>
            <option value="australia">Australia</option>
            <option value="new_zealand">New Zealand</option>
            <option value="dubai">Dubai (UAE)</option>
            <option value="usa">USA</option>
            <option value="europe">Europe</option>
          </select>
        </div>

        <div class="input-group">
          <label>Max Results</label>
          <input type="number" bind:value={maxResults} />
        </div>
      </div>

      <div class="card-footer">
        <p class="helper-text">
          Results are pulled directly from Google Maps listings. Search terms like town names expand
          automatically across matching local categories.
        </p>
        <button class="primary-btn" on:click={handleMapsSearch} disabled={isScanning}>
          {isScanning ? 'Scanning...' : 'Search Maps'}
        </button>
      </div>

      <!-- ================================================================= -->
      <!-- TAB 2: DEDICATED IT PROJECTS & RFP FINDER                        -->
      <!-- ================================================================= -->
    {:else if activeTab === 'projects'}
      <div class="card-header">
        <h3>Targeted Project Search</h3>
        <p>Scan B2B listings, tenders, and client project briefs</p>
      </div>

      <div class="form-grid four-cols">
        <div class="input-group">
          <label>Project Platform</label>
          <select bind:value={projectSource}>
            <option value="rfp_boards">Public RFPs & Tender Boards</option>
            <option value="b2b_directories">B2B Directories (Clutch, etc)</option>
            <option value="freelance_contracts">Enterprise Contract Boards</option>
          </select>
        </div>

        <div class="input-group">
          <label>Service Category</label>
          <select bind:value={$searchCategory}>
            <option value="mobile_apps">Mobile Apps</option>
            <option value="mid_size_it">Mid-Size IT Projects</option>
            <option value="ai_agents">AI Agents</option>
          </select>
        </div>

        <div class="input-group">
          <label>Industry</label>
          <select bind:value={industry}>
            <option value="healthcare">Healthcare & Medical</option>
            <option value="ecommerce">E-commerce & Retail</option>
            <option value="finance">Finance & Fintech</option>
            <option value="real_estate">Real Estate</option>
            <option value="agritech">Agriculture & AgriTech</option>
          </select>
        </div>

        <div class="input-group">
          <label>Target Region</label>
          <select bind:value={$searchRegion}>
            <option value="local">Sri Lanka</option>
            <option value="australia">Australia</option>
            <option value="new_zealand">New Zealand</option>
            <option value="dubai">Dubai (UAE)</option>
            <option value="usa">USA</option>
            <option value="europe">Europe</option>
          </select>
        </div>
      </div>

      <div class="card-footer">
        <p class="helper-text">
          Filters target active project postings directly across designated directories while
          automatically filtering out blog articles.
        </p>
        <button class="primary-btn" on:click={handleProjectSearch} disabled={isScanning}>
          {isScanning ? 'Finding Projects...' : 'Find IT Projects'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Base Container */
  .panel-container {
    width: 100%;
    margin-bottom: 24px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  /* Segmented Tabs */
  .tabs-wrapper {
    display: inline-flex;
    gap: 4px;
    background-color: #f3f4f6;
    padding: 6px;
    border-radius: 8px;
    margin-bottom: 20px;
    border: 1px solid #e5e7eb;
  }

  .tab-btn {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tab-btn:hover:not(.active) {
    color: #374151;
  }

  .tab-btn.active {
    background-color: #ffffff;
    color: #111827;
    border-color: #e5e7eb;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  /* Main Card */
  .dopmin-card {
    background-color: #ffffff;
    border: 1px solid #f3f4f6;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }

  .card-header h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 700;
    color: #111827;
  }

  .card-header p {
    margin: 0 0 24px 0;
    font-size: 13px;
    color: #9ca3af;
  }

  /* Form Grid */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .form-grid.four-cols {
    grid-template-columns: repeat(4, 1fr);
  }

  /* Inputs & Labels */
  .input-group {
    display: flex;
    flex-direction: column;
  }

  .input-group label {
    font-size: 11px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }

  .input-group input,
  .input-group select {
    padding: 10px 14px;
    font-size: 14px;
    color: #374151;
    background-color: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .input-group input:focus,
  .input-group select:focus {
    border-color: #d95338;
  }

  /* Footer & Buttons */
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 24px;
  }

  .helper-text {
    font-size: 12px;
    color: #9ca3af;
    margin: 0;
    max-width: 70%;
    line-height: 1.5;
  }

  .primary-btn {
    background-color: #d95338;
    color: #ffffff;
    font-weight: 600;
    font-size: 14px;
    padding: 10px 24px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    white-space: nowrap;
  }

  .primary-btn:hover {
    background-color: #c2462d;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
