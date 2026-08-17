<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { fade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import logo from '../assets/logo_transparent_icon.png'
  import poweredByLogo from '../assets/dopmin_new_cqnknl.png'

  // Total time the splash stays on screen before it fades out.
  const HOLD_MS = 6000

  const dispatch = createEventDispatcher()
  let visible = true

  onMount(() => {
    const timer = setTimeout(() => {
      visible = false
    }, HOLD_MS)
    return () => clearTimeout(timer)
  })

  function handleOutroEnd() {
    dispatch('done')
  }
</script>

{#if visible}
  <div
    class="splash"
    out:fade={{ duration: 500, easing: cubicOut }}
    on:outroend={handleOutroEnd}
  >
    <div class="splash-content">
      <img class="splash-logo" src={logo} alt="Dopmin logo" />
    </div>

    <div class="splash-footer">
      <span class="powered-by-label">Powered by</span>
      <img class="powered-by-logo" src={poweredByLogo} alt="Dopmin" />
    </div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    overflow: hidden;
  }

  .splash-content {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .splash-logo {
    width: 160px;
    height: 160px;
    object-fit: contain;
    animation: breathe 2.6s ease-in-out infinite;
  }

  @keyframes breathe {
    0% {
      transform: scale(0.94);
      opacity: 0.85;
    }
    50% {
      transform: scale(1.04);
      opacity: 1;
    }
    100% {
      transform: scale(0.94);
      opacity: 0.85;
    }
  }

  .splash-footer {
    position: absolute;
    bottom: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .powered-by-label {
    font-family:
      'Inter',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Arial,
      Helvetica,
      sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9aa1ac;
  }

  .powered-by-logo {
    height: 46px;
    width: auto;
    object-fit: contain;
  }

  @media (prefers-reduced-motion: reduce) {
    .splash-logo {
      animation: none;
    }
  }
</style>
