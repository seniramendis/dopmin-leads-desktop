<script>
  import { onMount } from 'svelte'

  export let onClose = () => {}

  let apiKey = ''
  let saved = false
  let loading = true

  let enableBrightDataFallback = false
  let brightDataEndpoint = ''
  let scrapeSaved = false

  onMount(async () => {
    apiKey = (await window.api.getApiKey?.()) || ''
    const scrapeSettings = await window.api.getScrapeSettings()
    enableBrightDataFallback = scrapeSettings.enableBrightDataFallback
    brightDataEndpoint = scrapeSettings.brightDataEndpoint
    loading = false
  })

  async function save() {
    await window.api.setApiKey(apiKey.trim())
    saved = true
    setTimeout(() => (saved = false), 1500)
  }

  async function saveScrapeSettings() {
    const result = await window.api.setScrapeSettings({ enableBrightDataFallback, brightDataEndpoint })
    enableBrightDataFallback = result.enableBrightDataFallback
    brightDataEndpoint = result.brightDataEndpoint
    scrapeSaved = true
    setTimeout(() => (scrapeSaved = false), 1500)
  }
</script>

<div class="overlay" role="presentation" on:click={onClose}>
  <div class="modal" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
    <div class="modal-header">
      <h2>Settings</h2>
      <button class="close-btn" on:click={onClose} aria-label="Close">✕</button>
    </div>

    <label class="field-label" for="scrape-mode">Search reliability</label>
    <p class="hint">
      Every search always runs on a local browser first — fastest, no account needed. If Google
      rate-limits or stalls a search, Dopmin can automatically switch the rest of that same
      search over to Bright Data's remote proxy browser instead of just failing. Off by default;
      turn it on and paste your Bright Data connection string once you have one.
    </p>

    {#if !loading}
      <label class="toggle-row">
        <input type="checkbox" bind:checked={enableBrightDataFallback} />
        <span>Automatically fall back to Bright Data if a search stalls</span>
      </label>

      {#if enableBrightDataFallback}
        <label class="field-label" for="bright-data-endpoint">Bright Data WS endpoint</label>
        <input
          id="bright-data-endpoint"
          type="password"
          bind:value={brightDataEndpoint}
          placeholder="wss://brd-customer-...-zone-...:PASSWORD@brd.superproxy.io:9222"
          autocomplete="off"
          spellcheck="false"
        />
        {#if !brightDataEndpoint}
          <p class="hint warn">
            No endpoint entered — the fallback won't actually trigger until you paste your
            Bright Data Scraping Browser connection string here.
          </p>
        {/if}
      {/if}

      <div class="modal-actions" style="margin-bottom: 20px;">
        <button class="primary-btn" on:click={saveScrapeSettings}
          >{scrapeSaved ? 'Saved ✓' : 'Save'}</button
        >
      </div>
    {/if}

    <hr class="divider" />

    <label class="field-label" for="gemini-key">Gemini API key (free tier)</label>
    <p class="hint">
      Powers the "AI pitch" button — a free key from
      <button
        class="link-btn"
        on:click={() => window.api?.openExternalLink('https://aistudio.google.com/apikey')}
        >Google AI Studio</button
      >
      lets Dopmin write a custom cold-outreach message for every lead at $0 cost. Stored encrypted
      via your OS keychain, never sent anywhere except Google's API.
    </p>

    {#if !loading}
      <input
        id="gemini-key"
        type="password"
        bind:value={apiKey}
        placeholder="AIza…"
        autocomplete="off"
        spellcheck="false"
      />
    {/if}

    <div class="modal-actions">
      <button class="secondary-btn" on:click={onClose}>Close</button>
      <button class="primary-btn" on:click={save}>{saved ? 'Saved ✓' : 'Save key'}</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 18, 22, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .modal {
    background: var(--surface);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    padding: 22px 24px;
    width: 420px;
    max-width: 92vw;
    max-height: 88vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text-1);
  }

  .close-btn {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-3);
  }

  .field-label {
    display: block;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-1);
    margin-bottom: 4px;
  }

  .hint {
    font-size: 0.78rem;
    color: var(--text-3);
    line-height: 1.4;
    margin: 0 0 10px;
  }

  .hint.warn {
    color: #b5462f;
  }

  .link-btn {
    border: none;
    background: none;
    padding: 0;
    color: var(--brand);
    font-size: inherit;
    cursor: pointer;
    text-decoration: underline;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    font-size: 0.84rem;
    color: var(--text-1);
    cursor: pointer;
  }

  .toggle-row input {
    width: auto;
    margin: 0;
  }

  .divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 18px 0;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 0.86rem;
    margin-bottom: 16px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .secondary-btn,
  .primary-btn {
    border-radius: var(--radius-sm);
    padding: 8px 16px;
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-1);
  }

  .primary-btn {
    background: var(--brand);
    border: 1px solid var(--brand);
    color: #fff;
  }
</style>

