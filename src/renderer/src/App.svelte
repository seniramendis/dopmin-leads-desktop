<script>
  let query = ''
  let leads = []
  let loading = false

  // Svelte's reactive declarations automatically sort the data instantly
  $: noWebsiteLeads = leads.filter((lead) => !lead.hasWebsite)
  $: greatReviews = noWebsiteLeads.filter((lead) => lead.rating >= 4.5)
  $: badReviews = noWebsiteLeads.filter((lead) => lead.rating > 0 && lead.rating <= 3.5)

  async function handleScrape() {
    if (!query) return
    loading = true

    try {
      leads = await window.api.scrapeLeads(query)
    } catch (error) {
      console.error('Scraping failed:', error)
    } finally {
      loading = false
    }
  }
</script>

<main
  style="padding: 40px; font-family: Arial, sans-serif; background: #1a1a1a; color: #ffffff; min-height: 100vh;"
>
  <h1 style="color: #646cff; margin-bottom: 5px;">Lead Generation Dashboard</h1>
  <p style="color: #888; margin-bottom: 30px;">Filter local businesses missing websites.</p>

  <!-- Search Bar -->
  <div style="margin-bottom: 40px; display: flex; gap: 10px;">
    <input
      type="text"
      bind:value={query}
      placeholder="e.g. Dentists in Colombo"
      style="padding: 12px 16px; width: 400px; font-size: 16px; border-radius: 8px; border: 1px solid #333; background: #2a2a2a; color: white;"
    />
    <button
      on:click={handleScrape}
      disabled={loading}
      style="padding: 12px 24px; font-size: 16px; font-weight: bold; background: #646cff; color: white; border: none; border-radius: 8px; cursor: pointer; transition: 0.2s opacity;"
    >
      {loading ? 'Extracting from Maps...' : 'Find Leads'}
    </button>
  </div>

  <!-- Great Reviews Table -->
  <h2 style="color: #4caf50; border-bottom: 1px solid #333; padding-bottom: 10px;">
    🔥 Hot Leads (Great Reviews, No Website)
  </h2>
  <table
    style="width: 100%; border-collapse: collapse; margin-bottom: 50px; text-align: left; background: #222; border-radius: 8px; overflow: hidden;"
  >
    <thead style="background: #2a2a2a;">
      <tr>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Business Name</th>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Rating</th>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Raw Details</th>
      </tr>
    </thead>
    <tbody>
      {#if greatReviews.length === 0}
        <tr
          ><td colspan="3" style="padding: 16px; text-align: center; color: #666;"
            >No results found yet.</td
          ></tr
        >
      {/if}
      {#each greatReviews as lead (lead.name)}
        <tr style="border-top: 1px solid #333;">
          <td style="padding: 16px; font-weight: bold;">{lead.name}</td>
          <td style="padding: 16px; color: #ffca28; font-weight: bold;">⭐ {lead.rating}</td>
          <td style="padding: 16px; font-size: 13px; color: #999; line-height: 1.4;"
            >{lead.rawDetails.substring(0, 100)}...</td
          >
        </tr>
      {/each}
    </tbody>
  </table>

  <!-- Bad Reviews Table -->
  <h2 style="color: #f44336; border-bottom: 1px solid #333; padding-bottom: 10px;">
    ⚠️ Reputation Clients (Bad Reviews, No Website)
  </h2>
  <table
    style="width: 100%; border-collapse: collapse; text-align: left; background: #222; border-radius: 8px; overflow: hidden;"
  >
    <thead style="background: #2a2a2a;">
      <tr>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Business Name</th>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Rating</th>
        <th style="padding: 16px; font-weight: 600; color: #bbb;">Raw Details</th>
      </tr>
    </thead>
    <tbody>
      {#if badReviews.length === 0}
        <tr
          ><td colspan="3" style="padding: 16px; text-align: center; color: #666;"
            >No results found yet.</td
          ></tr
        >
      {/if}
      {#each badReviews as lead (lead.name)}
        <tr style="border-top: 1px solid #333;">
          <td style="padding: 16px; font-weight: bold;">{lead.name}</td>
          <td style="padding: 16px; color: #ffca28; font-weight: bold;">⭐ {lead.rating}</td>
          <td style="padding: 16px; font-size: 13px; color: #999; line-height: 1.4;"
            >{lead.rawDetails.substring(0, 100)}...</td
          >
        </tr>
      {/each}
    </tbody>
  </table>
</main>
