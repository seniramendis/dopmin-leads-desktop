<script>
  export let variant = 'info' // 'info' | 'error'
</script>

<div class="banner banner-{variant}">
  <slot />
</div>

<style>
  .banner {
    padding: 12px 16px;
    border-radius: 10px;
  }

  .banner-info {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

  .banner-error {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }
</style>
