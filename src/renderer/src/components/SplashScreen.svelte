<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import logo from '../assets/dopmin-logo.png'

  // How long the intro stays fully on screen before it slides away.
  // Kept inside the 3-5s window the total intro (in + hold + out) should
  // take, since the fly-in/out transitions add a bit more on either side.
  const HOLD_MS = 3200

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
    out:fly={{ y: -60, duration: 600, easing: cubicOut }}
    on:outroend={handleOutroEnd}
  >
    <div class="splash-glow"></div>

    <div class="splash-content">
      <img
        class="splash-logo"
        src={logo}
        alt="DopMin logo"
        in:fly={{ y: 24, duration: 550, delay: 120, easing: cubicOut }}
      />
      <h1 class="splash-title" in:fly={{ x: -40, duration: 550, delay: 320, easing: cubicOut }}>
        Dopmin Web Scraper
      </h1>
      <p class="splash-tag" in:fly={{ x: 40, duration: 550, delay: 480, easing: cubicOut }}>
        Local lead extraction, without the noise
      </p>
    </div>
  </div>
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1d2b53 0%, #3b82f6 55%, #6366f1 100%);
    overflow: hidden;
  }

  .splash-glow {
    position: absolute;
    width: 620px;
    height: 620px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 70%);
    filter: blur(2px);
  }

  .splash-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    padding: 0 24px;
  }

  .splash-logo {
    width: 84px;
    height: 84px;
    border-radius: 20px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
    margin-bottom: 6px;
  }

  .splash-title {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 2.1rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    color: #ffffff;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
  }

  .splash-tag {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 0.95rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
  }
</style>
