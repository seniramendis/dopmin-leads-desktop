<script>
  export let variant = 'info' // 'info' | 'error'
</script>

<div class="banner banner-{variant}">
  <slot />
</div>

<style>
  .banner {
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    font-size: 0.86rem;
  }

  .banner-info {
    background: var(--surface-soft);
    color: var(--text-2);
    border: 1px solid var(--border);
  }

  .banner-error {
    background: var(--red-soft);
    color: var(--red-dark);
    border: 1px solid var(--red-soft);
  }
</style>
