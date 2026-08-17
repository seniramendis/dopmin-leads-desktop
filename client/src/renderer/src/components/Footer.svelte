<script>
  const year = new Date().getFullYear()
</script>

<footer class="app-footer">
  <p class="copyright">© {year} Dopmin Technologies. All rights reserved.</p>
  <p class="disclaimer-note">
    Dopmin surfaces publicly available business listing data (via Google Maps) and automated,
    heuristic estimates (website audits, pitch suggestions) to help you prioritize outreach. None of
    it is verified, professionally audited, or guaranteed accurate or current — confirm details
    independently before relying on them. You're solely responsible for how you use this data and
    for complying with all applicable laws (including data protection and anti-spam/telemarketing
    rules such as GDPR, TCPA, or local equivalents) and the terms of any third-party service you
    contact leads through.
  </p>
</footer>

<style>
  .app-footer {
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .copyright {
    margin: 0;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-2);
  }

  .disclaimer-note {
    max-width: 820px;
  }
</style>
