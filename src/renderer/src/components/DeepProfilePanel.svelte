<script>
  import { onMount } from 'svelte'

  export let url = ''
  export let leadName = ''
  export let showUrlInput = true
  export let autoRun = false

  let profileData = null
  let profileLoading = false
  let profileError = ''

  function resetResults() {
    profileData = null
    profileError = ''
  }

  async function runProfile() {
    const target = url.trim()
    if (!target || profileLoading) return

    profileLoading = true
    resetResults()

    try {
      const result = await window.api.runDeepProfile(target)
      if (!result || result.error) {
        profileError = result?.error || 'Could not profile this business.'
      } else {
        profileData = result
      }
    } catch (err) {
      profileError = err?.message || 'Could not profile this business.'
    } finally {
      profileLoading = false
    }
  }

  onMount(() => {
    if (autoRun && url.trim()) {
      runProfile()
    }
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
      <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || profileLoading}
        >{profileLoading ? 'Profiling…' : 'Run Deep Profile'}</button
      >
    </div>
  {:else}
    <div class="modal-lead-name">{leadName || url}</div>
    <button class="primary-btn" on:click={runProfile} disabled={!url.trim() || profileLoading}
      >{profileLoading ? 'Profiling…' : 'Run Deep Profile'}</button
    >
  {/if}

  {#if profileLoading}
    <p class="progress-line">Profiling business. Please wait…</p>
  {/if}

  {#if profileError}
    <p class="inline-error">{profileError}</p>
  {/if}

  {#if profileData?.candidates?.length}
    <div class="results">
      <h3>Analysis Report</h3>
      <div class="report-text">
        {profileData.candidates[0].content.parts[0].text}
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

  .progress-line {
    font-size: 0.82rem;
    color: var(--text-3);
    margin: 0;
  }

  .inline-error {
    font-size: 0.82rem;
    color: var(--red-dark);
    margin: 0;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 4px;
    border-top: 1px solid var(--border-soft);
  }

  .report-text {
    white-space: pre-wrap;
    line-height: 1.5;
    color: var(--text-1);
  }
</style>
