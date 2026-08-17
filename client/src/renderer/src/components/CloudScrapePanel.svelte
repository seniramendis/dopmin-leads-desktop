<!-- src/renderer/src/components/CloudScrapePanel.svelte -->
<!--
  Triggers the free, serverless cloud pipeline (Vercel -> GitHub Actions ->
  Turso) instead of the local Playwright scraper, for targets that need the
  Ubuntu-runner IP / longer runtime. Polls window.api.cloudPollJob every 5s
  until the job finishes, matching the flow in the README.
-->
<script>
  let targetUrl = ''
  let jobId = null
  let status = 'idle' // idle | dispatching | running | done | error
  let leads = []
  let errorMessage = ''
  let pollHandle = null

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
  }

  async function pollOnce() {
    if (!jobId) return
    const result = await window.api.cloudPollJob(jobId)

    if (result.error) {
      status = 'error'
      errorMessage = result.error
      stopPolling()
      return
    }

    leads = result.leads || []

    if (result.status === 'done') {
      status = 'done'
      stopPolling()
    } else if (result.status === 'error') {
      status = 'error'
      errorMessage = result.error || 'The scrape job failed.'
      stopPolling()
    }
    // 'pending' / 'running' -> keep polling
  }

  async function startCloudScrape() {
    if (!targetUrl.trim()) return

    stopPolling()
    status = 'dispatching'
    errorMessage = ''
    leads = []
    jobId = null

    const result = await window.api.cloudTriggerScrape(targetUrl.trim())

    if (result.error) {
      status = 'error'
      errorMessage = result.error
      return
    }

    jobId = result.jobId
    status = 'running'
    pollHandle = setInterval(pollOnce, 5000)
    pollOnce() // don't wait a full 5s for the first check
  }
</script>

<div class="cloud-panel">
  <div class="cloud-header">
    <h3>Cloud Scrape</h3>
    <span class="badge">GitHub Actions</span>
  </div>

  <div class="cloud-form">
    <input
      type="text"
      placeholder="https://target-site.com"
      bind:value={targetUrl}
      disabled={status === 'dispatching' || status === 'running'}
    />
    <button
      on:click={startCloudScrape}
      disabled={!targetUrl.trim() || status === 'dispatching' || status === 'running'}
    >
      {status === 'dispatching' || status === 'running' ? 'Running…' : 'Start Cloud Scrape'}
    </button>
  </div>

  {#if status === 'dispatching'}
    <p class="status-line">Dispatching to GitHub Actions…</p>
  {:else if status === 'running'}
    <p class="status-line">Scraper is running on a GitHub Actions runner — polling every 5s…</p>
  {:else if status === 'done'}
    <p class="status-line success">Done — {leads.length} lead(s) found.</p>
  {:else if status === 'error'}
    <p class="status-line error">{errorMessage}</p>
  {/if}

  {#if leads.length > 0}
    <ul class="lead-list">
      {#each leads as lead (lead.id)}
        <li>
          <strong>{lead.name}</strong>
          {#if lead.rating}<span> · {lead.rating}★ ({lead.review_count})</span>{/if}
          {#if lead.phone}<span> · {lead.phone}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .cloud-panel {
    border: 1px solid var(--border-color, #2a2a35);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cloud-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cloud-header h3 {
    margin: 0;
    font-size: 15px;
  }

  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(120, 120, 255, 0.15);
    color: #a5a5ff;
  }

  .cloud-form {
    display: flex;
    gap: 8px;
  }

  .cloud-form input {
    flex: 1;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-color, #2a2a35);
    background: transparent;
  }

  .cloud-form button {
    padding: 8px 14px;
    border-radius: 6px;
    border: none;
    background: #4f46e5;
    color: white;
    cursor: pointer;
  }

  .cloud-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-line {
    margin: 0;
    font-size: 13px;
    opacity: 0.8;
  }

  .status-line.success {
    color: #4ade80;
  }

  .status-line.error {
    color: #f87171;
  }

  .lead-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
  }

  .lead-list li {
    font-size: 13px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
  }
</style>
