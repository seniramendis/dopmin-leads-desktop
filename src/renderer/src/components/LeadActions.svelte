<script>
  export let lead

  let audit = null // last audit result for this lead, if run
  let auditLoading = false
  let auditError = ''

  const defaultMessage = () =>
    lead.hasWebsite
      ? `Hi ${lead.name}, I took a quick look at your website and spotted a few things costing you customers — want me to send over a free 1-page audit?`
      : `Hi ${lead.name}, I noticed your business doesn't have a website yet even with your Google reviews — want me to show you what a simple one could do for you?`

  function scoreClass(score) {
    if (score >= 80) return 'score-good'
    if (score >= 50) return 'score-mid'
    return 'score-bad'
  }

  async function runAudit() {
    if (!lead.hasWebsite || auditLoading) return
    auditLoading = true
    auditError = ''
    try {
      const result = await window.api.auditWebsite(lead.website)
      if (result.success) {
        audit = result
      } else {
        auditError = result.error || 'Audit failed.'
      }
    } catch (err) {
      auditError = err.message || 'Audit failed.'
    } finally {
      auditLoading = false
    }
  }

  function sendWhatsapp() {
    window.api.openWhatsapp({ phone: lead.phone, message: defaultMessage() })
  }

  $: hasPhone = /\d{7,}/.test((lead.phone || '').replace(/[^\d]/g, ''))
</script>

<div class="actions">
  <div class="actions-row">
    {#if lead.hasWebsite}
      <button
        class="chip"
        on:click={runAudit}
        disabled={auditLoading}
        title="Run free technical audit"
      >
        {#if auditLoading}Auditing…{:else if audit}Re-audit{:else}Audit site{/if}
      </button>
      {#if audit}
        <span class="score-badge {scoreClass(audit.score)}" title={audit.issues?.join(' • ')}>
          {audit.score}/100
        </span>
      {/if}
    {/if}

    <button
      class="chip chip-whatsapp"
      on:click={sendWhatsapp}
      disabled={!hasPhone}
      title={hasPhone ? 'Open WhatsApp with a pre-filled message' : 'No usable phone number'}
    >
      WhatsApp
    </button>
  </div>

  {#if auditError}
    <p class="inline-error">{auditError}</p>
  {/if}

  {#if audit && audit.issues?.length}
    <ul class="issue-list">
      {#each audit.issues as issue}
        <li>{issue}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 190px;
  }

  .actions-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 10px;
    background: var(--surface);
    color: var(--text-1);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .chip:hover:not(:disabled) {
    background: var(--surface-soft);
    border-color: var(--text-3);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chip-whatsapp {
    background: #e9fbf0;
    border-color: #bdeccf;
    color: #16803d;
  }

  .score-badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 8px;
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

  .inline-error {
    font-size: 0.74rem;
    color: var(--red-dark);
    margin: 0;
  }

  .issue-list {
    margin: 0;
    padding-left: 16px;
    font-size: 0.74rem;
    color: var(--text-2);
    max-width: 260px;
  }

  .issue-list li {
    margin-bottom: 2px;
  }
</style>
